import express from 'express';
import path from 'path';
import fs from 'fs';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const __dirname = path.resolve();

interface PushSubscriptionContainer {
  id: string;
  subscription: webpush.PushSubscription;
  userId: string;
  isPro: boolean;
  updatedAt: string;
}

// 1. CARREGAR OU GERAR CHAVES VAPID ESTÁVEIS (vapid_keys.json)
const VAPID_KEYS_FILE = path.join(__dirname, 'vapid_keys.json');
let vapidKeys = { publicKey: '', privateKey: '' };

if (fs.existsSync(VAPID_KEYS_FILE)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, 'utf-8'));
    console.log('[Push Server] Chaves VAPID estáveis carregadas com sucesso.');
  } catch (err) {
    console.error('[Push Server] Erro ao ler vapid_keys.json, gerando novas...', err);
  }
}

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
  console.log('[Push Server] Novas chaves VAPID estáveis geradas e persistidas.');
}

// Configurar detalhes globais de VAPID
webpush.setVapidDetails(
  'mailto:info@atrioswork.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// 2. CARREGAR SUBSCRIPÇÕES DE DISPOSITIVOS PERSISTENTES (push_subscriptions.json)
const STORAGE_FILE = path.join(__dirname, 'push_subscriptions.json');

function loadSubscriptions(): PushSubscriptionContainer[] {
  if (!fs.existsSync(STORAGE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
  } catch (e) {
    console.warn('[Push Server] Falha ao ler push_subscriptions.json, retornando vazio.');
    return [];
  }
}

function saveSubscriptions(subs: PushSubscriptionContainer[]) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Push Server] Falha ao gravar push_subscriptions.json:', err);
  }
}

