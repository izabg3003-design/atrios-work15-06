import express from 'express';
import path from 'path';
import fs from 'fs';
import webpush from 'web-push';

const PORT = 3000;
const __dirname = path.resolve();

interface PushSubscriptionContainer {
  id: string;
  subscription: webpush.PushSubscription;
  userId: string;
  isPro: boolean;
  updatedAt: string;
}

// Chaves VAPID globais (carregadas assincronamente da BD na inicialização)
let vapidKeys = { publicKey: '', privateKey: '' };

const STORAGE_FILE = path.join(__dirname, 'push_subscriptions.json');
const SENT_IDS_FILE = path.join(__dirname, 'sent_push_ids.json');

// Supabase REST details
const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

// A. INICIALIZAR E RECUPERAR CHAVES VAPID DA BASE DE DADOS (SUPABASE)
async function initVapidKeys() {
  // 1. Tentar ler do Supabase na tabela app_banners (onde salvamos como chave-valor de sistema)
  try {
    const checkUrl = `${supabaseUrl}/rest/v1/app_banners?title=eq.%5BSYSTEM_VAPID_KEYS_CONFIG%5D&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(checkUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const records = await response.json();
      if (records && records.length > 0) {
        vapidKeys.publicKey = records[0].highlight;
        vapidKeys.privateKey = records[0].subtitle;
        console.log('[Push Server - Supabase] Chaves VAPID estáveis recuperadas com sucesso da BD!');
        return;
      }
    }
  } catch (err: any) {
    console.error('[Push Server - Supabase] Falha ao conectar ao Supabase para ler chaves VAPID:', err.message);
  }

  // 2. Se falhar ou não existir, verificar se existe localmente em vapid_keys.json
  const VAPID_KEYS_FILE = path.join(__dirname, 'vapid_keys.json');
  if (fs.existsSync(VAPID_KEYS_FILE)) {
    try {
      const localKeys = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, 'utf-8'));
      if (localKeys.publicKey && localKeys.privateKey) {
        vapidKeys.publicKey = localKeys.publicKey;
        vapidKeys.privateKey = localKeys.privateKey;
        console.log('[Push Server - Local] Chaves VAPID estáveis carregadas do arquivo local.');
      }
    } catch (err) {
      console.error('[Push Server - Local] Erro ao ler file local:', err);
    }
  }

  // 3. Se não existir em nenhum lugar, gerar novas estáveis
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    const keys = webpush.generateVAPIDKeys();
    vapidKeys.publicKey = keys.publicKey;
    vapidKeys.privateKey = keys.privateKey;
    console.log('[Push Server] Novas chaves VAPID estáveis criadas e configuradas de origem.');
  }

  // 4. Salvar localmente
  try {
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Push Server] Erro ao escrever chaves locais:', err);
  }

  // 5. Salvar na BD Supabase para futuras instâncias se não veio de lá
  try {
    const insertUrl = `${supabaseUrl}/rest/v1/app_banners`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: '[SYSTEM_VAPID_KEYS_CONFIG]',
        highlight: vapidKeys.publicKey,
        subtitle: vapidKeys.privateKey,
        cta_text: 'system',
        cta_link: 'system||user_type:push_notification',
        theme_color: 'emerald',
        is_active: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (response.ok) {
      console.log('[Push Server - Supabase] Chaves VAPID gravadas na base de dados para garantir persistência 100%!');
    }
  } catch (err: any) {
    console.error('[Push Server - Supabase] Erro ao sincronizar chaves VAPID para cima:', err.message);
  }
}

// B. CONTROLO DE DISPOSITIVOS EM BASE DE DADOS (SUPABASE)
async function syncSubscriptionToSupabase(container: PushSubscriptionContainer) {
  try {
    const endpoint = container.subscription.endpoint;
    
    // Verificar se já existe uma assinatura registada com esse endpoint
    const checkUrl = `${supabaseUrl}/rest/v1/app_banners?highlight=eq.${encodeURIComponent(endpoint)}&title=like.%5BDEVICE_SUB%5D%25&limit=1`;
    const checkResp = await fetch(checkUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    let existingRowId = null;
    if (checkResp.ok) {
      const records = await checkResp.json();
      if (records && records.length > 0) {
        existingRowId = records[0].id;
      }
    }

    const payload = {
      title: `[DEVICE_SUB]_${container.id}`,
      highlight: endpoint,
      subtitle: JSON.stringify(container.subscription),
      cta_text: container.userId || 'anonymous',
      cta_link: `${container.isPro ? 'premium' : 'free'}||user_type:push_notification`,
      theme_color: 'purple',
      is_active: false
    };

    if (existingRowId) {
      // Atualizar record existente
      const updateUrl = `${supabaseUrl}/rest/v1/app_banners?id=eq.${existingRowId}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Push DB Sync] Dispositivo atualizado na BD para o utilizador ${container.userId}`);
    } else {
      // Inserir novo record
      const insertUrl = `${supabaseUrl}/rest/v1/app_banners`;
      await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Push DB Sync] Novo dispositivo inserido com sucesso na BD para o utilizador ${container.userId}`);
    }
  } catch (err: any) {
    console.error('[Push DB Sync] Falha ao sincronizar dispositivo com a BD do Supabase:', err.message);
  }
}

