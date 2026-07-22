import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// 🔵 1. DECLARAÇÃO E INICIALIZAÇÃO DE CHAVES VAPID (PERSISTÊNCIA DUPLA EM NUVEM SUPABASE + LOCAL)
const GLOBAL_SUPABASE_URL = "https://zuawenhgajcciefbwear.supabase.co";
const GLOBAL_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8";

function getSupabaseClient(customOptions?: any) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || GLOBAL_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || GLOBAL_SUPABASE_KEY;
  if (customOptions) {
    return createClient(supabaseUrl, supabaseServiceKey, customOptions);
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Utilitário para determinar o domínio/origem real de acesso do utilizador, evitando 'localhost' sob proxies reversos (como Cloud Run / Google AI Studio)
function getRequestOrigin(req: any): string {
  let detectedOrigin = "";

  // 1. Tentar ler do Referer (enviado pelo browser, contém a URL real do utilizador)
  const referer = req.headers.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (parsed.origin && !parsed.origin.includes("localhost") && !parsed.origin.includes("127.0.0.1") && !parsed.origin.includes("::1")) {
        detectedOrigin = parsed.origin;
      }
    } catch (e) {
      // ignorar erro de parsing
    }
  }

  // 2. Tentar ler de X-Forwarded-Host (geralmente preservado por proxies reversos)
  if (!detectedOrigin) {
    const forwardedHost = req.headers["x-forwarded-host"];
    const forwardedProto = req.headers["x-forwarded-proto"];
    if (forwardedHost) {
      const proto = typeof forwardedProto === "string" ? forwardedProto : "https";
      const hostStr = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
      if (hostStr && !hostStr.includes("localhost") && !hostStr.includes("127.0.0.1") && !hostStr.includes("::1")) {
        detectedOrigin = `${proto}://${hostStr}`;
      }
    }
  }

  // 3. Tentar ler do cabeçalho Origin (enviado em pedidos POST/CORS)
  if (!detectedOrigin) {
    const origin = req.headers.origin;
    if (origin && typeof origin === "string" && !origin.includes("localhost") && !origin.includes("127.0.0.1") && !origin.includes("::1")) {
      detectedOrigin = origin;
    }
  }

  // Se detectou um domínio público válido, guarda-o globalmente para servir de fallback a rotas locais de background
  if (detectedOrigin) {
    (global as any).lastKnownPublicOrigin = detectedOrigin;
    return detectedOrigin;
  }

  // Se a rota foi chamada internamente por localhost, tentamos usar o último domínio público conhecido
  if ((global as any).lastKnownPublicOrigin) {
    return (global as any).lastKnownPublicOrigin;
  }

  // 4. Fallback padrão para o host do pedido
  const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = req.get("host") || "atrioswork.pt";
  const finalFallback = `${protocol}://${host}`;

  // Evitar retornar localhost se houver domínio de produção disponível
  if (finalFallback.includes("localhost") || finalFallback.includes("127.0.0.1") || finalFallback.includes("::1")) {
    return "https://atrioswork.pt";
  }

  return finalFallback;
}

let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:master@atrioswork.com";

const keysFilePath = path.join(process.cwd(), "vapid-keys.json");

async function initializeVapidKeys() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || GLOBAL_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || GLOBAL_SUPABASE_KEY;

  if (vapidPublicKey && vapidPrivateKey) {
    console.log("[VAPID] Chaves Web Push obtidas via variáveis de ambiente.");
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    return;
  }

  // 1. Tentar obter do Supabase (Nuvem Persistente)
  if (supabaseServiceKey) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("app_banners")
        .select("*")
        .eq("user_type", "system_vapid_keys")
        .maybeSingle();

      if (!error && data && data.highlight && data.cta_text) {
        vapidPublicKey = data.highlight;
        vapidPrivateKey = data.cta_text;
        console.log("[VAPID] Chaves Web Push recuperadas com sucesso do Supabase (Nuvem Persistente).");
        
        // Sincronizar cache local
        try {
          fs.writeFileSync(keysFilePath, JSON.stringify({ publicKey: vapidPublicKey, privateKey: vapidPrivateKey }, null, 2), "utf8");
        } catch (e) {
          console.warn("[VAPID] Não foi possível salvar cache local de chaves:", e);
        }
        
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        return;
      }
    } catch (dbErr) {
      console.warn("[VAPID] Falha ao consultar Supabase, tentando local:", dbErr);
    }
  }

  // 2. Tentar obter do cache local
  if (fs.existsSync(keysFilePath)) {
    try {
      const savedKeys = JSON.parse(fs.readFileSync(keysFilePath, "utf8"));
      vapidPublicKey = savedKeys.publicKey;
      vapidPrivateKey = savedKeys.privateKey;
      console.log("[VAPID] Chaves de segurança carregadas do ficheiro local 'vapid-keys.json'.");
      webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);
      return;
    } catch (e) {
      console.error("[VAPID] Erro ao ler cache local de chaves:", e);
    }
  }

  // 3. Se não houver em nenhum lado, usar as chaves padrão estáticas e salvá-las
  vapidPublicKey = "BJn7k0YuZBjidryzlMNfT4Rpo7MtnglZIiFJ-fRcwR6qwYx-OsSIXHIK4Wjws44ZO6uMh0w21KHfr_iUaauvvO4";
  vapidPrivateKey = "4WDstomeo5DaU92E7ka7bcfQPbjfs1TVN14ya2U3Q70";
  console.log("[VAPID] Chaves Web Push padrão estáticas aplicadas.");
  
  try {
    fs.writeFileSync(keysFilePath, JSON.stringify({ publicKey: vapidPublicKey, privateKey: vapidPrivateKey }, null, 2), "utf8");
  } catch (e) {
    console.error("[VAPID] Falha ao gravar chaves padrão no local:", e);
  }

  // Salvar no Supabase
  if (supabaseServiceKey) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("app_banners").insert([{
        user_type: "system_vapid_keys",
        title: "System VAPID Keys",
        highlight: vapidPublicKey,
        cta_text: vapidPrivateKey,
        is_active: true
      }]);
      console.log("[VAPID] Chaves Web Push padrão persistidas no Supabase com sucesso.");
    } catch (saveErr) {
      console.error("[VAPID] Erro ao persistir chaves padrão no Supabase:", saveErr);
    }
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);
}

// 🔵 2. INICIALIZAÇÃO DO FIREBASE ADMIN SDK (FCM NATIVO)
const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let isFirebaseAdminInitialized = false;

if (serviceAccountEnv) {
  try {
    const serviceAccount = JSON.parse(serviceAccountEnv);
    const apps = getApps();
    if (!apps.length) {
      const isServiceAccount = serviceAccount && (serviceAccount.type === "service_account" || (serviceAccount.client_email && serviceAccount.private_key));
      
      if (isServiceAccount) {
        initializeApp({
          credential: cert(serviceAccount),
        });
        isFirebaseAdminInitialized = true;
        console.log("[Firebase Admin] SDK Inicializado com sucesso via conta de serviço.");
      } else {
        try {
          initializeApp();
          isFirebaseAdminInitialized = true;
          console.log("[Firebase Admin] SDK Inicializado com credenciais padrão do Google Cloud.");
        } catch (initErr) {
          console.warn("[Firebase Admin] Credenciais inválidas fornecidas e impossível carregar credenciais padrão:", initErr);
        }
      }
    } else {
      isFirebaseAdminInitialized = true;
    }
  } catch (err: any) {
    console.error("[Firebase Admin] Falha ao inicializar SDK via JSON da conta de serviço:", err);
  }
} else {
  console.warn("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT não encontrada. Envio nativo FCM desativado.");
}

