import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import admin from "firebase-admin";

// 🔵 1. GERAÇÃO/CARREGAMENTO DE CHAVES VAPID (WEB PUSH PADRÃO)
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:master@atrioswork.com";

const keysFilePath = path.join(process.cwd(), "vapid-keys.json");

if (!vapidPublicKey || !vapidPrivateKey) {
  if (fs.existsSync(keysFilePath)) {
    try {
      const savedKeys = JSON.parse(fs.readFileSync(keysFilePath, "utf8"));
      vapidPublicKey = savedKeys.publicKey;
      vapidPrivateKey = savedKeys.privateKey;
      console.log("[VAPID] Chaves de segurança carregadas do ficheiro 'vapid-keys.json'.");
    } catch (e) {
      console.error("[VAPID] Erro ao ler 'vapid-keys.json', gerando novas chaves...", e);
    }
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    const keys = webpush.generateVAPIDKeys();
    vapidPublicKey = keys.publicKey;
    vapidPrivateKey = keys.privateKey;
    try {
      fs.writeFileSync(keysFilePath, JSON.stringify(keys, null, 2), "utf8");
      console.log("[VAPID] Novas chaves Web Push geradas e guardadas em 'vapid-keys.json'.");
    } catch (e) {
      console.error("[VAPID] Falha ao gravar novas chaves:", e);
    }
  }
}

// Configura os detalhes VAPID no pacote web-push
webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);

// 🔵 2. INICIALIZAÇÃO DO FIREBASE ADMIN SDK (FCM NATIVO)
const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let isFirebaseAdminInitialized = false;

const getAdminSdk = () => {
  if (admin && (admin as any).apps) return admin;
  if (admin && (admin as any).default && (admin as any).default.apps) return (admin as any).default;
  return admin;
};
const adminSdk = getAdminSdk() as any;