async function deleteSubscriptionFromSupabase(endpoint: string) {
  try {
    const deleteUrl = `${supabaseUrl}/rest/v1/app_banners?highlight=eq.${encodeURIComponent(endpoint)}`;
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    console.log('[Push DB Sync] Dispositivo obsoleto/removido limpo com segurança da BD.');
  } catch (err: any) {
    console.error('[Push DB Sync] Falha ao apagar dispositivo obsoleto da BD:', err.message);
  }
}

async function fetchSubscriptionsFromSupabase(): Promise<PushSubscriptionContainer[]> {
  try {
    const fetchUrl = `${supabaseUrl}/rest/v1/app_banners?select=*`;
    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (response.ok) {
      const allRecords = await response.json();
      const records = (allRecords || []).filter((r: any) => r.title && r.title.startsWith('[DEVICE_SUB]'));
      const subs: PushSubscriptionContainer[] = [];
      
      for (const record of records) {
        try {
          const subscription = JSON.parse(record.subtitle);
          let cta_link = record.cta_link || '';
          if (cta_link.includes('||user_type:')) {
            cta_link = cta_link.split('||user_type:')[0];
          }
          subs.push({
            id: record.title.replace('[DEVICE_SUB]_', ''),
            subscription,
            userId: record.cta_text || 'anonymous',
            isPro: cta_link === 'premium',
            updatedAt: record.created_at || new Date().toISOString()
          });
        } catch (e) {
          // Ignorado
        }
      }
      return subs;
    }
  } catch (err: any) {
    console.error('[Push DB Sync] Erro ao buscar lista de dispositvos PWA na BD:', err.message);
  }
  return [];
}