// Helper para obter token de acesso do Google OAuth2 de forma nativa e segura para fallback HTTP v1
async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const b64Url = (obj: any) => {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj);
    return Buffer.from(str).toString("base64url");
  };

  const encodedHeader = b64Url(header);
  const encodedClaims = b64Url(claims);
  const toSign = `${encodedHeader}.${encodedClaims}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(toSign);
  const signature = sign.sign(privateKey, "base64url");

  const jwt = `${toSign}.${signature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Falha ao obter token OAuth2 do Google: ${errText}`);
  }

  const tokenData = await tokenResponse.json() as { access_token: string };
  return tokenData.access_token;
}

// Helper to get Firestore instance with custom databaseId if configured
let cachedDbInstance: any = null;
let useDefaultDatabase = false;

function getFirestoreInstance() {
  if (cachedDbInstance) {
    return cachedDbInstance;
  }

  let dbId: string | undefined = undefined;
  if (!useDefaultDatabase) {
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        dbId = config.firestoreDatabaseId;
      }
    } catch (err) {
      console.warn("[Firebase Admin] Erro ao ler databaseId de firebase-applet-config.json:", err);
    }
  }
  
  try {
    if (dbId) {
      const apps = getApps();
      const defaultApp = apps.length ? apps[0] : undefined;
      cachedDbInstance = getFirestore(defaultApp, dbId);
    } else {
      cachedDbInstance = getFirestore();
    }
  } catch (err) {
    console.warn("[Firebase Admin] Erro ao obter instância do Firestore com dbId, usando default:", err);
    cachedDbInstance = getFirestore();
  }
  return cachedDbInstance;
}

// Resilient wrapper to run Firestore operations with automatic fallback to default database
async function runFirestoreOp<T>(op: (db: any) => Promise<T>): Promise<T> {
  const db = getFirestoreInstance();
  try {
    return await op(db);
  } catch (err: any) {
    const errMsg = err?.message || "";
    const isNotFound = errMsg.includes("NOT_FOUND") || errMsg.includes("not found") || err?.code === 5;
    
    let dbId: string | undefined = undefined;
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        dbId = config.firestoreDatabaseId;
      }
    } catch (_) {}

    if (isNotFound && dbId && !useDefaultDatabase) {
      console.warn(`[Firestore] Banco de dados customizado '${dbId}' não encontrado (${errMsg}). Fazendo fallback automático para o banco de dados '(default)'...`);
      useDefaultDatabase = true;
      cachedDbInstance = null; // force regeneration
      const fallbackDb = getFirestoreInstance();
      return await op(fallbackDb);
    }
    throw err;
  }
}

// 🔵 3. PERSISTÊNCIA AUXILIAR LOCAL DE ASSINATURAS (WEB PUSH / VAPID)
const subsFilePath = path.join(process.cwd(), "web-push-subscriptions.json");

function loadLocalSubscriptions(): any[] {
  if (fs.existsSync(subsFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(subsFilePath, "utf-8"));
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function loadAllSubscriptions(): Promise<any[]> {
  const localSubs = loadLocalSubscriptions();
  if (isFirebaseAdminInitialized) {
    try {
      const firestoreSubs = await runFirestoreOp(async (db) => {
        const snapshot = await db.collection("web_push_subscriptions").get();
        const subs: any[] = [];
        snapshot.forEach((doc: any) => {
          subs.push(doc.data());
        });
        return subs;
      });
      console.log(`[Push Server] Carregadas ${firestoreSubs.length} assinaturas do Firestore.`);
      
      const allSubs = [...localSubs];
      firestoreSubs.forEach((fs: any) => {
        const endpoint = fs.subscription?.endpoint;
        if (endpoint && !allSubs.some((s) => s.subscription?.endpoint === endpoint)) {
          allSubs.push(fs);
        }
      });
      return allSubs;
    } catch (e: any) {
      console.warn("[Push Server] Aviso ao carregar assinaturas do Firestore (usando fallback local):", e?.message || e);
    }
  }
  return localSubs;
}

function saveLocalSubscription(sub: any) {
  const subs = loadLocalSubscriptions();
  const endpoint = sub.subscription?.endpoint;
  if (!endpoint) return;

  const index = subs.findIndex((s) => s.subscription?.endpoint === endpoint);
  if (index >= 0) {
    subs[index] = { ...subs[index], ...sub, updatedAt: new Date().toISOString() };
  } else {
    subs.push({ ...sub, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  try {
    fs.writeFileSync(subsFilePath, JSON.stringify(subs, null, 2), "utf-8");
  } catch (e) {
    console.error("[Local DB] Erro ao gravar arquivo de assinaturas:", e);
  }
}

function removeLocalSubscription(endpoint: string) {
  const subs = loadLocalSubscriptions();
  const filtered = subs.filter((s) => s.subscription?.endpoint !== endpoint);
  try {
    fs.writeFileSync(subsFilePath, JSON.stringify(filtered, null, 2), "utf-8");
  } catch (e) {
    console.error("[Local DB] Erro ao remover assinatura inválida:", e);
  }
}

// 🔵 4. SALVAR ASSINATURA COMPLETA (FIRESTORE + LOCAL + SUPABASE)
async function saveSubscriptionToDatabase(data: { subscription: any; userId: string; companyId?: string; email?: string; role?: string }) {
  // 1. Gravar no arquivo local (garantia de persistência local)
  saveLocalSubscription(data);

  // 2. Gravar no Firestore se o Firebase Admin estiver ativo
  if (isFirebaseAdminInitialized) {
    try {
      const safeId = Buffer.from(data.subscription.endpoint).toString("base64url");
      await runFirestoreOp(async (db) => {
        await db.collection("web_push_subscriptions").doc(safeId).set({
          subscription: data.subscription,
          userId: data.userId || "unknown",
          companyId: data.companyId || "unknown",
          email: data.email || null,
          role: data.role || null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      console.log(`[Firestore] Assinatura salva com sucesso para o usuário ${data.userId} (${data.email})`);
    } catch (err: any) {
      console.warn("[Firestore] Aviso ao gravar assinatura de Web Push (resolvido por persistência local + Supabase):", err?.message || err);
    }
  }

  // 3. Espelhar no Supabase na tabela profiles sob fcm_token (como JSON string para retrocompatibilidade)
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || GLOBAL_SUPABASE_KEY;
    if (supabaseServiceKey && data.userId) {
      const supabase = getSupabaseClient();
      await supabase
        .from("profiles")
        .update({ fcm_token: JSON.stringify(data.subscription) })
        .eq("id", data.userId);
      console.log(`[Supabase Link] Sincronizada assinatura VAPID no perfil do usuário ${data.userId}`);
    }
  } catch (err) {
    console.warn("[Supabase Link] Falha não impeditiva ao salvar subscrição no perfil:", err);
  }
}

async function deleteSubscriptionFromDatabase(endpoint: string) {
  // Remover do local
  removeLocalSubscription(endpoint);

  // Remover do Firestore
  if (isFirebaseAdminInitialized) {
    try {
      const safeId = Buffer.from(endpoint).toString("base64url");
      await runFirestoreOp(async (db) => {
        await db.collection("web_push_subscriptions").doc(safeId).delete();
      });
      console.log("[Firestore] Assinatura inválida (410/404) removida do Firestore.");
    } catch (err: any) {
      console.warn("[Firestore] Aviso ao remover assinatura do Firestore:", err?.message || err);
    }
  }

  // Remover do Supabase
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || GLOBAL_SUPABASE_KEY;
    if (supabaseServiceKey) {
      const supabase = getSupabaseClient();
      
      const { data: matchingProfiles, error: fetchErr } = await supabase
        .from("profiles")
        .select("id, fcm_token")
        .not("fcm_token", "is", null);
        
      if (!fetchErr && matchingProfiles) {
        for (const p of matchingProfiles) {
          if (p.fcm_token && p.fcm_token.includes(endpoint)) {
            await supabase
              .from("profiles")
              .update({ fcm_token: null })
              .eq("id", p.id);
            console.log(`[Supabase Cleanup] Removido token VAPID inválido do perfil do usuário ${p.id}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Supabase Cleanup] Falha ao limpar token inválido do Supabase:", err);
  }
}

