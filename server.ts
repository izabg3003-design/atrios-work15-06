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

// Chaves VAPID globais (carregadas assincronamente da BD na inicialização)
let vapidKeys = { publicKey: '', privateKey: '' };

const STORAGE_FILE = path.join(__dirname, 'push_subscriptions.json');
const SENT_IDS_FILE = path.join(__dirname, 'sent_push_ids.json');

// Supabase REST details
const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

// A. INICIALIZAR E RECUPERAR CHAVES VAPID DA BASE DE DADOS OU FICHEIRO LOCAL GERAL
async function initVapidKeys() {
  const keysPath = path.join(__dirname, 'vapid_keys.json');

  // Se o ficheiro de chaves já existe, recuperá-las para manter os tokens utilizadores 100% válidos
  if (fs.existsSync(keysPath)) {
    try {
      const persistedKeys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
      if (persistedKeys.publicKey && persistedKeys.privateKey) {
        vapidKeys.publicKey = persistedKeys.publicKey;
        vapidKeys.privateKey = persistedKeys.privateKey;
        console.log('[Push Server] Chaves VAPID estáveis e únicas carregadas com sucesso absoluto de vapid_keys.json!');
        return;
      }
    } catch (err: any) {
      console.error('[Push Server] Erro ao ler chaves do ficheiro vapid_keys.json, a recriar:', err.message);
    }
  }

  // Senão, gera um novo par estável e persiste localmente na infraestrutura
  try {
    const generated = webpush.generateVAPIDKeys();
    vapidKeys.publicKey = generated.publicKey;
    vapidKeys.privateKey = generated.privateKey;
    fs.writeFileSync(keysPath, JSON.stringify(generated, null, 2), 'utf-8');
    console.log('[Push Server] Novas chaves criptográficas VAPID geradas e persistidas com sucesso em vapid_keys.json!');
  } catch (err: any) {
    console.error('[Push Server] Erro ao gerar chaves VAPID de forma autónoma:', err.message);
    // Fallback de chaves estáveis para predefinidas em ambiente de produção resiliente
    vapidKeys.publicKey = 'BNi2V3wyA4IGCBM_djIm4ZbMOygiu-Oh-2SPU1jVd82yq7J9ts4sF6cQmIrPAXU8eHhamfsJV7SaQLURaR20zkE';
    vapidKeys.privateKey = '6j5FNcDexsNTUsGe_4f2vVVtvrgXWXXofKkgiLzQhNQ';
    console.log('[Push Server] Chave Master estável de produção de fallback inicializada localmente com sucesso absoluto!');
  }
}