// 3. REGISTAR HISTÓRICO DE ENVIADOS (sent_push_ids.json) PARA EVITAR DUPLICIDADE
const SENT_IDS_FILE = path.join(__dirname, 'sent_push_ids.json');
function loadSentBannerIds(): string[] {
  if (!fs.existsSync(SENT_IDS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SENT_IDS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}
function saveSentBannerId(id: string) {
  const current = loadSentBannerIds();
  if (!current.includes(id)) {
    current.push(id);
    fs.writeFileSync(SENT_IDS_FILE, JSON.stringify(current, null, 2), 'utf-8');
  }
}

async function startServer() {
  const app = express();

  // Middleware para JSON com limite maior para garantir payloads normais
  app.use(express.json());

  // API 1: Enviar Chave Pública para o App
  app.get('/api/push/public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // API 2: Subscrever dispositivo / Sincronizar Token
  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, userId, isPro } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Assinatura inválida.' });
    }

    const subs = loadSubscriptions();
    // Impedir registros duplicados de mesma URL endpoint
    const existingIndex = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);

    const subscriptionData: PushSubscriptionContainer = {
      id: existingIndex >= 0 ? subs[existingIndex].id : `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscription,
      userId: userId || 'anonymous',
      isPro: typeof isPro === 'boolean' ? isPro : false,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      subs[existingIndex] = subscriptionData;
    } else {
      subs.push(subscriptionData);
    }

    saveSubscriptions(subs);
    console.log(`[Push Central] Dispositivo registado/atualizado. Total ativo: ${subs.length}`);
    res.json({ success: true, deviceId: subscriptionData.id });
  });

  // API 3: Desinscrever ou remover dispositivo caso solicitado explicitamente
  app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

    let subs = loadSubscriptions();
    const beforeCount = subs.length;
    subs = subs.filter(s => s.subscription.endpoint !== endpoint);
    
    if (subs.length !== beforeCount) {
      saveSubscriptions(subs);
      console.log(`[Push Central] Dispositivo desinstalado. Ativos: ${subs.length}`);
    }
    res.json({ success: true });
  });

  // API 4: Rota de Notificação Manual / Disparo Geral ou segmentado
  app.post('/api/push/send-broadcast', async (req, res) => {
    const { title, body, bannerId, userType } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Faltam campos essenciais no payload' });
    }

    const totalSent = await deliverPushToDevices({ title, body, bannerId, userType });
    res.json({ success: true, totalDevicesNotified: totalSent });
  });

  // Função central de despacho físico via Web Push (Google FCM, Apple APNS, Mozilla)
  async function deliverPushToDevices(payload: { title: string; body: string; bannerId?: string; userType?: string }) {
    const { title, body, bannerId, userType } = payload;
    let subs = loadSubscriptions();
    if (subs.length === 0) return 0;

    // Segmentar dispositivos baseado no userType do banner
    // Tipo: 'all', 'premium', 'free', 'public', etc.
    const target = userType || 'all';
    const filteredSubs = subs.filter(sub => {
      if (target === 'all' || target === 'push_notification' || target === 'public') return true;
      if (target === 'premium' && sub.isPro) return true;
      if (target === 'free' && !sub.isPro) return true;
      return false;
    });

    console.log(`[Push Engine] Iniciando envio físico para ${filteredSubs.length} aparelhos de público: [${target}]`);
    let count = 0;
    const obsoleteEndpoints: string[] = [];

    const pushPayload = JSON.stringify({
      title,
      body,
      url: '/'
    });

    await Promise.all(
      filteredSubs.map(async (container) => {
        try {
          await webpush.sendNotification(container.subscription, pushPayload);
          count++;
        } catch (err: any) {
          // Lógica de auto-pruning de aparelhos obsoletos (status 410 / 404)
          // FCM (Google) ou Mozilla retornam 410 se a subscrição expirou ou desinstalou
          if (err.statusCode === 410 || err.statusCode === 404) {
            obsoleteEndpoints.push(container.subscription.endpoint);
          } else {
            console.warn(`[Push Engine] Falha no envio para dispositivo do usuário ${container.userId}:`, err.message);
          }
        }
      })
    );

    // Prunar endpoints fora de serviço
    if (obsoleteEndpoints.length > 0) {
      const freshSubs = subs.filter(s => !obsoleteEndpoints.includes(s.subscription.endpoint));
      saveSubscriptions(freshSubs);
      console.log(`[Push Engine Auto-Pruning] Limpamos ${obsoleteEndpoints.length} tokens desinstalados ou expirados.`);
    }

    if (bannerId) {
      saveSentBannerId(bannerId);
    }

    return count;
  }

  // 4. POLLED SUPABASE BACKUP LOOP - Verifica a tabela app_banners a cada 20 segundos
  // Garante que mesmo que o Painel insira diretamente no Supabase ou de forma assíncrona,
  // os telemóveis/computadores desligados recebem imediatamente o empurrão!
  setInterval(async () => {
    try {
      const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
      const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';
      
      const restUrl = `${supabaseUrl}/rest/v1/app_banners?is_active=eq.true&order=created_at.desc&limit=10`;
      const response = await fetch(restUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (!response.ok) return;
      const data: any[] = await response.json();
      if (!data || data.length === 0) return;

      const sentIds = loadSentBannerIds();

      for (const banner of data) {
        // Ignorar se já disparado
        if (sentIds.includes(banner.id)) continue;

        // Descompatibilizar o user_type
        let user_type = 'all';
        let cta_link = banner.cta_link || '';
        if (cta_link.includes('||user_type:')) {
          const parts = cta_link.split('||user_type:');
          cta_link = parts[0];
          user_type = parts[1];
        }

        const isPush = user_type === 'push_notification' || 
                       banner.title.toUpperCase().includes('[PUSH]') || 
                       (banner.highlight && banner.highlight.toUpperCase().includes('[PUSH]'));

        if (banner.is_active && isPush) {
          const cleanTitle = banner.title.replace('[PUSH]', '').replace('[push]', '').trim();
          const cleanBody = `${banner.highlight || ''} ${banner.subtitle || ''}`.trim();

          console.log(`[Polled Supabase Gateway] Novo push detectado via DB: "${cleanTitle}". Disparando agora!`);
          
          // Despachar a todos aparelhos compatíveis
          await deliverPushToDevices({
            title: cleanTitle,
            body: cleanBody,
            bannerId: banner.id,
            userType: user_type
          });
        } else {
          // Se não for push, marcar como visto/processado para saltar verificações futuras
          saveSentBannerId(banner.id);
        }
      }
    } catch (err: any) {
      // Ignorar erros na checagem em background silenciosa
    }
  }, 20000);

  // 5. CONFIGURAÇÃO DE ROTEAMENTO VITE MIDDLEWARE OU ARQUIVOS ESTÁTICOS
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log('[Vite Development] Middleware montado.');
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Vite Production] Servindo ficheiros estáticos da pasta dist.');
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PWA Server] AtriosWork central a correr em http://localhost:${PORT}`);
  });
}

startServer();
