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
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:master@atrioswork.com";

const keysFilePath = path.join(process.cwd(), "vapid-keys.json");

async function initializeVapidKeys() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (vapidPublicKey && vapidPrivateKey) {
    console.log("[VAPID] Chaves Web Push obtidas via variáveis de ambiente.");
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    return;
  }

  // 1. Tentar obter do Supabase (Nuvem Persistente)
  if (supabaseServiceKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

// 🔵 2. INICIALIZAÇÃO DO FIREBASE ADMIN SDK (FCM NATIVO E FIRESTORE)
const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let isFirebaseAdminInitialized = false;

try {
  const apps = getApps();
  if (!apps.length) {
    if (serviceAccountEnv) {
      const serviceAccount = JSON.parse(serviceAccountEnv);
      const isServiceAccount = serviceAccount && (serviceAccount.type === "service_account" || (serviceAccount.client_email && serviceAccount.private_key));
      
      if (isServiceAccount) {
        initializeApp({
          credential: cert(serviceAccount),
        });
        isFirebaseAdminInitialized = true;
        console.log("[Firebase Admin] SDK Inicializado com sucesso via conta de serviço.");
      } else {
        initializeApp();
        isFirebaseAdminInitialized = true;
        console.log("[Firebase Admin] SDK Inicializado com credenciais padrão do Google Cloud.");
      }
    } else {
      // Tentar ler o projectId do firebase-applet-config.json para inicialização nativa no Cloud Run
      let configProjId = undefined;
      try {
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const configJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
          configProjId = configJson.projectId;
        }
      } catch (e) {
        // Ignorar erro silenciosamente
      }

      initializeApp({
        projectId: configProjId || "gen-lang-client-0484473706"
      });
      isFirebaseAdminInitialized = true;
      console.log("[Firebase Admin] SDK Inicializado automaticamente com Project ID:", configProjId);
    }
  } else {
    isFirebaseAdminInitialized = true;
  }
} catch (err: any) {
  console.error("[Firebase Admin] Falha ao inicializar SDK:", err.message || err);
}

// Helper para obter token de acesso do Google OAuth2 de forma nativa e segura para fallback HTTP v1
function getGoogleAccessToken(clientEmail: string, privateKey: string): string {
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

  return `${toSign}.${signature}`;
}

function getFirestoreDb() {
  let databaseId: string | undefined = undefined;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const configJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
      databaseId = configJson.firestoreDatabaseId;
    }
  } catch (e) {
    // Ignorar erro silenciosamente
  }

  const apps = getApps();
  const app = apps.length > 0 ? apps[0] : undefined;
  
  if (app && databaseId) {
    return getFirestore(app, databaseId);
  }
  return getFirestore();
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
      const db = getFirestoreDb();
      const snapshot = await db.collection("web_push_subscriptions").get();
      const firestoreSubs: any[] = [];
      snapshot.forEach((doc) => {
        firestoreSubs.push(doc.data());
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
    } catch (e) {
      console.error("[Push Server] Erro ao carregar assinaturas do Firestore:", e);
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
      const db = getFirestoreDb();
      const safeId = Buffer.from(data.subscription.endpoint).toString("base64url");
      await db.collection("web_push_subscriptions").doc(safeId).set({
        subscription: data.subscription,
        userId: data.userId || "unknown",
        companyId: data.companyId || "unknown",
        email: data.email || null,
        role: data.role || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`[Firestore] Assinatura salva com sucesso para o usuário ${data.userId} (${data.email})`);
    } catch (err) {
      console.error("[Firestore] Erro ao gravar assinatura de Web Push:", err);
    }
  }

  // 3. Espelhar no Supabase na tabela profiles sob fcm_token (como JSON string para retrocompatibilidade)
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseServiceKey && data.userId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
      const db = getFirestoreDb();
      const safeId = Buffer.from(endpoint).toString("base64url");
      await db.collection("web_push_subscriptions").doc(safeId).delete();
      console.log("[Firestore] Assinatura inválida (410/404) removida do Firestore.");
    } catch (err) {
      console.error("[Firestore] Erro ao remover assinatura do Firestore:", err);
    }
  }

  // Remover do Supabase
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
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