if (serviceAccountEnv) {
  try {
    const serviceAccount = JSON.parse(serviceAccountEnv);
    const apps = adminSdk && adminSdk.apps ? adminSdk.apps : [];
    if (!apps.length && adminSdk && typeof adminSdk.initializeApp === "function") {
      adminSdk.initializeApp({
        credential: adminSdk.credential ? adminSdk.credential.cert(serviceAccount) : undefined,
      });
      isFirebaseAdminInitialized = true;
      console.log("[Firebase Admin] SDK Inicializado com sucesso.");
    } else if (apps.length) {
      isFirebaseAdminInitialized = true;
    }
  } catch (err: any) {
    console.error("[Firebase Admin] Falha ao inicializar SDK via JSON da conta de serviço:", err);
  }
} else {
  console.warn("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT não encontrada. Envio nativo FCM desativado.");
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
async function saveSubscriptionToDatabase(data: { subscription: any; userId: string; companyId?: string }) {
  // 1. Gravar no arquivo local (garantia de persistência local)
  saveLocalSubscription(data);

  // 2. Gravar no Firestore se o Firebase Admin estiver ativo
  if (isFirebaseAdminInitialized) {
    try {
      const db = adminSdk.firestore();
      const safeId = Buffer.from(data.subscription.endpoint).toString("base64url");
      await db.collection("web_push_subscriptions").doc(safeId).set({
        subscription: data.subscription,
        userId: data.userId || "unknown",
        companyId: data.companyId || "unknown",
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`[Firestore] Assinatura salva com sucesso para o usuário ${data.userId}`);
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
      const db = adminSdk.firestore();
      const safeId = Buffer.from(endpoint).toString("base64url");
      await db.collection("web_push_subscriptions").doc(safeId).delete();
      console.log("[Firestore] Assinatura inválida (410/404) removida do Firestore.");
    } catch (err) {
      console.error("[Firestore] Erro ao remover assinatura do Firestore:", err);
    }
  }
}

// 🔵 5. START DO SERVIDOR EXPRESS
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ROTA: Obter a chave pública VAPID do servidor
  app.get("/api/push/public-key", (req, res) => {
    return res.json({ publicKey: vapidPublicKey });
  });

  // ROTA: Receber e salvar subscrições Web Push (VAPID) do cliente
  app.post("/api/push/subscribe", async (req, res) => {
    const { subscription, userId, companyId } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: "Subscrição inválida." });
    }
    await saveSubscriptionToDatabase({ subscription, userId, companyId });
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
      const { title, body, audience, url = "/" } = req.body;

      if (!title || !body) {
        return res.status(400).json({
          success: false,
          error: "Campos 'title' e 'body' são obrigatórios.",
        });
      }

      console.log(`[Push Server] Disparando notificação: "${title}" para público: "${audience || "geral"}"`);

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

      // 2. Obter perfis ativos do Supabase que contêm fcm_token ou subscrições
      const { data: profiles, error: dbError } = await supabase
        .from("profiles")
        .select("id, fcm_token, role, email")
        .not("fcm_token", "is", null);

      if (dbError) {
        console.error("[FCM Server] Erro ao buscar perfis no Supabase:", dbError);
        return res.status(500).json({
          success: false,
          error: `Erro de banco de dados Supabase: ${dbError.message}`,
        });
      }

      // 3. Regras de filtragem de público-alvo (Audience filtering)
      const isMasterEmail = (email?: string) => {
        const e = (email || "").toLowerCase();
        return e.includes("master@atrioswork.com") || 
               e.includes("izarellebraga@gmail.com") || 
               e.includes("master@digitalnexus.com");
      };

      const isAdminUser = (profile: any) => {
        return profile.role === "admin" || isMasterEmail(profile.email);
      };

      let filteredProfiles = profiles || [];

      if (audience === "admin" || audience === "master") {
        filteredProfiles = filteredProfiles.filter((p) => isAdminUser(p));
      } else if (audience === "vendors") {
        filteredProfiles = filteredProfiles.filter((p) => p.role === "vendor");
      } else if (audience === "support") {
        filteredProfiles = filteredProfiles.filter((p) => p.role === "support" || isAdminUser(p));
      } else if (audience === "user") {
        filteredProfiles = filteredProfiles.filter((p) => p.role === "user" && !isMasterEmail(p.email));
      }

      // Separar tokens normais FCM e assinaturas Web Push estruturadas em JSON
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
      const localSubs = loadLocalSubscriptions();
      localSubs.forEach((ls) => {
        if (!ls.subscription || !ls.subscription.endpoint) return;
        // Evitar duplicados pelo endpoint
        const jaExiste = webPushSubscriptions.some((ws) => ws.subscription.endpoint === ls.subscription.endpoint);
        if (!jaExiste) {
          // Filtrar por audiência se for possível associar perfil do usuário correspondente
          const matchingProfile = profiles?.find((p) => p.id === ls.userId);
          if (matchingProfile) {
            const belongsToAudience = filteredProfiles.some((p) => p.id === ls.userId);
            if (belongsToAudience) {
              webPushSubscriptions.push(ls);
            }
          } else {
            // Se não conseguimos vincular, mas o público é geral, enviamos
            if (!audience || audience === "geral" || audience === "all" || audience === "user") {
              webPushSubscriptions.push(ls);
            }
          }
        }
      });

      console.log(`[Push Server] Encontrados ${fcmTokens.length} dispositivos FCM e ${webPushSubscriptions.length} assinaturas Web Push (VAPID).`);

      let totalSent = 0;

      // 🔵 DISPARO 1: Enviar notificações via Web Push (VAPID)
      const webPushPromises = webPushSubscriptions.map(async (ws) => {
        const payload = JSON.stringify({
          notification: {
            title,
            body,
            icon: "/logo_atualizado.jpg?v=20260314_v1",
            badge: "/logo_atualizado.jpg?v=20260314_v1",
            vibrate: [100, 50, 100],
            data: { url },
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
            await adminSdk.messaging().send({
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
                },
                payload: {
                  aps: {
                    alert: {
                      title,
                      body,
                    },
                    sound: "default",
                  },
                },
              },
              webpush: {
                headers: {
                  Urgency: "high",
                },
                notification: {
                  title,
                  body,
                  icon: "/logo_atualizado.jpg?v=20260314_v1",
                  badge: "/logo_atualizado.jpg?v=20260314_v1",
                },
                fcmOptions: {
                  link: url,
                },
              },
              data: {
                url,
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
                    android: { priority: "high" },
                    apns: {
                      headers: { "apns-priority": "10" },
                      payload: { aps: { sound: "default" } },
                    },
                    webpush: {
                      headers: {
                        Urgency: "high",
                      },
                      notification: {
                        title,
                        body,
                        icon: "/logo_atualizado.jpg?v=20260314_v1",
                        badge: "/logo_atualizado.jpg?v=20260314_v1",
                      },
                      fcm_options: { link: url },
                    },
                    data: { url },
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