async function deleteFcmTokenFromDatabase(token: string) {
  if (!token) return;
  console.log(`[Push Cleanup] Limpando token FCM inválido ou incompatível: ${token.substring(0, 15)}...`);

  // 1. Remover do cache local
  try {
    const subs = loadLocalSubscriptions();
    const filtered = subs.filter((s: any) => {
      if (typeof s === "string") return s !== token;
      if (s?.subscription?.fcmToken === token) return false;
      if (s?.fcmToken === token) return false;
      return true;
    });
    fs.writeFileSync(subsFilePath, JSON.stringify(filtered, null, 2), "utf-8");
  } catch (e) {
    console.error("[Local DB] Erro ao remover token FCM inválido local:", e);
  }

  // 2. Remover do Firestore
  if (isFirebaseAdminInitialized) {
    try {
      await runFirestoreOp(async (db) => {
        const snapshot = await db.collection("web_push_subscriptions").get();
        const deletePromises: Promise<any>[] = [];
        snapshot.forEach((doc: any) => {
          const data = doc.data();
          if (data?.subscription?.fcmToken === token || data?.fcmToken === token || doc.id === Buffer.from(token).toString("base64url")) {
            deletePromises.push(db.collection("web_push_subscriptions").doc(doc.id).delete());
          }
        });
        await Promise.all(deletePromises);
        console.log("[Firestore] Assinatura FCM removida do Firestore.");
      });
    } catch (err: any) {
      console.warn("[Firestore] Aviso ao remover token FCM do Firestore:", err?.message || err);
    }
  }

  // 3. Remover do Supabase
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || GLOBAL_SUPABASE_KEY;
    if (supabaseServiceKey) {
      const supabase = getSupabaseClient();
      const { data: matchingProfiles, error: fetchErr } = await supabase
        .from("profiles")
        .select("id, fcm_token")
        .not("fcm_token", "is", null);

      if (!fetchErr && matchingProfiles) {
        for (const p of matchingProfiles) {
          if (p.fcm_token === token || (p.fcm_token && p.fcm_token.includes(token))) {
            await supabase
              .from("profiles")
              .update({ fcm_token: null })
              .eq("id", p.id);
            console.log(`[Supabase Cleanup] Removido token FCM inválido/incompatível do perfil do usuário ${p.id}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Supabase Cleanup] Falha ao limpar token FCM do Supabase:", err);
  }
}

// 🔵 5. START DO SERVIDOR EXPRESS
async function startServer() {
  await initializeVapidKeys();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Middleware para capturar o domínio/origem real de acesso dos utilizadores e evitar localhost/127.0.0.1 em tarefas automáticas
  app.use((req, res, next) => {
    let detected = "";
    const referer = req.headers.referer;
    if (referer) {
      try {
        const parsed = new URL(referer);
        if (parsed.origin && !parsed.origin.includes("localhost") && !parsed.origin.includes("127.0.0.1") && !parsed.origin.includes("::1")) {
          detected = parsed.origin;
        }
      } catch (e) {}
    }
    if (!detected) {
      const origin = req.headers.origin;
      if (origin && typeof origin === "string" && !origin.includes("localhost") && !origin.includes("127.0.0.1") && !origin.includes("::1")) {
        detected = origin;
      }
    }
    if (!detected) {
      const forwardedHost = req.headers["x-forwarded-host"];
      const forwardedProto = req.headers["x-forwarded-proto"];
      if (forwardedHost) {
        const proto = typeof forwardedProto === "string" ? forwardedProto : "https";
        const hostStr = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
        if (hostStr && !hostStr.includes("localhost") && !hostStr.includes("127.0.0.1") && !hostStr.includes("::1")) {
          detected = `${proto}://${hostStr}`;
        }
      }
    }

    if (detected) {
      (global as any).lastKnownPublicOrigin = detected;
    }
    next();
  });

  // ROTA: Buscar dados agregados para a aba Plataforma (Ledger) ignorando RLS
  app.post("/api/admin/ledger-stats", async (req, res) => {
    const { adminEmail } = req.body;
    if (!adminEmail) {
      return res.status(400).json({ success: false, error: "Parâmetros em falta." });
    }

    const emailLower = adminEmail.toLowerCase();
    const isMaster = emailLower.includes('master@atrioswork.com') || 
                     emailLower.includes('izarellebraga@gmail.com') || 
                     emailLower.includes('master@digitalnexus.com') ||
                     emailLower.includes('jefersongoes36@gmail.com');

    if (!isMaster) {
      return res.status(403).json({ success: false, error: "Não autorizado." });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseServiceKey) {
        return res.status(500).json({ success: false, error: "Chave do Supabase em falta no servidor." });
      }

      const supabaseAdmin = getSupabaseClient({
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const [pRes, rRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*'),
        supabaseAdmin.from('work_records').select('*')
      ]);

      if (pRes.error) throw pRes.error;
      if (rRes.error) throw rRes.error;

      return res.json({
        success: true,
        profiles: pRes.data || [],
        workRecords: rRes.data || []
      });
    } catch (err: any) {
      console.error("[Ledger Stats API Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ROTA: Atualizar senha de utilizador via Supabase Admin (para Master)
  app.post("/api/admin/update-user-password", async (req, res) => {
    const { userId, newPassword, adminEmail } = req.body;
    if (!userId || !newPassword || !adminEmail) {
      return res.status(400).json({ success: false, error: "Parâmetros em falta." });
    }

    const emailLower = adminEmail.toLowerCase();
    const isMaster = emailLower.includes('master@atrioswork.com') || 
                     emailLower.includes('izarellebraga@gmail.com') || 
                     emailLower.includes('master@digitalnexus.com') ||
                     emailLower.includes('jefersongoes36@gmail.com');

    if (!isMaster) {
      return res.status(403).json({ success: false, error: "Apenas administradores Master podem alterar senhas." });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseServiceKey) {
        return res.status(500).json({ success: false, error: "Chave do Supabase em falta no servidor." });
      }

      const supabaseAdmin = getSupabaseClient({
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (authError) {
        throw authError;
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('settings')
        .eq('id', userId)
        .single();

      const currentSettings = profile?.settings || {};
      const updatedSettings = {
        ...currentSettings,
        password: newPassword
      };

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ settings: updatedSettings })
        .eq('id', userId);

      if (profileError) {
        throw profileError;
      }

      return res.json({ success: true, message: "Senha alterada com sucesso." });
    } catch (err: any) {
      console.error("[UPDATE PASSWORD ERROR]:", err);
      return res.status(500).json({ success: false, error: err.message || "Erro desconhecido ao alterar senha." });
    }
  });

  // ROTA: Obter a chave pública VAPID do servidor
  app.get("/api/push/public-key", (req, res) => {
    return res.json({ publicKey: vapidPublicKey });
  });

  // ROTA: Receber e salvar subscrições Web Push (VAPID) do cliente
  app.post("/api/push/subscribe", async (req, res) => {
    const { subscription, userId, companyId, email, role } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: "Subscrição inválida." });
    }
    await saveSubscriptionToDatabase({ subscription, userId, companyId, email, role });
    return res.status(201).json({ success: true });
  });

  // ROTA: Receber e salvar Tokens FCM normais
  app.post("/api/push/fcm-subscribe", async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) {
      return res.status(400).json({ success: false, error: "Parâmetros obrigatórios ausentes." });
    }

    // Gravar no Supabase
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || GLOBAL_SUPABASE_KEY;
      if (supabaseServiceKey) {
        const supabase = getSupabaseClient();
        await supabase
          .from("profiles")
          .update({ fcm_token: token })
          .eq("id", userId);
        console.log(`[Supabase FCM] Token do FCM gravado para o usuário ${userId}`);
      }
    } catch (err) {
      console.error("[Supabase FCM] Erro ao salvar token:", err);
    }

    return res.status(201).json({ success: true });
  });

  // ROTA SIMPLIFICADA E CENTRALIZADA: /api/notify (Desvia todas as notificações administrativas para Master/Admin de forma 100% backend)
  app.post("/api/notify", async (req, res) => {
    try {
      const { type, title, body, userId, name, email } = req.body;

      let resolvedTitle = title;
      let resolvedBody = body;

      if (type === "new_user") {
        resolvedTitle = title || "🆕 Novo utilizador registado";
        resolvedBody = body || `${name || email || "Um novo utilizador"} acabou de criar uma conta no AtriosWork.`;
      }

      if (type === "unlock_request") {
        resolvedTitle = title || "🔓 Solicitação de Desbloqueio";
        resolvedBody = body || `${name || email || "Um utilizador"} solicitou o desbloqueio da empresa no AtriosWork.`;
      }

      if (!resolvedTitle || !resolvedBody) {
        return res.status(400).json({
          success: false,
          error: "Campos 'title' e 'body' (ou 'type' válido como 'new_user') são obrigatórios."
        });
      }

      console.log(`[Notify API] Processando notificação para administradores. Tipo: ${type || "geral"}. Título: "${resolvedTitle}"`);

      // 1. Obter credenciais do Supabase
      const supabase = getSupabaseClient();

      // Salvar registro de sistema em app_banners para fins de histórico de recebidos
      try {
        const dbPushRecord = {
          title: `[SYSTEM] ${resolvedTitle}`,
          highlight: resolvedBody,
          subtitle: `Sistema - ${type || 'Notificação'}`,
          cta_text: 'Abrir App',
          cta_link: '/',
          theme_color: 'blue',
          is_active: true,
          user_type: 'push_system',
          image_url: null
        };
        await supabase.from('app_banners').insert([dbPushRecord]);
      } catch (dbErr) {
        console.warn("[Notify API] Falha ao gravar histórico do sistema em app_banners:", dbErr);
      }

      // 2. Obter perfis ativos do Supabase que contêm fcm_token
      let profiles: any[] = [];
      try {
        const { data, error: dbError } = await supabase
          .from("profiles")
          .select("id, fcm_token, role, email")
          .not("fcm_token", "is", null);

        if (!dbError && data) {
          profiles = data;
        }
      } catch (err: any) {
        console.warn("[Notify API] Excepção ao buscar perfis do Supabase:", err.message || err);
      }

      // 3. Regras para filtrar administradores/masters
      const isMasterEmail = (emailVal?: string) => {
        const e = (emailVal || "").toLowerCase();
        return e.includes("master@atrioswork.com") || 
               e.includes("izarellebraga@gmail.com") || 
               e.includes("master@digitalnexus.com") ||
               e.includes("jefersongoes36@gmail.com");
      };

      const isAdminUser = (profile: any) => {
        const emailVal = (profile.email || "").toLowerCase();
        const roleVal = (profile.role || "").toLowerCase();
        return isMasterEmail(emailVal) || roleVal === "admin" || roleVal === "master";
      };

      const adminProfiles = profiles.filter((p) => isAdminUser(p));

      // 4. Separar fcm_tokens e subscrições Web Push de forma dedupicada de verdade para evitar duplicações
      const fcmTokens: string[] = [];
      const webPushSubscriptions: any[] = [];
      const seenEndpoints = new Set<string>();
      const seenFcmTokens = new Set<string>();

      adminProfiles.forEach((p) => {
        const token = p.fcm_token;
        if (!token || !token.trim()) return;

        if (token.trim().startsWith("{")) {
          try {
            const sub = JSON.parse(token);
            let added = false;

            // 1. Prioridade absoluta para Web Push VAPID se o endpoint estiver presente
            if (sub && sub.endpoint) {
              const endpoint = sub.endpoint;
              if (!seenEndpoints.has(endpoint)) {
                seenEndpoints.add(endpoint);
                webPushSubscriptions.push({
                  subscription: sub,
                  userId: p.id,
                });
              }
              added = true;
            }

            // 2. Se possuir fcmToken associado, adicionamos ao FCM unicamente se não adicionámos via VAPID para a mesma máquina/browser
            if (sub && sub.fcmToken) {
              const fcmTok = sub.fcmToken;
              if (!added && !seenFcmTokens.has(fcmTok)) {
                seenFcmTokens.add(fcmTok);
                fcmTokens.push(fcmTok);
              }
              added = true;
            }

            // Fallback se não preencheu como nenhum dos dois padrões estruturados
            if (!added) {
              if (!seenFcmTokens.has(token)) {
                seenFcmTokens.add(token);
                fcmTokens.push(token);
              }
            }
          } catch (e) {
            if (!seenFcmTokens.has(token)) {
              seenFcmTokens.add(token);
              fcmTokens.push(token);
            }
          }
        } else {
          if (!seenFcmTokens.has(token)) {
            seenFcmTokens.add(token);
            fcmTokens.push(token);
          }
        }
      });

      // Incorporar também assinaturas salvas localmente/Firestore para retrocompatibilidade
      try {
        const localSubs = await loadAllSubscriptions();
        localSubs.forEach((ls) => {
          if (!ls.subscription || !ls.subscription.endpoint) return;

          const endpoint = ls.subscription.endpoint;
          if (seenEndpoints.has(endpoint)) {
            return; // Já capturado e processado via perfis principais ativos
          }

          const jaExiste = webPushSubscriptions.some((ws) => ws.subscription.endpoint === endpoint);
          if (!jaExiste) {
            const matchingProfile = profiles?.find((p) => p.id === ls.userId);

            // EVITAR DUPLICAÇÃO: Se o perfil do usuário já possui fcm_token ativo no Supabase, evitamos processar a assinatura VAPID local obsoleta
            if (matchingProfile && matchingProfile.fcm_token) {
              return;
            }

            const userEmail = (matchingProfile?.email || ls.email || "").toLowerCase();
            const userRole = (matchingProfile?.role || ls.role || "user").toLowerCase();
            const isMaster = isMasterEmail(userEmail) || userRole === "admin" || userRole === "master";

            if (isMaster) {
              seenEndpoints.add(endpoint);
              webPushSubscriptions.push(ls);
            }
          }
        });
      } catch (err: any) {
        console.warn("[Notify API] Erro ao carregar assinaturas locais:", err);
      }

      console.log(`[Notify API] Enviando notificação para ${fcmTokens.length} dispositivos FCM e ${webPushSubscriptions.length} assinaturas Web Push.`);

      // Calcular links dinâmicos do domínio ativo do request de forma segura (evita localhost sob proxies reversos)
      const currentOrigin = getRequestOrigin(req);
      const iconUrl = `${currentOrigin}/logo_atualizado.jpg?v=20260314_v1`;
      const absoluteTargetUrl = `${currentOrigin}/`;

      let totalSent = 0;
      const uniqueTag = `push-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // 🔵 DISPARO 1: Enviar via Web Push (VAPID)
      const webPushPromises = webPushSubscriptions.map(async (ws) => {
        const payload = JSON.stringify({
          title: resolvedTitle,
          body: resolvedBody,
          url: absoluteTargetUrl,
          notification: {
            title: resolvedTitle,
            body: resolvedBody,
            icon: iconUrl,
            badge: iconUrl,
            vibrate: [100, 50, 100],
            data: { url: absoluteTargetUrl },
            tag: uniqueTag,
          },
        });

        try {
          await webpush.sendNotification(ws.subscription, payload, {
            headers: { "Urgency": "high" },
            TTL: 86400
          });
          totalSent++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await deleteSubscriptionFromDatabase(ws.subscription.endpoint);
          } else {
            console.error("[Notify API VAPID] Erro ao enviar:", err.message || err);
          }
        }
      });

      // 🔵 DISPARO 2: Enviar via Firebase Cloud Messaging (FCM)
      let finalServiceAccountEnv = null;
      try {
        const { data: configData } = await supabase
          .from('app_banners')
          .select('highlight')
          .eq('user_type', 'fcm_config')
          .maybeSingle();
        if (configData && configData.highlight) {
          finalServiceAccountEnv = configData.highlight;
        }
      } catch (dbErr) {
        console.warn("[Notify API] Erro ao carregar credenciais dinâmicas do FCM de app_banners:", dbErr);
      }

      if (!finalServiceAccountEnv) {
        finalServiceAccountEnv = serviceAccountEnv;
      }

      // Pré-obter o token de acesso OAuth do Google apenas uma vez para evitar conexões paralelas e gargalos
      let cachedAccessToken: string | null = null;
      let fcmProjectId: string | null = null;

      if (finalServiceAccountEnv) {
        try {
          const serviceAccount = JSON.parse(finalServiceAccountEnv);
          fcmProjectId = serviceAccount.project_id;
          if (serviceAccount.client_email && serviceAccount.private_key) {
            cachedAccessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key);
          }
        } catch (tokenErr: any) {
          console.warn("[Notify API] Erro ao obter token de acesso OAuth do Google:", tokenErr.message || tokenErr);
        }
      }

      const fcmPromises = fcmTokens.map(async (token) => {
        const isUsingDefaultProject = !finalServiceAccountEnv || finalServiceAccountEnv === serviceAccountEnv;

        // Método A: Usar Firebase Admin SDK se inicializado e estivermos no projeto padrão
        if (isFirebaseAdminInitialized && isUsingDefaultProject) {
          try {
            await getMessaging().send({
              token,
              notification: { title: resolvedTitle, body: resolvedBody },
              android: { priority: "high" },
              apns: {
                headers: { "apns-priority": "10", "apns-push-type": "alert" },
                payload: { aps: { sound: "default", "content-available": 1 } },
              },
              webpush: {
                headers: { Urgency: "high", TTL: "86400" },
                notification: {
                  title: resolvedTitle,
                  body: resolvedBody,
                  icon: iconUrl,
                  badge: iconUrl,
                  clickAction: absoluteTargetUrl,
                  requireInteraction: true,
                  tag: uniqueTag
                },
                fcmOptions: { link: absoluteTargetUrl },
              },
              data: { url: absoluteTargetUrl, click_action: absoluteTargetUrl },
            });
            totalSent++;
            return;
          } catch (fcmAdminErr: any) {
            console.error(`[Notify API FCM Admin] Erro para o token ${token.substring(0, 15)}...:`, fcmAdminErr.message);
            const errMsg = (fcmAdminErr?.message || "").toLowerCase();
            const errCode = (fcmAdminErr?.code || "").toLowerCase();
            if (
              errMsg.includes("registration-token-not-registered") ||
              errMsg.includes("unregistered") ||
              errMsg.includes("not-found") ||
              errCode.includes("registration-token-not-registered") ||
              errCode.includes("not-found") ||
              errMsg.includes("mismatched-credential") ||
              errMsg.includes("senderid mismatch") ||
              errMsg.includes("sender_id_mismatch") ||
              errCode.includes("mismatched-credential")
            ) {
              console.log(`[Notify API FCM Admin] Erro definitivo de token FCM detetado. Iniciando limpeza do token...`);
              deleteFcmTokenFromDatabase(token).catch((cleanErr) => {
                console.warn("[FCM Cleanup Error]", cleanErr);
              });
            }
          }
        }

        // Método B: Enviar de forma direta e otimizada via REST API HTTP v1
        if (cachedAccessToken && fcmProjectId) {
          try {
            const projectId = fcmProjectId;
            const accessToken = cachedAccessToken;

            const fcmResponse = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token,
                    notification: { title: resolvedTitle, body: resolvedBody, image: iconUrl },
                    android: {
                      priority: "HIGH",
                      notification: {
                        channel_id: "default",
                        default_sound: true,
                        visibility: "PUBLIC",
                        notification_priority: "PRIORITY_MAX",
                        click_action: absoluteTargetUrl,
                        icon: iconUrl
                      }
                    },
                    apns: {
                      headers: { "apns-priority": "10", "apns-push-type": "alert" },
                      payload: { aps: { alert: { title: resolvedTitle, body: resolvedBody }, sound: "default", "content-available": 1 } },
                    },
                    webpush: {
                      headers: { Urgency: "high", TTL: "86400" },
                      notification: {
                        title: resolvedTitle,
                        body: resolvedBody,
                        icon: iconUrl,
                        badge: iconUrl,
                        requireInteraction: true,
                        tag: uniqueTag
                      },
                      fcm_options: { link: absoluteTargetUrl },
                      data: { title: resolvedTitle, body: resolvedBody, url: absoluteTargetUrl }
                    },
                    data: { title: resolvedTitle, body: resolvedBody, url: absoluteTargetUrl, click_action: absoluteTargetUrl },
                  },
                }),
              }
            );

            if (fcmResponse.ok) {
              totalSent++;
            } else {
              const fcmErrResult = await fcmResponse.json() as any;
              console.error(`[Notify API FCM Fallback] Erro para o token ${token.substring(0, 15)}...:`, fcmErrResult);
              const errorObj = fcmErrResult?.error || {};
              const errMessage = (errorObj.message || "").toLowerCase();
              const errStatus = (errorObj.status || "").toLowerCase();
              const details = errorObj.details || [];
              const hasUnregistered = details.some((d: any) => d.errorCode === "UNREGISTERED") || 
                                      errMessage.includes("unregistered") || 
                                      errMessage.includes("not_found") || 
                                      errStatus === "not_found" ||
                                      errorObj.code === 404;
                                      
              const hasSenderMismatch = details.some((d: any) => d.errorCode === "SENDER_ID_MISMATCH") || 
                                        errMessage.includes("senderid mismatch") || 
                                        errMessage.includes("sender_id_mismatch") ||
                                        errStatus === "permission_denied" ||
                                        errorObj.code === 403;

              if (hasUnregistered || hasSenderMismatch) {
                console.log(`[Notify API FCM Fallback] Erro definitivo de token FCM detetado (${hasUnregistered ? 'UNREGISTERED' : 'SENDER_ID_MISMATCH'}). Iniciando limpeza...`);
                deleteFcmTokenFromDatabase(token).catch((cleanErr) => {
                  console.warn("[FCM Fallback Cleanup Error]", cleanErr);
                });
              }
            }
          } catch (fetchErr: any) {
            console.error(`[Notify API FCM Fallback] Falha de rede para o token ${token.substring(0, 15)}...:`, fetchErr);
          }
        }
      });

      await Promise.all([...webPushPromises, ...fcmPromises]);

      return res.json({
        success: true,
        sent: totalSent,
        message: `Notificações enviadas com sucesso para ${totalSent} destinos.`
      });

    } catch (err: any) {
      console.error("[Notify API] Erro catastrófico de disparo:", err);
      return res.status(500).json({
        success: false,
        error: err.message || String(err)
      });
    }
  });

  // ROTA: Processamento de Pagamento (Stripe + Sincronização e Fallback Inteligente)
  app.post("/api/process-payment", async (req, res) => {
    try {
      const { token, email, description, vendorCode, discountPercent } = req.body;

      console.log(`[Local Payment API] A receber pedido para: ${email}`);

      if (!token) {
        return res.status(400).json({ success: false, error: "Token de pagamento não fornecido." });
      }
      if (!email) {
        return res.status(400).json({ success: false, error: "E-mail do cliente não fornecido." });
      }

      const supabaseAdmin = getSupabaseClient();

      // Cálculo do Valor Final Dinâmico
      const BASE_PRICE = 9.90;
      let finalPrice = BASE_PRICE;
      let discountApplied = false;

      const discountVal = typeof discountPercent === 'string' ? parseFloat(discountPercent) : discountPercent;

      if (discountVal !== undefined && discountVal !== null && discountVal > 0) {
        discountApplied = true;
        const discountRate = discountVal / 100;
        finalPrice = BASE_PRICE * (1 - discountRate);
        console.log(`[Local Payment API] Desconto de ${discountVal}% aplicado via checkout.`);
      } else if (vendorCode) {
        const code = vendorCode.trim().toUpperCase();
        
        const { data: vData } = await supabaseAdmin
          .from('vendors')
          .select('id')
          .ilike('code', code)
          .maybeSingle();
        
        if (vData) {
          const { data: pData } = await supabaseAdmin
            .from('profiles')
            .select('subscription')
            .eq('id', vData.id)
            .maybeSingle();

          if (pData) {
            discountApplied = true;
            let sub: any = {};
            try {
              sub = typeof pData.subscription === 'string' ? JSON.parse(pData.subscription) : (pData.subscription || {});
            } catch (e) { sub = {}; }
            
            const dbDiscount = sub.custom_discount ?? 5;
            const discountRate = dbDiscount / 100;
            finalPrice = BASE_PRICE * (1 - discountRate);
            console.log(`[Local Payment API] Desconto de ${dbDiscount}% recuperado da DB do parceiro.`);
          } else {
            discountApplied = true;
            finalPrice = BASE_PRICE * 0.95;
          }
        }
      }

      const amountCents = Math.round(finalPrice * 100);
      
      if (isNaN(amountCents) || amountCents <= 0) {
        return res.status(400).json({ success: false, error: `Montante calculado inválido: ${amountCents}` });
      }

      // Verificação da chave Stripe
      const stripeKey = process.env.STRIPE_SECRET_KEY?.replace(/\s/g, '');

      if (!stripeKey || stripeKey.trim() === '' || stripeKey.includes('SUA_CHAVE') || token === 'BYPASS_DEV_MODE') {
        console.log(`[Local Payment API] Stripe Key ausente ou em modo bypass/teste. Simulando pagamento com sucesso!`);
        return res.status(200).json({
          success: true,
          chargeId: `MOCK_AW_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          amountCharged: amountCents / 100,
          discounted: discountApplied,
          status: 'succeeded'
        });
      }

      // Chamada real ao Stripe via REST API nativa
      const params = new URLSearchParams();
      params.append('amount', amountCents.toString());
      params.append('currency', 'eur');
      params.append('confirm', 'true');
      params.append('payment_method_data[type]', 'card');
      params.append('payment_method_data[card][token]', token);
      params.append('description', description || `Licença AtriosWork Elite - ${email}`);
      params.append('receipt_email', email);
      params.append('off_session', 'true');
      params.append('return_url', 'https://atrioswork.com/success');
      params.append('metadata[vendor_code]', vendorCode || 'DIRETO');
      params.append('metadata[discount_percent]', discountApplied ? (discountVal || 'DB_SYNC').toString() : '0%');

      console.log(`[Local Payment API] Montante final: ${amountCents} cêntimos (${finalPrice}€). A contactar Stripe...`);

      const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
        },
        body: params
      });

      const stripeData = await stripeResponse.json() as any;

      if (!stripeResponse.ok) {
        console.error("[Local Payment API Stripe Error]:", JSON.stringify(stripeData));
        const errorMessage = stripeData.error?.message || "Erro desconhecido no processamento bancário.";
        return res.status(400).json({ success: false, error: errorMessage });
      }

      return res.status(200).json({
        success: true,
        chargeId: stripeData.id,
        amountCharged: amountCents / 100,
        discounted: discountApplied,
        status: stripeData.status
      });

    } catch (error: any) {
      console.error("[Local Payment API Fatal Error]:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message || "Erro interno ao processar pagamento."
      });
    }
  });

  // Helper de timeout
  function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage = "Operação expirou por tempo limite"): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(errorMessage));
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  // Inicializar logs de depuração globais para visualização admin se necessário
  if (!(global as any).pushDebugLogs) {
    (global as any).pushDebugLogs = [];
  }

  function logPushStep(msg: string) {
    const formatted = `[${new Date().toISOString()}] ${msg}`;
    console.log(formatted);
    if ((global as any).pushDebugLogs) {
      (global as any).pushDebugLogs.push(formatted);
      if ((global as any).pushDebugLogs.length > 500) {
        (global as any).pushDebugLogs.shift();
      }
    }
  }

  // ROTA: Obter logs de depuração do Push
  app.get("/api/push-debug-logs", (req, res) => {
    return res.json({ logs: (global as any).pushDebugLogs || [] });
  });

  // ----------------------------------------------------
  // HELPER CENTRALIZADO PARA DISPARO DE PUSH (VAPID + FCM + REALTIME BROADCAST)
  // ----------------------------------------------------
  async function dispatchPushCore(params: {
    title: string;
    body: string;
    audience?: string;
    url?: string;
    targetUserId?: string;
    targetUserEmail?: string;
    customServiceAccount?: any;
    origin?: string;
  }) {
    const { title, body, audience = "all", url = "/", targetUserId, targetUserEmail, customServiceAccount, origin } = params;

    logPushStep(`--- Novo Disparo Executado (dispatchPushCore) ---`);
    logPushStep(`Título="${title}", Corpo="${body}", Audience="${audience}", targetUserId="${targetUserId || ''}", targetUserEmail="${targetUserEmail || ''}"`);

    const currentOrigin = origin || "https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app";
    const iconUrl = `${currentOrigin}/logo_atualizado.jpg?v=20260314_v1`;

    let absoluteTargetUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const cleanPath = url.startsWith("/") ? url.substring(1) : url;
      absoluteTargetUrl = `${currentOrigin}/${cleanPath}`;
    }

    const supabase = getSupabaseClient();

    // 1. Emitir Supabase Realtime Broadcast imediato no canal 'atrioswork-push-notifications'
    try {
      const pushChannel = supabase.channel('atrioswork-push-notifications');
      pushChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          pushChannel.send({
            type: 'broadcast',
            event: 'push_received',
            payload: { title, body, audience }
          }).then(() => {
            try { supabase.removeChannel(pushChannel); } catch (e) {}
          }).catch((err) => {
            console.warn("[Broadcast Realtime Error]", err);
          });
        }
      });
    } catch (bcErr) {
      console.warn("[Broadcast Exception]", bcErr);
    }

    // 2. Obter perfis ativos do Supabase que contêm fcm_token
    let profiles: any[] = [];
    try {
      const { data, error: dbError } = await supabase
        .from("profiles")
        .select("id, fcm_token, role, email")
        .not("fcm_token", "is", null);

      if (!dbError && data) {
        profiles = data;
      }
    } catch (err: any) {
      console.warn("[FCM Server] Excepção ao buscar perfis do Supabase:", err.message || err);
    }

    const isMasterEmail = (email?: string) => {
      const e = (email || "").toLowerCase();
      return e.includes("master@atrioswork.com") || 
             e.includes("izarellebraga@gmail.com") || 
             e.includes("master@digitalnexus.com") ||
             e.includes("jefersongoes36@gmail.com");
    };

    const isAdminUser = (profile: any) => {
      const emailVal = (profile.email || "").toLowerCase();
      const roleVal = (profile.role || "").toLowerCase();
      return isMasterEmail(emailVal) || roleVal === "admin" || roleVal === "master";
    };

    const isSystemNotification = (tTitle: string, tBody: string, tAudience?: string, hasTargetUser?: boolean) => {
      const audL = (tAudience || "").toLowerCase();
      if (hasTargetUser || audL === "all" || audL === "todos" || audL === "geral" || audL === "user" || audL === "users" || audL === "free" || audL === "gratis" || audL === "premium" || audL === "pro") {
        return false;
      }
      const titleL = (tTitle || "").toLowerCase();
      const bodyL = (tBody || "").toLowerCase();
      if (audL === "admin" || audL === "master" || audL === "support") {
        return true;
      }
      const systemKeywords = [
        "atendimento humano",
        "novo utilizador",
        "novo cadastro",
        "novo registo",
        "registou-se",
        "registrado",
        "desbloqueio",
        "venda realizada",
        "nova venda",
        "solicitou atendimento",
        "solicitação de"
      ];
      return systemKeywords.some(keyword => titleL.includes(keyword) || bodyL.includes(keyword));
    };

    const hasTargetUser = !!(targetUserId || targetUserEmail);
    const isSys = isSystemNotification(title, body, audience, hasTargetUser);

    let filteredProfiles = profiles || [];

    if (targetUserId) {
      filteredProfiles = filteredProfiles.filter((p) => p.id === targetUserId);
    } else if (targetUserEmail) {
      filteredProfiles = filteredProfiles.filter((p) => (p.email || "").toLowerCase() === targetUserEmail.toLowerCase());
    } else if (isSys) {
      filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
    } else {
      const audL = (audience || "").toLowerCase();
      if (audL === "admin" || audL === "master") {
        filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
      } else if (audL === "vendors" || audL === "vendor") {
        filteredProfiles = filteredProfiles.filter((p) => p.role === "vendor");
      } else if (audL === "support") {
        filteredProfiles = filteredProfiles.filter((p) => p.role === "support" || isAdminUser(p));
      } else if (audL === "user" || audL === "users" || audL === "free" || audL === "gratis") {
        filteredProfiles = filteredProfiles.filter((p) => p.role === "user" && !isMasterEmail(p.email));
      } else if (audL === "premium" || audL === "pro" || audL === "paid") {
        filteredProfiles = filteredProfiles;
      }
    }

    const fcmTokens: string[] = [];
    const webPushSubscriptions: any[] = [];
    const seenEndpoints = new Set<string>();
    const seenFcmTokens = new Set<string>();

    filteredProfiles.forEach((p) => {
      const token = p.fcm_token;
      if (!token) return;

      let trimmedToken = "";
      try {
        trimmedToken = typeof token === "string" ? token.trim() : JSON.stringify(token);
      } catch (err) {
        return;
      }
      if (!trimmedToken) return;

      if (trimmedToken.startsWith("{")) {
        try {
          const sub = JSON.parse(trimmedToken);
          if (sub && sub.endpoint && sub.keys) {
            const endpoint = sub.endpoint;
            if (!seenEndpoints.has(endpoint)) {
              seenEndpoints.add(endpoint);
              webPushSubscriptions.push({
                subscription: {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
                },
                userId: p.id,
                email: p.email
              });
            }
          }
          const extractedFcm = sub && (sub.fcmToken || sub.fcm_token || sub.token);
          if (extractedFcm && typeof extractedFcm === "string") {
            if (!seenFcmTokens.has(extractedFcm)) {
              seenFcmTokens.add(extractedFcm);
              fcmTokens.push(extractedFcm);
            }
          } else if (!sub.endpoint) {
            if (!seenFcmTokens.has(trimmedToken)) {
              seenFcmTokens.add(trimmedToken);
              fcmTokens.push(trimmedToken);
            }
          }
        } catch (e) {
          if (!seenFcmTokens.has(trimmedToken)) {
            seenFcmTokens.add(trimmedToken);
            fcmTokens.push(trimmedToken);
          }
        }
      } else {
        if (!seenFcmTokens.has(trimmedToken)) {
          seenFcmTokens.add(trimmedToken);
          fcmTokens.push(trimmedToken);
        }
      }
    });

    // Subscrições do Firestore / local
    try {
      const localSubs = await loadAllSubscriptions();
      localSubs.forEach((ls) => {
        if (!ls.subscription) return;
        const subObj = ls.subscription;
        const userEmail = (ls.email || "").toLowerCase();
        const userRole = (ls.role || "user").toLowerCase();
        const isMaster = isMasterEmail(userEmail);
        const isAdmin = isMaster || userRole === "admin" || userRole === "master";

        let belongsToAudience = false;
        if (targetUserId) {
          belongsToAudience = ls.userId === targetUserId;
        } else if (targetUserEmail) {
          belongsToAudience = userEmail === targetUserEmail.toLowerCase();
        } else if (isSys) {
          belongsToAudience = isAdmin;
        } else {
          const audL = (audience || "").toLowerCase();
          if (audL === "admin" || audL === "master") belongsToAudience = isAdmin;
          else if (audL === "vendors" || audL === "vendor") belongsToAudience = userRole === "vendor";
          else if (audL === "support") belongsToAudience = userRole === "support" || isAdmin;
          else if (audL === "user" || audL === "users" || audL === "free" || audL === "gratis") belongsToAudience = userRole === "user" && !isAdmin;
          else belongsToAudience = true;
        }

        if (belongsToAudience) {
          if (subObj.endpoint && subObj.keys) {
            const endpoint = subObj.endpoint;
            if (!seenEndpoints.has(endpoint)) {
              seenEndpoints.add(endpoint);
              webPushSubscriptions.push({
                subscription: { endpoint: subObj.endpoint, keys: { p256dh: subObj.keys.p256dh, auth: subObj.keys.auth } },
                userId: ls.userId,
                email: ls.email
              });
            }
          }
          const extractedFcm = subObj.fcmToken || subObj.fcm_token || subObj.token;
          if (extractedFcm && typeof extractedFcm === "string") {
            if (!seenFcmTokens.has(extractedFcm)) {
              seenFcmTokens.add(extractedFcm);
              fcmTokens.push(extractedFcm);
            }
          }
        }
      });
    } catch (err: any) {}

    let totalSent = 0;

    // A) Enviar VAPID Web Push
    const webPushPromises = webPushSubscriptions.map(async (ws) => {
      const uniqueTag = `push-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const payload = JSON.stringify({
        title,
        body,
        url: absoluteTargetUrl,
        notification: {
          title,
          body,
          icon: iconUrl,
          badge: iconUrl,
          vibrate: [100, 50, 100],
          data: { url: absoluteTargetUrl },
          tag: uniqueTag,
        },
      });

      try {
        const cleanSub = {
          endpoint: ws.subscription.endpoint,
          keys: { p256dh: ws.subscription.keys?.p256dh, auth: ws.subscription.keys?.auth }
        };
        await withTimeout(
          webpush.sendNotification(cleanSub, payload, {
            headers: { "Urgency": "high" },
            urgency: "high",
            TTL: 86400
          }),
          8000,
          "Timeout Web Push"
        );
        totalSent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          deleteSubscriptionFromDatabase(ws.subscription.endpoint).catch(() => {});
        }
      }
    });

    // B) Enviar FCM HTTP v1
    let finalServiceAccountEnv = null;
    if (customServiceAccount) {
      try {
        finalServiceAccountEnv = typeof customServiceAccount === 'string' ? customServiceAccount : JSON.stringify(customServiceAccount);
      } catch (e) {}
    }

    if (!finalServiceAccountEnv) {
      try {
        const { data: configData } = await supabase
          .from('app_banners')
          .select('highlight')
          .eq('user_type', 'fcm_config')
          .maybeSingle();
        if (configData && configData.highlight) {
          finalServiceAccountEnv = configData.highlight;
        }
      } catch (dbErr) {}
    }

    if (!finalServiceAccountEnv) {
      finalServiceAccountEnv = serviceAccountEnv;
    }

    let cachedAccessToken: string | null = null;
    let fcmProjectId: string | null = null;

    if (finalServiceAccountEnv) {
      try {
        const serviceAccount = JSON.parse(finalServiceAccountEnv);
        fcmProjectId = serviceAccount.project_id;
        if (serviceAccount.client_email && serviceAccount.private_key) {
          cachedAccessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key);
        }
      } catch (credErr) {}
    }

    const fcmPromises = fcmTokens.map(async (token) => {
      if (!cachedAccessToken || !fcmProjectId) return;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const fcmUrl = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`;
        const fcmResponse = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${cachedAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: {
              token: token,
              notification: { title, body, image: iconUrl },
              webpush: {
                headers: {
                  "Urgency": "high",
                  "TTL": "86400"
                },
                notification: {
                  title,
                  body,
                  icon: iconUrl,
                  badge: iconUrl,
                  requireInteraction: true,
                  tag: `push-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
                },
                fcm_options: { link: absoluteTargetUrl },
                data: { title, body, url: absoluteTargetUrl }
              },
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "default",
                  default_sound: true,
                  visibility: "PUBLIC",
                  notification_priority: "PRIORITY_MAX",
                  click_action: absoluteTargetUrl,
                  icon: iconUrl
                }
              },
              apns: {
                headers: {
                  "apns-priority": "10",
                  "apns-push-type": "alert"
                },
                payload: {
                  aps: {
                    alert: { title, body },
                    sound: "default",
                    "content-available": 1
                  }
                }
              },
              data: { title, body, url: absoluteTargetUrl, click_action: absoluteTargetUrl }
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (fcmResponse.ok) {
          totalSent++;
        } else {
          const fcmErrResult = await fcmResponse.json() as any;
          const errorObj = fcmErrResult?.error || {};
          const errMessage = (errorObj.message || "").toLowerCase();
          const errStatus = (errorObj.status || "").toLowerCase();
          const details = errorObj.details || [];
          const hasUnregistered = details.some((d: any) => d.errorCode === "UNREGISTERED") || 
                                  errMessage.includes("unregistered") || 
                                  errMessage.includes("not_found") || 
                                  errStatus === "not_found" ||
                                  errorObj.code === 404;

          if (hasUnregistered) {
            deleteFcmTokenFromDatabase(token).catch(() => {});
          }
        }
      } catch (fetchErr: any) {}
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      
      await withTimeout(
        Promise.all([...webPushPromises, ...fcmPromises]),
        12000,
        "Timeout geral de disparos"
      );
      clearTimeout(timeoutId);

      return { success: true, sent: totalSent };
    } catch (err: any) {
      console.warn("[Push Dispatch Warning]", err?.message || err);
      return { success: true, sent: totalSent };
    }
  }

  // ----------------------------------------------------
  // ARMAZENAMENTO E PROCESSADOR DE PUSH AGENDADO AUTOMÁTICO (SERVER-SIDE 24/7)
  // ----------------------------------------------------
  const inMemoryScheduledPushes: Array<{
    id: string;
    title: string;
    body: string;
    audience: string;
    scheduledTime: string;
  }> = [];

  async function checkAndDispatchScheduledPushesServer() {
    try {
      const supabase = getSupabaseClient();
      const now = new Date();

      // 1. Buscar agendamentos pendentes do banco de dados Supabase (app_banners)
      let dbScheduled: any[] = [];
      try {
        const { data, error } = await supabase
          .from('app_banners')
          .select('*')
          .eq('user_type', 'push_scheduled')
          .eq('is_active', false);

        if (!error && data) {
          dbScheduled = data;
        }
      } catch (err) {
        console.warn("[Server Scheduler] Aviso ao buscar app_banners:", err);
      }

      // 2. Processar agendamentos do banco de dados Supabase
      for (const item of dbScheduled) {
        try {
          const schedTime = new Date(item.cta_link || item.created_at);
          if (!isNaN(schedTime.getTime()) && schedTime <= now) {
            const cleanTitle = item.title.replace('[SCHEDULED]', '').replace('[scheduled]', '').trim();
            const body = item.highlight || '';
            const audience = item.subtitle || 'all';

            console.log(`[Server Scheduler] Disparando notificação agendada do DB: "${cleanTitle}" para ${audience}`);

            await dispatchPushCore({
              title: cleanTitle,
              body: body,
              audience: audience,
              url: '/'
            });

            const targetUserType = audience === 'all' || audience === 'todos' ? 'push_notification' : (audience === 'premium' ? 'premium' : 'free');
            await supabase
              .from('app_banners')
              .update({
                title: `[PUSH] ${cleanTitle}`,
                user_type: targetUserType,
                is_active: true,
                cta_link: '/',
                created_at: new Date().toISOString()
              })
              .eq('id', item.id);
          }
        } catch (itemErr) {
          console.error(`[Server Scheduler] Erro ao processar item agendado do DB ${item.id}:`, itemErr);
        }
      }

      // 3. Processar agendamentos em memória
      for (let i = inMemoryScheduledPushes.length - 1; i >= 0; i--) {
        const memItem = inMemoryScheduledPushes[i];
        try {
          const schedTime = new Date(memItem.scheduledTime);
          if (!isNaN(schedTime.getTime()) && schedTime <= now) {
            console.log(`[Server Scheduler] Disparando notificação agendada em memória: "${memItem.title}" para ${memItem.audience}`);

            await dispatchPushCore({
              title: memItem.title,
              body: memItem.body,
              audience: memItem.audience,
              url: '/'
            });

            inMemoryScheduledPushes.splice(i, 1);
          }
        } catch (memErr) {
          console.error(`[Server Scheduler] Erro ao processar item agendado em memória ${memItem.id}:`, memErr);
        }
      }
    } catch (err) {
      console.error("[Server Scheduler] Erro no loop de verificação:", err);
    }
  }

  // Executar o agendador no servidor a cada 15 segundos
  setInterval(checkAndDispatchScheduledPushesServer, 15000);

  // ROTA: Agendar nova notificação diretamente no servidor
  app.post("/api/push/schedule", async (req, res) => {
    try {
      const { title, body, audience, scheduledTime } = req.body;
      if (!title || !body || !scheduledTime) {
        return res.status(400).json({ success: false, error: "Campos 'title', 'body' e 'scheduledTime' são obrigatórios." });
      }

      const cleanTitle = title.trim();
      const cleanBody = body.trim();
      const targetAudience = audience || 'all';

      inMemoryScheduledPushes.push({
        id: 'sched_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        title: cleanTitle,
        body: cleanBody,
        audience: targetAudience,
        scheduledTime: scheduledTime
      });

      try {
        const supabase = getSupabaseClient();
        await supabase.from('app_banners').insert([{
          title: `[SCHEDULED] ${cleanTitle}`,
          highlight: cleanBody,
          subtitle: targetAudience,
          cta_text: 'Abrir App',
          cta_link: scheduledTime,
          theme_color: 'amber',
          is_active: false,
          user_type: 'push_scheduled',
          created_at: new Date().toISOString()
        }]);
      } catch (dbErr) {
        console.warn("[Schedule API] Aviso ao gravar em app_banners:", dbErr);
      }

      console.log(`[Schedule API] Notificação agendada com sucesso no backend para ${scheduledTime}`);
      return res.json({ success: true, message: "Notificação agendada no servidor com sucesso." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // ROTA: Envio de Push Inteligente Impróprio/Imediato
  app.post("/api/send-fcm-push", async (req, res) => {
    try {
      const { title, body, audience, url = "/", targetUserId, targetUserEmail, customServiceAccount } = req.body;
      if (!title || !body) {
        return res.status(400).json({
          success: false,
          error: "Campos 'title' e 'body' são obrigatórios.",
        });
      }

      const currentOrigin = getRequestOrigin(req);
      const result = await dispatchPushCore({
        title,
        body,
        audience,
        url,
        targetUserId,
        targetUserEmail,
        customServiceAccount,
        origin: currentOrigin
      });

      return res.json({
        success: true,
        sent: result.sent,
        message: `Disparo concluído com sucesso. Notificações enviadas a ${result.sent} destinos.`,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || String(err),
      });
    }
  });

  /* REMOVE_START
      // 1. Obter credenciais do Supabase
      const supabase = getSupabaseClient();

      // 2. Obter perfis ativos do Supabase que contêm fcm_token ou subscrições de forma resiliente
      let profiles: any[] = [];
      try {
        logPushStep("Buscando perfis no Supabase...");
        const { data, error: dbError } = await supabase
          .from("profiles")
          .select("id, fcm_token, role, email")
          .not("fcm_token", "is", null);

        if (dbError) {
          logPushStep(`Erro ao buscar perfis: ${dbError.message}`);
          console.warn("[FCM Server] Erro ao buscar perfis no Supabase (usando dados locais de subscrições como alternativa):", dbError.message);
        } else {
          profiles = data || [];
          logPushStep(`Encontrados ${profiles.length} perfis com fcm_token.`);
        }
      } catch (err: any) {
        logPushStep(`Erro crítico ao buscar perfis: ${err.message || err}`);
        console.warn("[FCM Server] Excepção ao buscar perfis do Supabase:", err.message || err);
      }

      // 3. Regras de filtragem de público-alvo (Audience filtering)
      const isMasterEmail = (email?: string) => {
        const e = (email || "").toLowerCase();
        return e.includes("master@atrioswork.com") || 
               e.includes("izarellebraga@gmail.com") || 
               e.includes("master@digitalnexus.com") ||
               e.includes("jefersongoes36@gmail.com");
      };

      const isAdminUser = (profile: any) => {
        const emailVal = (profile.email || "").toLowerCase();
        const roleVal = (profile.role || "").toLowerCase();
        return isMasterEmail(emailVal) || roleVal === "admin" || roleVal === "master";
      };

      // Função de classificação estrita de Notificações do Sistema para proteção do usuário comum
      const isSystemNotification = (tTitle: string, tBody: string, tAudience?: string, hasTargetUser?: boolean) => {
        const audL = (tAudience || "").toLowerCase();
        if (hasTargetUser || audL === "all" || audL === "todos" || audL === "geral" || audL === "user" || audL === "users" || audL === "free" || audL === "gratis" || audL === "premium" || audL === "pro") {
          return false;
        }

        const titleL = (tTitle || "").toLowerCase();
        const bodyL = (tBody || "").toLowerCase();

        if (audL === "admin" || audL === "master" || audL === "support") {
          return true;
        }

        const systemKeywords = [
          "atendimento humano",
          "novo utilizador",
          "novo cadastro",
          "novo registo",
          "registou-se",
          "registrado",
          "desbloqueio",
          "venda realizada",
          "nova venda",
          "solicitou atendimento",
          "solicitação de"
        ];

        return systemKeywords.some(keyword => titleL.includes(keyword) || bodyL.includes(keyword));
      };

      const hasTargetUser = !!(targetUserId || targetUserEmail);
      const isSys = isSystemNotification(title, body, audience, hasTargetUser);
      if (isSys) {
        logPushStep(`Classificada de forma estrita como NOTIFICAÇÃO DE SISTEMA (gravação em banco desativada por solicitação do utilizador).`);
      }

      let filteredProfiles = profiles || [];

      if (targetUserId) {
        filteredProfiles = filteredProfiles.filter((p) => p.id === targetUserId);
      } else if (targetUserEmail) {
        filteredProfiles = filteredProfiles.filter((p) => (p.email || "").toLowerCase() === targetUserEmail.toLowerCase());
      } else if (isSys) {
        filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
      } else {
        if (audience === "admin" || audience === "master") {
          filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
        } else if (audience === "vendors" || audience === "vendor") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "vendor");
        } else if (audience === "support") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "support" || isAdminUser(p));
        } else if (audience === "user" || audience === "users") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "user" && !isMasterEmail(p.email));
        } else if (audience === "free" || audience === "gratis") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "user" && !isMasterEmail(p.email));
        } else if (audience === "premium" || audience === "pro" || audience === "paid") {
          filteredProfiles = filteredProfiles;
        }
      }

      logPushStep(`Perfis filtrados para envio: ${filteredProfiles.length}`);

      // Separar tokens normais FCM e assinaturas Web Push estruturadas em JSON de forma deduplicada de verdade
      const fcmTokens: string[] = [];
      const webPushSubscriptions: any[] = [];
      const seenEndpoints = new Set<string>();
      const seenFcmTokens = new Set<string>();

      filteredProfiles.forEach((p) => {
        const token = p.fcm_token;
        if (!token) return;

        let trimmedToken = "";
        try {
          trimmedToken = typeof token === "string" ? token.trim() : JSON.stringify(token);
        } catch (err) {
          logPushStep(`Erro ao converter fcm_token de ${p.email || p.id} para string: ${err}`);
          return;
        }

        if (!trimmedToken) return;

        // Se o token começa com '{', é um objeto JSON de assinatura Web Push VAPID e/ou FCM
        if (trimmedToken.startsWith("{")) {
          try {
            const sub = JSON.parse(trimmedToken);

            // 1. Extrair Web Push VAPID se endpoint e keys estiverem presentes
            if (sub && sub.endpoint && sub.keys) {
              const endpoint = sub.endpoint;
              if (!seenEndpoints.has(endpoint)) {
                seenEndpoints.add(endpoint);
                webPushSubscriptions.push({
                  subscription: {
                    endpoint: sub.endpoint,
                    keys: {
                      p256dh: sub.keys.p256dh,
                      auth: sub.keys.auth
                    }
                  },
                  userId: p.id,
                  email: p.email
                });
              }
            }

            // 2. Extrair FCM Token se presente
            const extractedFcm = sub && (sub.fcmToken || sub.fcm_token || sub.token);
            if (extractedFcm && typeof extractedFcm === "string") {
              if (!seenFcmTokens.has(extractedFcm)) {
                seenFcmTokens.add(extractedFcm);
                fcmTokens.push(extractedFcm);
              }
            } else if (!sub.endpoint) {
              if (!seenFcmTokens.has(trimmedToken)) {
                seenFcmTokens.add(trimmedToken);
                fcmTokens.push(trimmedToken);
              }
            }
          } catch (e) {
            if (!seenFcmTokens.has(trimmedToken)) {
              seenFcmTokens.add(trimmedToken);
              fcmTokens.push(trimmedToken);
            }
          }
        } else {
          if (!seenFcmTokens.has(trimmedToken)) {
            seenFcmTokens.add(trimmedToken);
            fcmTokens.push(trimmedToken);
          }
        }
      });

      // Incorporar também assinaturas salvas localmente/Firestore para retrocompatibilidade
      try {
        logPushStep("Carregando assinaturas locais/Firestore...");
        const localSubs = await loadAllSubscriptions();
        logPushStep(`Carregadas ${localSubs.length} assinaturas locais/Firestore.`);
        localSubs.forEach((ls) => {
          if (!ls.subscription) return;

          const subObj = ls.subscription;
          const userEmail = (ls.email || "").toLowerCase();
          const userRole = (ls.role || "user").toLowerCase();

          const isMaster = isMasterEmail(userEmail);
          const isAdmin = isMaster || userRole === "admin" || userRole === "master";

          let belongsToAudience = false;

          if (targetUserId) {
            belongsToAudience = ls.userId === targetUserId;
          } else if (targetUserEmail) {
            belongsToAudience = userEmail === targetUserEmail.toLowerCase();
          } else if (isSys) {
            belongsToAudience = isAdmin;
          } else {
            if (audience === "admin" || audience === "master") {
              belongsToAudience = isAdmin;
            } else if (audience === "vendors" || audience === "vendor") {
              belongsToAudience = userRole === "vendor";
            } else if (audience === "support") {
              belongsToAudience = userRole === "support" || isAdmin;
            } else if (audience === "user" || audience === "users") {
              belongsToAudience = userRole === "user" && !isAdmin;
            } else if (audience === "free" || audience === "gratis") {
              belongsToAudience = userRole === "user" && !isAdmin;
            } else if (audience === "premium" || audience === "pro" || audience === "paid") {
              belongsToAudience = true;
            } else {
              // "all", "todos", "geral", ou qualquer outro
              belongsToAudience = true;
            }
          }

          if (belongsToAudience) {
            // A) Web Push VAPID
            if (subObj.endpoint && subObj.keys) {
              const endpoint = subObj.endpoint;
              if (!seenEndpoints.has(endpoint)) {
                seenEndpoints.add(endpoint);
                webPushSubscriptions.push({
                  subscription: {
                    endpoint: subObj.endpoint,
                    keys: {
                      p256dh: subObj.keys.p256dh,
                      auth: subObj.keys.auth
                    }
                  },
                  userId: ls.userId,
                  email: ls.email
                });
              }
            }

            // B) FCM Token
            const extractedFcm = subObj.fcmToken || subObj.fcm_token || subObj.token;
            if (extractedFcm && typeof extractedFcm === "string") {
              if (!seenFcmTokens.has(extractedFcm)) {
                seenFcmTokens.add(extractedFcm);
                fcmTokens.push(extractedFcm);
              }
            }
          }
        });
      } catch (err: any) {
        logPushStep(`Erro de carregamento de assinaturas retrocompatíveis: ${err.message || err}`);
      }

      logPushStep(`Final: ${fcmTokens.length} dispositivos FCM e ${webPushSubscriptions.length} assinaturas Web Push (VAPID) prontas.`);

      let totalSent = 0;

      // 🔵 DISPARO 1: Enviar notificações via Web Push (VAPID)
      logPushStep("Processando disparos Web Push (VAPID)...");
      const webPushPromises = webPushSubscriptions.map(async (ws) => {
        const uniqueTag = `push-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const payload = JSON.stringify({
          title,
          body,
          url: absoluteTargetUrl,
          notification: {
            title,
            body,
            icon: iconUrl,
            badge: iconUrl,
            vibrate: [100, 50, 100],
            data: { url: absoluteTargetUrl },
            tag: uniqueTag,
          },
        });

        try {
          logPushStep(`Enviando Web Push para endpoint: ${ws.subscription.endpoint.substring(0, 30)}...`);
          const cleanSub = {
            endpoint: ws.subscription.endpoint,
            keys: {
              p256dh: ws.subscription.keys?.p256dh,
              auth: ws.subscription.keys?.auth
            }
          };
          await withTimeout(
            webpush.sendNotification(cleanSub, payload, {
              headers: {
                "Urgency": "high"
              },
              TTL: 86400
            }),
            8000,
            "Timeout ao enviar Web Push (8s)"
          );
          totalSent++;
          logPushStep(`Web Push enviado com sucesso para ${ws.subscription.endpoint.substring(0, 30)}...`);
        } catch (err: any) {
          logPushStep(`Erro no Web Push (${err.statusCode || 'NO_STATUS'}): ${err.message || err}`);
          if (err.statusCode === 410 || err.statusCode === 404) {
            logPushStep(`Iniciando remoção em background de assinatura inválida.`);
            deleteSubscriptionFromDatabase(ws.subscription.endpoint).catch((dbErr) => {
              console.warn("[VAPID Cleanup Error] Falha de limpeza:", dbErr);
            });
          }
        }
      });

      // 🔵 DISPARO 2: Enviar notificações via Firebase Cloud Messaging (FCM)
      logPushStep("Processando disparos FCM...");
      let finalServiceAccountEnv = null;
      if (req.body.customServiceAccount) {
        try {
          finalServiceAccountEnv = typeof req.body.customServiceAccount === 'string'
            ? req.body.customServiceAccount
            : JSON.stringify(req.body.customServiceAccount);
        } catch (e) {
          console.warn("[Push Server] Falha ao parsear customServiceAccount:", e);
        }
      }

      if (!finalServiceAccountEnv) {
        try {
          const { data: configData } = await supabase
            .from('app_banners')
            .select('highlight')
            .eq('user_type', 'fcm_config')
            .maybeSingle();
          if (configData && configData.highlight) {
            finalServiceAccountEnv = configData.highlight;
            logPushStep("Carregadas credenciais FCM dinâmicas de app_banners.");
          }
        } catch (dbErr) {
          logPushStep(`Erro ao carregar credenciais dinâmicas de app_banners: ${dbErr}`);
        }
      }

      if (!finalServiceAccountEnv) {
        finalServiceAccountEnv = serviceAccountEnv;
      }

      // Pré-obter o token de acesso OAuth do Google apenas uma vez para o envio em lote
      let cachedAccessToken: string | null = null;
      let fcmProjectId: string | null = null;

      if (finalServiceAccountEnv) {
        try {
          const serviceAccount = JSON.parse(finalServiceAccountEnv);
          fcmProjectId = serviceAccount.project_id;
          if (serviceAccount.client_email && serviceAccount.private_key) {
            cachedAccessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key);
            logPushStep(`Token de acesso OAuth2 obtido com sucesso para o envio FCM do projeto: ${fcmProjectId}`);
          }
        } catch (tokenErr: any) {
          logPushStep(`Erro ao pré-obter token de acesso OAuth2 do Google: ${tokenErr.message || tokenErr}`);
        }
      }

      const fcmPromises = fcmTokens.map(async (token) => {
        const uniqueTag = `push-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const isUsingDefaultProject = !finalServiceAccountEnv || finalServiceAccountEnv === serviceAccountEnv;
        
        // Método A: Usar Firebase Admin SDK se inicializado e estivermos no projeto padrão
        if (isFirebaseAdminInitialized && isUsingDefaultProject) {
          try {
            logPushStep(`Enviando via FCM Admin para token: ${token.substring(0, 15)}...`);
            await withTimeout(
              getMessaging().send({
                token,
                notification: { title, body },
                android: { priority: "high" },
                apns: {
                  headers: {
                    "apns-priority": "10",
                    "apns-push-type": "alert"
                  },
                  payload: {
                    aps: {
                      alert: { title, body },
                      sound: "default",
                      "content-available": 1
                    },
                  },
                },
                webpush: {
                  headers: {
                    Urgency: "high",
                    urgency: "high",
                    TTL: "86400",
                    ttl: "86400"
                  },
                  notification: {
                    title,
                    body,
                    icon: iconUrl,
                    badge: iconUrl,
                    clickAction: absoluteTargetUrl,
                    requireInteraction: true,
                    tag: uniqueTag
                  },
                  fcmOptions: { link: absoluteTargetUrl },
                },
                data: {
                  url: absoluteTargetUrl,
                  click_action: absoluteTargetUrl,
                },
              }),
              10000,
              "Timeout do Firebase Admin (10s)"
            );
            totalSent++;
            logPushStep(`FCM Admin enviado com sucesso para ${token.substring(0, 15)}...`);
            return;
          } catch (fcmAdminErr: any) {
            logPushStep(`Erro FCM Admin: ${fcmAdminErr.message}`);
            const errMsg = (fcmAdminErr?.message || "").toLowerCase();
            const errCode = (fcmAdminErr?.code || "").toLowerCase();
            if (
              errMsg.includes("registration-token-not-registered") ||
              errMsg.includes("unregistered") ||
              errMsg.includes("not-found") ||
              errCode.includes("registration-token-not-registered") ||
              errCode.includes("not-found") ||
              errMsg.includes("mismatched-credential") ||
              errMsg.includes("senderid mismatch") ||
              errMsg.includes("sender_id_mismatch") ||
              errCode.includes("mismatched-credential")
            ) {
              logPushStep(`Erro definitivo de token FCM detetado no Admin SDK. Iniciando limpeza do token...`);
              deleteFcmTokenFromDatabase(token).catch((cleanErr) => {
                console.warn("[FCM Admin Cleanup Error]", cleanErr);
              });
            }
          }
        }

        // Método B: Enviar via REST API HTTP v1 de forma direta e super estável
        if (cachedAccessToken && fcmProjectId) {
          try {
            logPushStep(`Enviando via FCM HTTP v1 para token: ${token.substring(0, 15)}...`);
            const projectId = fcmProjectId;
            const accessToken = cachedAccessToken;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const fcmResponse = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token,
                    notification: { title, body, image: iconUrl },
                    android: { 
                      priority: "HIGH",
                      notification: {
                        channel_id: "default",
                        default_sound: true,
                        visibility: "PUBLIC",
                        notification_priority: "PRIORITY_MAX",
                        click_action: absoluteTargetUrl,
                        icon: iconUrl
                      }
                    },
                    apns: {
                      headers: { 
                        "apns-priority": "10",
                        "apns-push-type": "alert"
                      },
                      payload: { 
                        aps: { 
                          alert: { title, body },
                          sound: "default",
                          "content-available": 1
                        } 
                      },
                    },
                    webpush: {
                      headers: {
                        Urgency: "high",
                        TTL: "86400"
                      },
                      notification: {
                        title,
                        body,
                        icon: iconUrl,
                        badge: iconUrl,
                        requireInteraction: true,
                        tag: uniqueTag
                      },
                      fcm_options: { link: absoluteTargetUrl },
                      data: { title, body, url: absoluteTargetUrl }
                    },
                    data: { 
                      title,
                      body,
                      url: absoluteTargetUrl,
                      click_action: absoluteTargetUrl,
                    },
                  },
                }),
                signal: controller.signal
              }
            );

            clearTimeout(timeoutId);

            if (fcmResponse.ok) {
              totalSent++;
              logPushStep(`FCM HTTP v1 enviado com sucesso para ${token.substring(0, 15)}...`);
            } else {
              const fcmErrResult = await fcmResponse.json() as any;
              logPushStep(`Erro FCM HTTP v1: ${JSON.stringify(fcmErrResult)}`);
              const errorObj = fcmErrResult?.error || {};
              const errMessage = (errorObj.message || "").toLowerCase();
              const errStatus = (errorObj.status || "").toLowerCase();
              const details = errorObj.details || [];
              const hasUnregistered = details.some((d: any) => d.errorCode === "UNREGISTERED") || 
                                      errMessage.includes("unregistered") || 
                                      errMessage.includes("not_found") || 
                                      errStatus === "not_found" ||
                                      errorObj.code === 404;
                                      
              const hasSenderMismatch = details.some((d: any) => d.errorCode === "SENDER_ID_MISMATCH") || 
                                        errMessage.includes("senderid mismatch") || 
                                        errMessage.includes("sender_id_mismatch") ||
                                        errStatus === "permission_denied" ||
                                        errorObj.code === 403;

              if (hasUnregistered || hasSenderMismatch) {
                logPushStep(`Erro definitivo de token FCM detetado no HTTP v1 (${hasUnregistered ? 'UNREGISTERED' : 'SENDER_ID_MISMATCH'}). Iniciando limpeza...`);
                deleteFcmTokenFromDatabase(token).catch((cleanErr) => {
                  console.warn("[FCM HTTP Fallback Cleanup Error]", cleanErr);
                });
              }
            }
          } catch (fetchErr: any) {
            logPushStep(`Falha FCM HTTP v1: ${fetchErr.message || fetchErr}`);
          }
        }
      });

      // Aguarda todos os disparos terminarem com um limite de tempo geral de 12 segundos
      logPushStep("Aguardando conclusão de todas as promessas de envio...");
      await withTimeout(
        Promise.all([...webPushPromises, ...fcmPromises]),
        12000,
        "Tempo de espera esgotado aguardando envio das promessas"
      );

      logPushStep(`Envios finalizados. Total enviado: ${totalSent}`);

      return res.json({
        success: true,
        sent: totalSent,
        message: `Disparo concluído com sucesso. Notificações enviadas a ${totalSent} destinos.`,
      });

    } catch (err: any) {
      logPushStep(`Erro catastrófico final no Express: ${err.message || err}`);
      return res.status(500).json({
        success: false,
        error: err.message || String(err),
      });
    }
  });
  /* REMOVE_END */

  // ----------------------------------------------------
  // RESILIENT IN-MEMORY FALLBACK DATABASE FOR SUPPORT
  // (Prevents system breakage due to broken Supabase triggers)
  // ----------------------------------------------------
  const fallbackTicketsPath = path.join(process.cwd(), "fallback-tickets.json");
  const fallbackMessagesPath = path.join(process.cwd(), "fallback-messages.json");

  function loadFallbackTickets(): any[] {
    if (fs.existsSync(fallbackTicketsPath)) {
      try {
        return JSON.parse(fs.readFileSync(fallbackTicketsPath, "utf-8"));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function saveFallbackTickets(tickets: any[]) {
    try {
      fs.writeFileSync(fallbackTicketsPath, JSON.stringify(tickets, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving fallback tickets:", e);
    }
  }

  function loadFallbackMessages(): any[] {
    if (fs.existsSync(fallbackMessagesPath)) {
      try {
        return JSON.parse(fs.readFileSync(fallbackMessagesPath, "utf-8"));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function saveFallbackMessages(messages: any[]) {
    try {
      fs.writeFileSync(fallbackMessagesPath, JSON.stringify(messages, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving fallback messages:", e);
    }
  }

  // Fallback API Endpoints
  app.get("/api/fallback-tickets", (req, res) => {
    try {
      const tickets = loadFallbackTickets();
      return res.json(tickets);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/fallback-tickets", (req, res) => {
    try {
      const { user_id, status, last_message, user_name, user_email } = req.body;
      if (!user_id) {
        return res.status(400).json({ error: "user_id é obrigatório." });
      }

      const tickets = loadFallbackTickets();
      const existingIdx = tickets.findIndex(t => t.user_id === user_id);
      const nowStr = new Date().toISOString();

      if (existingIdx !== -1) {
        tickets[existingIdx] = {
          ...tickets[existingIdx],
          status: status || tickets[existingIdx].status || 'open',
          last_message: last_message || tickets[existingIdx].last_message,
          updated_at: nowStr,
          user_name: user_name || tickets[existingIdx].user_name,
          user_email: user_email || tickets[existingIdx].user_email,
        };
      } else {
        tickets.push({
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          user_id,
          status: status || 'open',
          last_message: last_message || '',
          updated_at: nowStr,
          user_name: user_name || 'Visitante/Utilizador',
          user_email: user_email || '',
        });
      }

      saveFallbackTickets(tickets);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/fallback-messages/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const messages = loadFallbackMessages();
      const filtered = messages.filter(m => m.user_id === userId);
      return res.json(filtered);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/fallback-messages", (req, res) => {
    try {
      const { user_id, text, sender_role } = req.body;
      if (!user_id || !text || !sender_role) {
        return res.status(400).json({ error: "user_id, text e sender_role são obrigatórios." });
      }

      const messages = loadFallbackMessages();
      messages.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        user_id,
        text,
        sender_role,
        created_at: new Date().toISOString()
      });

      saveFallbackMessages(messages);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/fallback-resolve", (req, res) => {
    try {
      const { user_id } = req.body;
      if (!user_id) {
        return res.status(400).json({ error: "user_id é obrigatório." });
      }

      const tickets = loadFallbackTickets();
      const existingIdx = tickets.findIndex(t => t.user_id === user_id);
      if (existingIdx !== -1) {
        tickets[existingIdx].status = 'resolved';
        tickets[existingIdx].updated_at = new Date().toISOString();
        saveFallbackTickets(tickets);
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 🔵 6. CONFIGURAÇÃO DO MIDDLEWARE VITE E ARQUIVOS ESTÁTICOS DO CLIENTE
  // Servir arquivos de Service Worker com cabeçalhos anti-cache estritos para atualização instantânea no PWA/Navegador
  app.get(/^\/(sw-v3\.js|firebase-messaging-sw\.js)/, (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Service-Worker-Allowed", "/");
    next();
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AtriosWork Backend] Servidor híbrido (FCM + Web Push VAPID) rodando na porta ${PORT}`);
  });
}

startServer();