// B. CONTROLO DE DISPOSITIVOS EM BASE DE DADOS (SUPABASE - TABELA DEDICADA)
async function syncSubscriptionToSupabase(container: PushSubscriptionContainer) {
  try {
    const endpoint = container.subscription.endpoint;
    
    // Verificar se já existe uma assinatura registada com esse endpoint na nova tabela push_subscriptions
    const checkUrl = `${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`;
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
      device_id: container.id,
      endpoint: endpoint,
      subscription: typeof container.subscription === 'string' ? container.subscription : JSON.stringify(container.subscription),
      user_id: container.userId || 'anonymous',
      is_pro: container.isPro,
      updated_at: new Date().toISOString()
    };

    if (existingRowId) {
      // Atualizar record existente
      const updateUrl = `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${existingRowId}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Push DB Sync] Dispositivo atualizado na BD push_subscriptions para o utilizador ${container.userId}`);
    } else {
      // Inserir novo record
      const insertUrl = `${supabaseUrl}/rest/v1/push_subscriptions`;
      await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Push DB Sync] Novo dispositivo inserido com sucesso na BD push_subscriptions para o utilizador ${container.userId}`);
    }
  } catch (err: any) {
    console.error('[Push DB Sync] Falha ao sincronizar dispositivo com a BD do Supabase:', err.message);
  }
}

async function deleteSubscriptionFromSupabase(endpoint: string) {
  try {
    const deleteUrl = `${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`;
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    console.log('[Push DB Sync] Dispositivo obsoleto/removido limpo com segurança da BD push_subscriptions.');
  } catch (err: any) {
    console.error('[Push DB Sync] Falha ao apagar dispositivo obsoleto da BD push_subscriptions:', err.message);
  }
}

async function fetchSubscriptionsFromSupabase(): Promise<PushSubscriptionContainer[]> {
  try {
    const fetchUrl = `${supabaseUrl}/rest/v1/push_subscriptions?select=*`;
    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (response.ok) {
      const allRecords = await response.json();
      const subs: PushSubscriptionContainer[] = [];
      
      for (const record of allRecords) {
        try {
          const subscription = typeof record.subscription === 'string' ? JSON.parse(record.subscription) : record.subscription;
          subs.push({
            id: record.device_id || `device_${record.id}`,
            subscription,
            userId: record.user_id || 'anonymous',
            isPro: record.is_pro === true,
            updatedAt: record.updated_at || record.created_at || new Date().toISOString()
          });
        } catch (e) {
          // Ignorado
        }
      }
      return subs;
    }
  } catch (err: any) {
    console.error('[Push DB Sync] Erro ao buscar lista de dispositvos PWA na BD push_subscriptions:', err.message);
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

// -----------------------------------------------------------------------------
// HISTÓRICO LOCAL FÍSICO DE NOTIFICAÇÕES ENVIADAS
// -----------------------------------------------------------------------------
interface PushHistoryEntry {
  id: string;
  title: string;
  body: string;
  userType: string;
  sentAt: string;
  devicesNotified: number;
}

const HISTORY_FILE = path.join(__dirname, 'push_history.json');

function loadPushHistory(): PushHistoryEntry[] {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function savePushHistory(history: PushHistoryEntry[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Push Server] Erro ao salvar histórico local de push:', err);
  }
}

async function getUnifiedPushHistory(): Promise<PushHistoryEntry[]> {
  try {
    const fetchUrl = `${supabaseUrl}/rest/v1/push_notifications?select=*&order=created_at.asc`;
    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      const restored: PushHistoryEntry[] = (data || []).map((r: any) => ({
        id: r.id?.toString() || `push_${Date.now()}_${Math.random()}`,
        title: r.title || '',
        body: r.body || '',
        userType: r.user_type || 'all',
        sentAt: r.created_at || new Date().toISOString(),
        devicesNotified: r.sent_count || 1
      }));
      if (restored.length > 0) {
        savePushHistory(restored);
        return restored;
      }
    }
  } catch (e) {
    console.warn('[Push Server] Erro ao carregar histórico de Supabase a partir de push_notifications:', e);
  }
  return loadPushHistory();
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
    let { subscription, userId, isPro } = req.body;
    
    // Tratamento ultra-robusto para assinaturas stringificadas
    if (subscription && typeof subscription === 'string') {
      try {
        subscription = JSON.parse(subscription);
      } catch (err) {
        console.error('[PWA Subscribe] Erro ao analisar string de assinatura corporativa:', err);
      }
    }

    const logPath = path.join(__dirname, 'subscribe_attempts.log');

    // Registar tentativa no log físico persistente
    try {
      const attemptLine = `[${new Date().toISOString()}] ATTEMPT: userId=${userId || 'anonymous'}, endpoint=${subscription?.endpoint ? subscription.endpoint.slice(0, 60) + '...' : 'null'}\n`;
      fs.appendFileSync(logPath, attemptLine, 'utf-8');
    } catch (e) {
      console.error('[PWA Subscribe] Erro ao gravar log físico:', e);
    }

    console.log('[PWA Subscribe API] Recebida tentativa de registo de canal:', {
      hasSubscription: !!subscription,
      hasEndpoint: !!subscription?.endpoint,
      userId,
      isPro
    });

    if (!subscription || !subscription.endpoint) {
      try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: Assinatura inválida (endpoint em falta).\n`, 'utf-8');
      } catch (e) {}
      return res.status(400).json({ error: 'Assinatura inválida (endpoint em falta).' });
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
    try {
      await syncSubscriptionToSupabase(subscriptionData);
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] SUCCESS: Register devId=${subscriptionData.id}, userId=${userId || 'anonymous'}, endpoint=${subscription.endpoint.slice(0, 60)}...\n`, 'utf-8');
    } catch (dbErr: any) {
      try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] DB_SYNC_ERROR: ${dbErr.message}\n`, 'utf-8');
      } catch (e) {}
      console.error('[PWA Subscribe] Erro ao gravar na BD:', dbErr);
    }

    console.log(`[PWA Subscribe] Dispositivo registado nos canais com sucesso absoluto. ID: ${subscriptionData.id}`);
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
    const { title, body, userType } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Faltam campos essenciais no payload' });
    }

    const totalSent = await deliverPushToDevices({ title, body, userType });

    // Salvar no histórico de Supabase na tabela dedicada de 'push_notifications'
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/push_notifications`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          user_type: userType || 'all',
          sent_count: totalSent,
          is_active: true,
          created_at: new Date().toISOString()
        })
      });
      if (!response.ok) {
        console.error('[Push Server] Erro ao salvar notificação no Supabase:', await response.text());
      }
    } catch (dbErr: any) {
      console.error('[Push Server] Erro ao sincronizar nova notificação no Supabase:', dbErr.message);
    }

    // Salvar no histórico físico de envio local para carregamento garantido
    try {
      const history = loadPushHistory();
      history.push({
        id: `push_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title,
        body,
        userType: userType || 'all',
        sentAt: new Date().toISOString(),
        devicesNotified: totalSent
      });
      savePushHistory(history);
    } catch (err) {
      console.error('[Push Server] Erro ao gravar entrada no array de histórico local:', err);
    }

    res.json({ success: true, totalDevicesNotified: totalSent });
  });

  // API 5: Histórico de Notificações Enviadas (Evita flutuações e erros de RLS do Supabase)
  app.get('/api/push/history', async (req, res) => {
    try {
      const history = await getUnifiedPushHistory();
      res.json({ success: true, history: [...history].reverse() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao unificar histórico' });
    }
  });

  // API DEBUG: Diagnóstico do sistema de Push e VAPID
  app.get('/api/push/debug', async (req, res) => {
    try {
      const localSubs = loadSubscriptions();
      const dbSubs = await fetchSubscriptionsFromSupabase();
      
      let subscribeLogs: string[] = [];
      const logPath = path.join(__dirname, 'subscribe_attempts.log');
      if (fs.existsSync(logPath)) {
        try {
          subscribeLogs = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean).slice(-65);
        } catch (e) {}
      }

      res.json({
        success: true,
        serverMemoryVapidPublicKey: vapidKeys.publicKey,
        serverMemoryVapidPrivateKeyLength: vapidKeys.privateKey ? vapidKeys.privateKey.length : 0,
        localSubscriptionsCount: localSubs.length,
        supabaseSubscriptionsCount: dbSubs.length,
        supabaseRawEndpoints: dbSubs.map(s => s.subscription.endpoint),
        subscribeLogs,
        devices: dbSubs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // FUNÇÃO DE ENVIO FÍSICO COM AUTO-PRUNING SE REJEITADO (Status 410 / 404 por FCM/APNS)
  async function deliverPushToDevices(payload: { title: string; body: string; bannerId?: string; userType?: string }) {
    const { title, body, bannerId, userType } = payload;
    
    // Obter toda a lista unificada de dispositivos registrados de Supabase E cache local (Resiliência Máxima contra RLS!)
    const dbSubs = await fetchSubscriptionsFromSupabase();
    const localSubs = loadSubscriptions();

    // Fusão inteligente por Endpoint Único para evitar duplicações
    const subsMap = new Map<string, PushSubscriptionContainer>();
    for (const sub of dbSubs) {
      if (sub && sub.subscription && sub.subscription.endpoint) {
        subsMap.set(sub.subscription.endpoint, sub);
      }
    }
    for (const sub of localSubs) {
      if (sub && sub.subscription && sub.subscription.endpoint) {
        subsMap.set(sub.subscription.endpoint, sub);
      }
    }

    const subs = Array.from(subsMap.values());

    if (subs.length === 0) {
      console.log('[Push Engine] Nenhum dispositivo PWA registado na base de dados ou localmente.');
      return 0;
    }

    const target = userType || 'all';
    const filteredSubs = subs.filter(sub => {
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
          await webpush.sendNotification(container.subscription, pushPayload);
          count++;
        } catch (err: any) {
          // Remover automatizado se utilizador desinstalou a PWA (HTTP 410 / 404)
          if (err.statusCode === 410 || err.statusCode === 404) {
            obsoleteEndpoints.push(container.subscription.endpoint);
          } else {
            console.warn(`[Push Engine] Falha física canal para ${container.userId}:`, err.message);
          }
        }
      })
    );

    // Prunar dispositivos obsoletos do Supabase e cache se houver
    if (obsoleteEndpoints.length > 0) {
      for (const obsEndpoint of obsoleteEndpoints) {
        await deleteSubscriptionFromSupabase(obsEndpoint);
      }
      
      const localSubs = loadSubscriptions();
      const freshLocal = localSubs.filter(s => !obsoleteEndpoints.includes(s.subscription.endpoint));
      saveSubscriptions(freshLocal);
    }

    if (bannerId) {
      saveSentBannerId(bannerId);
    }

    return count;
  }

  // 4. SUPABASE SYNC LOOP - Monitoriza e despacha a cada 20 segundos
  setInterval(async () => {
    try {
      const restUrl = `${supabaseUrl}/rest/v1/push_notifications?is_active=eq.true&order=created_at.desc&limit=10`;
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

      for (const msg of data) {
        const idStr = msg.id.toString();
        // Ignorar se já despachado
        if (sentIds.includes(idStr)) continue;

        if (msg.is_active) {
          console.log(`[PWA DB Poller] Novo aviso detectado em push_notifications: "${msg.title}". Disparando transmissão física...`);
          
          await deliverPushToDevices({
            title: msg.title,
            body: msg.body,
            bannerId: idStr,
            userType: msg.user_type
          });
        } else {
          saveSentBannerId(idStr);
        }
      }
    } catch (err: any) {
      // Silencioso
    }
  }, 20000);

  // 5. CONFIGURAÇÃO DE ROTEAMENTO VITE MIDDLEWARE OU PASTAS ESTÁTICAS EM PRODUÇÃO
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log('[Vite Development] Middleware inicializado.');
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/:path*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Vite Production] Servindo ficheiros estáticos da pasta dist.');
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PWA Server] Send Push central a correr em http://localhost:${PORT}`);
  });
}

startServer();