// 🔵 5. START DO SERVIDOR EXPRESS
async function startServer() {
  await initializeVapidKeys();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

  // ROTA: Envio de Push Inteligente (Suporta FCM de forma nativa/v1 + Web Push VAPID + Fallbacks)
  app.post("/api/send-fcm-push", async (req, res) => {
    try {
      const { title, body, audience, url = "/", targetUserId, targetUserEmail } = req.body;

      if (!title || !body) {
        return res.status(400).json({
          success: false,
          error: "Campos 'title' e 'body' são obrigatórios.",
        });
      }

      // Map parameters robustly: support targetUserId as userId, and if they represent "master", "admin", or "support"
      // we map them to the proper group audience. This prevents failures where UUID-based queries look for the literal string "master"
      let finalTargetUserId = targetUserId || req.body.userId;
      let finalAudience = audience || "";

      if (finalTargetUserId && typeof finalTargetUserId === "string") {
        const lowerId = finalTargetUserId.toLowerCase();
        if (lowerId === "master" || lowerId === "admin" || lowerId === "support") {
          finalAudience = lowerId;
          finalTargetUserId = undefined;
        }
      }

      // Calcular dinamicamente o link do ícone do domínio ativo do request (evita chaves e imagens expiradas/CORS)
      const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const host = req.get("host") || "atrioswork.pt";
      const currentOrigin = `${protocol}://${host}`;
      const iconUrl = `${currentOrigin}/logo_atualizado.jpg?v=20260314_v1`;

      // Garantir que a URL de destino seja absoluta para que o SO/Navegador consiga abrir o app quando fechado
      let absoluteTargetUrl = url;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        const cleanPath = url.startsWith("/") ? url.substring(1) : url;
        absoluteTargetUrl = `${currentOrigin}/${cleanPath}`;
      }

      console.log(`[Push Server] Disparando notificação: "${title}" para público: "${finalAudience || "geral"}" (finalTargetUserId: ${finalTargetUserId || 'nenhum'}, targetUserEmail: ${targetUserEmail || 'nenhum'}) - URL Destino: ${absoluteTargetUrl}`);

      // 1. Obter credenciais do Supabase
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseServiceKey) {
        return res.status(400).json({
          success: false,
          error: "Credenciais do Supabase não configuradas nas variáveis de ambiente.",
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // 2. Obter perfis ativos do Supabase de forma inteligente e resiliente para evitar limites de paginação (max 1000)
      let profiles: any[] = [];
      try {
        const hasTargetUser = !!(finalTargetUserId || targetUserEmail);
        const titleL = (title || "").toLowerCase();
        const bodyL = (body || "").toLowerCase();
        const audL = (finalAudience || "").toLowerCase();
        const isSys = (audL === "admin" || audL === "master" || audL === "support") || 
                      (!hasTargetUser && audL !== "user" && (
                        titleL.includes("atendimento humano") || bodyL.includes("atendimento humano") ||
                        titleL.includes("novo utilizador") || bodyL.includes("novo utilizador") ||
                        titleL.includes("novo cadastro") || bodyL.includes("novo cadastro") ||
                        titleL.includes("novo registo") || bodyL.includes("novo registo") ||
                        titleL.includes("registou-se") || bodyL.includes("registou-se") ||
                        titleL.includes("registrado") || bodyL.includes("registrado") ||
                        titleL.includes("desbloqueio") || bodyL.includes("desbloqueio") ||
                        titleL.includes("venda realizada") || bodyL.includes("venda realizada") ||
                        titleL.includes("nova venda") || bodyL.includes("nova venda") ||
                        titleL.includes("solicitou atendimento") || bodyL.includes("solicitou atendimento") ||
                        titleL.includes("solicitação de") || bodyL.includes("solicitação de")
                      ));

        let query = supabase.from("profiles").select("id, fcm_token, role, email");

        if (finalTargetUserId) {
          query = query.eq("id", finalTargetUserId);
        } else if (targetUserEmail) {
          query = query.ilike("email", targetUserEmail);
        } else if (isSys || audL === "admin" || audL === "master") {
          // Otimização crucial: buscar apenas perfis que sejam admins, masters ou que tenham e-mails de Master
          query = query.or("role.eq.admin,role.eq.master,email.ilike.%master@atrioswork.com%,email.ilike.%izarellebraga@gmail.com%,email.ilike.%master@digitalnexus.com%");
        } else if (audL === "vendors") {
          query = query.eq("role", "vendor");
        } else if (audL === "support") {
          query = query.or("role.eq.support,role.eq.admin,role.eq.master,email.ilike.%master@atrioswork.com%,email.ilike.%izarellebraga@gmail.com%,email.ilike.%master@digitalnexus.com%");
        } else if (audL === "user") {
          query = query.eq("role", "user");
        }

        const { data, error: dbError } = await query;

        if (dbError) {
          console.warn("[FCM Server] Erro ao buscar perfis no Supabase (usando dados locais de subscrições como alternativa):", dbError.message);
        } else {
          profiles = data || [];
          console.log(`[FCM Server] Consulta de perfis retornou ${profiles.length} registos correspondentes.`);
        }
      } catch (err: any) {
        console.warn("[FCM Server] Excepção ao buscar perfis do Supabase:", err.message || err);
      }

      // 3. Regras de filtragem de público-alvo (Audience filtering)
      const isMasterEmail = (email?: string) => {
        const e = (email || "").toLowerCase();
        return e.includes("master@atrioswork.com") || 
               e.includes("izarellebraga@gmail.com") || 
               e.includes("master@digitalnexus.com");
      };

      const isAdminUser = (profile: any) => {
        const emailVal = (profile.email || "").toLowerCase();
        const roleVal = (profile.role || "").toLowerCase();
        return isMasterEmail(emailVal) || roleVal === "admin" || roleVal === "master";
      };

      // Função de classificação estrita de Notificações do Sistema para proteção do usuário comum
      const isSystemNotification = (tTitle: string, tBody: string, tAudience?: string, hasTargetUser?: boolean) => {
        // Se houver destinatário específico ou for para audiência de usuários comuns, NÃO é notificação de sistema administrativo!
        if (hasTargetUser || tAudience === "user") {
          return false;
        }

        const titleL = (tTitle || "").toLowerCase();
        const bodyL = (tBody || "").toLowerCase();
        const audL = (tAudience || "").toLowerCase();

        // Se a audiência explícita for de administração ou suporte técnico, considera-se sistema sensível
        if (audL === "admin" || audL === "master" || audL === "support") {
          return true;
        }

        // Palavras-chave estritas associadas a notificações do sistema/atendimento administrativo
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

      const hasTargetUser = !!(finalTargetUserId || targetUserEmail);
      const isSys = isSystemNotification(title, body, finalAudience, hasTargetUser);
      if (isSys) {
        console.log(`[Push Server] Notificação "${title}" classificada de forma estrita como NOTIFICAÇÃO DE SISTEMA. Filtrando apenas para contas Master.`);
      }

      let filteredProfiles = profiles || [];

      if (finalTargetUserId) {
        filteredProfiles = filteredProfiles.filter((p) => p.id === finalTargetUserId);
      } else if (targetUserEmail) {
        filteredProfiles = filteredProfiles.filter((p) => (p.email || "").toLowerCase() === targetUserEmail.toLowerCase());
      } else if (isSys) {
        // Notificações de sistema vão UNICAMENTE para os Master accounts
        filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
      } else {
        // Fluxo normal para as outras notificações (ex: expiração de licença, informativos gerais, etc.)
        if (finalAudience === "admin" || finalAudience === "master") {
          filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
        } else if (finalAudience === "vendors") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "vendor");
        } else if (finalAudience === "support") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "support" || isAdminUser(p));
        } else if (finalAudience === "user") {
          filteredProfiles = filteredProfiles.filter((p) => p.role === "user" && !isMasterEmail(p.email));
        }
      }

      // Separar tokens normais FCM e assinaturas Web Push estruturadas in JSON
      const fcmTokens: string[] = [];
      const webPushSubscriptions: any[] = [];

      filteredProfiles.forEach((p) => {
        const token = p.fcm_token;
        if (!token || !token.trim()) return;

        // Se o token começa com '{', é um objeto JSON de assinatura Web Push VAPID
        if (token.trim().startsWith("{")) {
          try {
            const sub = JSON.parse(token);
            if (sub && sub.endpoint) {
              webPushSubscriptions.push({
                subscription: sub,
                userId: p.id,
              });
              // Se houver um token FCM embutido, adiciona também aos disparos de FCM para cobertura dupla
              if (sub.fcmToken) {
                fcmTokens.push(sub.fcmToken);
              }
            }
          } catch (e) {
            // Se falhar o parse, trata como token normal
            fcmTokens.push(token);
          }
        } else {
          fcmTokens.push(token);
        }
      });

      // Incorporar também assinaturas salvas localmente/Firestore para retrocompatibilidade
      const localSubs = await loadAllSubscriptions();
      localSubs.forEach((ls) => {
        if (!ls.subscription || !ls.subscription.endpoint) return;
        // Evitar duplicados pelo endpoint
        const jaExiste = webPushSubscriptions.some((ws) => ws.subscription.endpoint === ls.subscription.endpoint);
        if (!jaExiste) {
          // 1. Tentar associar usando dados de perfis se disponíveis
          const matchingProfile = profiles?.find((p) => p.id === ls.userId);
          
          // 2. Determinar de forma independente as informações do utilizador (usando perfil do Supabase ou dados embutidos na assinatura)
          const userEmail = (matchingProfile?.email || ls.email || "").toLowerCase();
          const userRole = (matchingProfile?.role || ls.role || "user").toLowerCase();

          // 3. Verificar se o e-mail ou dados correspondem a um Master/Admin
          const isMaster = isMasterEmail(userEmail);
          const isAdmin = isMaster || userRole === "admin" || userRole === "master";

          let belongsToAudience = false;

          if (finalTargetUserId) {
            belongsToAudience = ls.userId === finalTargetUserId;
          } else if (targetUserEmail) {
            belongsToAudience = (ls.email || "").toLowerCase() === targetUserEmail.toLowerCase();
          } else if (isSys) {
            belongsToAudience = isAdmin;
          } else {
            if (finalAudience === "admin" || finalAudience === "master") {
              belongsToAudience = isAdmin;
            } else if (finalAudience === "vendors") {
              belongsToAudience = userRole === "vendor";
            } else if (finalAudience === "support") {
              belongsToAudience = userRole === "support" || isAdmin;
            } else if (finalAudience === "user") {
              belongsToAudience = userRole === "user" && !isAdmin;
            } else if (!finalAudience || finalAudience === "geral" || finalAudience === "all") {
              belongsToAudience = true;
            }
          }

          if (belongsToAudience) {
            webPushSubscriptions.push(ls);
          }
        }
      });

      console.log(`[Push Server] Encontrados ${fcmTokens.length} dispositivos FCM e ${webPushSubscriptions.length} assinaturas Web Push (VAPID).`);

      let totalSent = 0;

      // 🔵 DISPARO 1: Enviar notificações via Web Push (VAPID)
      const webPushPromises = webPushSubscriptions.map(async (ws) => {
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
          },
        });

        try {
          await webpush.sendNotification(ws.subscription, payload, {
            headers: {
              "Urgency": "high"
            },
            TTL: 86400 // 1 dia de tempo de vida
          });
          totalSent++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[VAPID] Assinatura inválida (status ${err.statusCode}). Excluindo do banco.`);
            await deleteSubscriptionFromDatabase(ws.subscription.endpoint);
          } else {
            console.error("[VAPID] Erro ao enviar notificação para assinatura:", err.message || err);
          }
        }
      });

      // 🔵 DISPARO 2: Enviar notificações via Firebase Cloud Messaging (FCM)
      const fcmPromises = fcmTokens.map(async (token) => {
        // Método A: Usar Firebase Admin SDK se inicializado
        if (isFirebaseAdminInitialized) {
          try {
            await getMessaging().send({
              token,
              notification: {
                title,
                body,
              },
              android: {
                priority: "high",
              },
              apns: {
                headers: {
                  "apns-priority": "10",
                  "apns-push-type": "alert"
                },
                payload: {
                  aps: {
                    alert: {
                      title,
                      body,
                    },
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
                  requireInteraction: true
                },
                fcmOptions: {
                  link: absoluteTargetUrl,
                },
              },
              data: {
                url: absoluteTargetUrl,
                click_action: absoluteTargetUrl,
              },
            });
            totalSent++;
            return;
          } catch (fcmAdminErr: any) {
            console.error(`[FCM Admin] Erro de envio para o token ${token.substring(0, 15)}...:`, fcmAdminErr.message);
            // Se o token for inválido/não registrado, podemos opcionalmente remover se suportado
          }
        }

        // Método B: Fallback para requisição direta à API HTTP v1 se tivermos a conta de serviço carregada
        if (serviceAccountEnv) {
          try {
            const serviceAccount = JSON.parse(serviceAccountEnv);
            const accessToken = getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key);
            const projectId = serviceAccount.project_id;

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
                    notification: { title, body },
                    android: { 
                      priority: "HIGH",
                      notification: {
                        notification_priority: "PRIORITY_HIGH",
                        visibility: "PUBLIC",
                        sound: "default"
                      }
                    },
                    apns: {
                      headers: { 
                        "apns-priority": "10",
                        "apns-push-type": "alert"
                      },
                      payload: { 
                        aps: { 
                          sound: "default",
                          "content-available": 1
                        } 
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
                        click_action: absoluteTargetUrl,
                        clickAction: absoluteTargetUrl,
                        requireInteraction: true
                      },
                      fcm_options: { link: absoluteTargetUrl },
                    },
                    data: { 
                      url: absoluteTargetUrl,
                      click_action: absoluteTargetUrl,
                    },
                  },
                }),
              }
            );

            if (fcmResponse.ok) {
              totalSent++;
            } else {
              const fcmErrResult = await fcmResponse.json();
              console.error(`[FCM HTTP Fallback] Erro para o token ${token.substring(0, 15)}...:`, fcmErrResult);
            }
          } catch (fetchErr: any) {
            console.error(`[FCM HTTP Fallback] Falha de rede para o token ${token.substring(0, 15)}...:`, fetchErr);
          }
        }
      });

      // Aguarda todos os disparos terminarem
      await Promise.all([...webPushPromises, ...fcmPromises]);

      return res.json({
        success: true,
        sent: totalSent,
        message: `Disparo concluído com sucesso. Notificações enviadas a ${totalSent} destinos.`,
      });

    } catch (err: any) {
      console.error("[FCM Server] Erro catastrófico de disparo:", err);
      return res.status(500).json({
        success: false,
        error: err.message || String(err),
      });
    }
  });

  // 🔵 6. CONFIGURAÇÃO DO MIDDLEWARE VITE E ARQUIVOS ESTÁTICOS DO CLIENTE
  // Servir arquivos de Service Worker com cabeçalhos anti-cache estritos para atualização instantânea no PWA/Navegador
  app.get(/^\/(sw-v3\.js|firebase-messaging-sw\.js)/, (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