// C. COMPLEMENTO LOCAL (FS-ACCELERATOR)
function loadSubscriptions(): PushSubscriptionContainer[] {
  if (!fs.existsSync(STORAGE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function saveSubscriptions(subs: PushSubscriptionContainer[]) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Push Server] Falha ao gravar local file subscriptions:', err);
  }
}

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
  app.use(express.json());

  // PRIMEIRA FASE: Garantir chaves VAPID estáveis e idênticas no arranque (Lê de Supabase/Arquivo)
  await initVapidKeys();

  // Configurar detalhes globais de VAPID
  webpush.setVapidDetails(
    'mailto:info@atrioswork.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // API 1: Enviar Chave Pública para o App
  app.get('/api/push/public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // API 2: Subscrever dispositivo / Sincronizar Token (Chamado silenciosamente no App.tsx / PushNotificationManager)
  app.post('/api/push/subscribe', async (req, res) => {
    const { subscription, userId, isPro } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Assinatura inválida.' });
    }

    const subs = loadSubscriptions();
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

    // Salvar localmente no container
    saveSubscriptions(subs);
    
    // SALVAR PERSISTENTEMENTE EM SUPABASE (Garante que se desliga ou recarrega o servidor, a ligação continua activa!)
    await syncSubscriptionToSupabase(subscriptionData);

    console.log(`[PWA Subscribe] Dispositivo registado nos canais. ID: ${subscriptionData.id}`);
    res.json({ success: true, deviceId: subscriptionData.id });
  });

  // API 3: Desinscrever voluntariamente ou desligar canal push
  app.post('/api/push/unsubscribe', async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

    let subs = loadSubscriptions();
    subs = subs.filter(s => s.subscription.endpoint !== endpoint);
    saveSubscriptions(subs);

    // Apagar também da BD geral
    await deleteSubscriptionFromSupabase(endpoint);

    res.json({ success: true });
  });

  // API 4: Rota de Notificação Manual de Administrador (Geral ou em Segmentos)
  app.post('/api/push/send-broadcast', async (req, res) => {
    try {
      const { title, body, bannerId, userType } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: 'Faltam campos essenciais no payload' });
      }

      console.log(`[Push Broadcast Route] Disparando broadcast para: ${title}`);
      const totalSent = await deliverPushToDevices({ title, body, bannerId, userType });
      res.json({ success: true, totalDevicesNotified: totalSent });
    } catch (routeErr: any) {
      console.error('[Push Broadcast API] Erro no endpoint:', routeErr);
      res.status(500).json({ error: routeErr.message || 'Erro interno no servidor de push' });
    }
  });

  // FUNÇÃO DE ENVIO FÍSICO COM AUTO-PRUNING SE REJEITADO (Status 410 / 404 por FCM/APNS)
  async function deliverPushToDevices(payload: { title: string; body: string; bannerId?: string; userType?: string }) {
    try {
      const { title, body, bannerId, userType } = payload;
      
      // Obter toda a lista unificada de dispositivos registrados do Supabase (Survive restarts!)
      const subs = await fetchSubscriptionsFromSupabase();
      if (subs.length === 0) {
        console.log('[Push Engine] Nenhum dispositivo PWA registado na base de dados.');
        return 0;
      }

      const target = userType || 'all';
      const filteredSubs = subs.filter(sub => {
        if (!sub || !sub.subscription) return false;
        if (target === 'all' || target === 'push_notification' || target === 'public') return true;
        if (target === 'premium' && sub.isPro) return true;
        if (target === 'free' && !sub.isPro) return true;
        return false;
      });

      console.log(`[Push Engine] Enviando mensagem física para ${filteredSubs.length} receptor(es) activo(s) sob espectro: [${target}]`);
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
            if (!container || !container.subscription || !container.subscription.endpoint) {
              return;
            }
            await webpush.sendNotification(container.subscription, pushPayload);
            count++;
          } catch (err: any) {
            // Remover automatizado se utilizador desinstalou a PWA (HTTP 410 / 404)
            const statusCode = err && typeof err === 'object' ? err.statusCode : undefined;
            const errMsg = err && typeof err === 'object' ? err.message : String(err);
            if (statusCode === 410 || statusCode === 404) {
              obsoleteEndpoints.push(container.subscription.endpoint);
            } else {
              console.warn(`[Push Engine] Falha física canal para ${container.userId}:`, errMsg);
            }
          }
        })
      );

      // Prunar dispositivos obsoletos do Supabase e cache se houver
      if (obsoleteEndpoints.length > 0) {
        for (const obsEndpoint of obsoleteEndpoints) {
          try {
            await deleteSubscriptionFromSupabase(obsEndpoint);
          } catch (delErr: any) {
            console.error('[Push Engine] Erro ao deletar sub obsoleta:', delErr.message || delErr);
          }
        }
        
        try {
          const localSubs = loadSubscriptions();
          const freshLocal = localSubs.filter(s => s && s.subscription && !obsoleteEndpoints.includes(s.subscription.endpoint));
          saveSubscriptions(freshLocal);
        } catch (localErr: any) {
          console.error('[Push Engine] Erro ao sincronizar subs locais pós-prune:', localErr.message || localErr);
        }
      }

      if (bannerId) {
        try {
          saveSentBannerId(bannerId);
        } catch (bannerErr: any) {
          console.error('[Push Engine] Erro ao salvar id do banner enviado:', bannerErr.message || bannerErr);
        }
      }

      return count;
    } catch (engineErr: any) {
      console.error('[Push Engine] Erro crítico no motor de entrega:', engineErr);
      return 0;
    }
  }

  // 4. SUPABASE SYNC LOOP - Monitoriza e despacha a cada 20 segundos
  setInterval(async () => {
    try {
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
        // Ignorar se já despachado
        if (sentIds.includes(banner.id)) continue;

        // Descompactar user_type
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

          console.log(`[PWA DB Poller] Novo aviso detectado no painel: "${cleanTitle}". Disparando transmissão física...`);
          
          await deliverPushToDevices({
            title: cleanTitle,
            body: cleanBody,
            bannerId: banner.id,
            userType: user_type
          });
        } else {
          // Se for banner normal (visual e não push), registar como processado para não travar
          saveSentBannerId(banner.id);
        }
      }
    } catch (err: any) {
      // Silencioso
    }
  }, 20000);

  // 5. CONFIGURAÇÃO DE ROTEAMENTO VITE MIDDLEWARE OU PASTAS ESTÁTICAS EM PRODUÇÃO
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log('[Vite Development] Middleware inicializado.');
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Vite Production] Servindo ficheiros estáticos da pasta dist.');
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PWA Server] Send Push central a correr em http://localhost:${PORT}`);
  });
}

startServer();
