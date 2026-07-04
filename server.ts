import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";

const PORT = 3000;
const TOKENS_FILE = path.join(process.cwd(), "fcm_tokens.json");

// Auxiliar para ler tokens registrados
function getTokens(): Record<string, { token: string; role?: string; updatedAt: string }[]> {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Erro ao ler arquivo de tokens FCM:", err);
  }
  return {};
}

// Auxiliar para salvar tokens
function saveTokens(tokens: Record<string, { token: string; role?: string; updatedAt: string }[]>) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar tokens FCM:", err);
  }
}

// Inicializar Firebase Admin de forma preguiçosa e segura
let firebaseAdminApp: any = null;

function getFirebaseAdmin(): any {
  if (firebaseAdminApp) return admin;

  try {
    let serviceAccount: any = null;
    
    // 1. Tentar ler do environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      // 2. Usar o fallback com a conta provida pelo utilizador
      serviceAccount = {
        type: "service_account",
        project_id: "push-atrios-work",
        private_key_id: "4e5711f0f31cc03b136828dfd0529a185120c111",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDSJEvVxvs/HUE/\nOV23f3nE5WKtL1P0a4DVWkEY5RQYWW0i1b714djosGgi8VInEzzI7n0XtRHpLKj8\nFOsmanS1MdkMi3IRx+0qiqY2tO8EK2jI0YhKwOxCgMJiqVnzDDN+Jz8498T8Zyoo\nQN0pONGX/ZbtXBDRkRa9RdHfb76caErr8iad77QfXi2Q+D+KENZPqpb11AkbEKkY\nHsLdDbj5z7MFVs08dZgnVcscei4yMiUiPd1BYDlbC5PU5SwKDXp8EwliB3THOujW\nCSvBiKj/QlGmdiwwYp+XNzNrk+0KJm7HhmpPd61vSXBh1vnThz/aORDqPz8Uv21r\nRJCyLVyXAgMBAAECggEAQGK+mZGOCZh9FVIOVNrKBHoD8ew+XPVTVAuDRo1pyswb\nlEDJcazxONpUDeDCuxY52Za43TqtcjQs0o/WPL8BY0MSrbVMDgajtBUnODvXv/9M\n67rHd6AEw5uP84rP9JgYbt63kEzaHju9vvegy7CNB3S7eZ5ryMobnYJ2+27RiDod\n4cJ4fNVX082Mp0yRdbglHc/XWW9PxfOJmIGz5OdspPxdNsu6EUZBcW70OX4eFQyb\nzgpwaajUHSqaTiuH+M47d+p8tapYO9W1kj9rryMfIdoKp2U3ElJaB9gBLH3ybEmO\ny+cHu8W9Gdd9QjGX4KLHzFwDFw6WHfneqp9RsMW0AQKBgQD1EWudqnjnXlvwpB1h\nQerKAgUx0U81n45JhZGPMWsyayhX2eyqM5Z7ZK33nmhtREZpWxpdclr6mnEai9zU\n7IAuDJEg2zQoi56c4VMdW31A3dkacUx8/PZFowuKN+qHTklw5zZ/4IE5nZ9vNSG+\nhRhdFLxF7v89wQxaxVDjPcHKIQKBgQDbhAgjYDcY7Wih1eQjz6zyhn6Sg0lZbtHu\n0di4ya4iCfMBlI5vXOiqOi9nRfGhrfABm9B/WTQwmdzgl+ZmkBylFxs+z1qQ5Y40\nMTsUiVlZycjtwU0yeHQmN0FfTV/6GpAnAupJC9vSRNtHOMH0SqAkdxvoUObmceOp\n8ni44G//twKBgCBXiTVIjyYxrL6IWhxAv8SjGZ5meiaghP2s8/XK1tPTkoJtjy8z\nGbP1KIRaUnvBG+3BiSw18E3MXgrb1GwBPjVVkT2d0DddnbQkhHyGW3RZEtLLiwWf\nuLyd9OLr2Da9HTIaQXYE4ekBpU3e3DIxjHKUTviHvwWeWYwNKEylFNMhAoGBAJ3O\n2zLjVni7I79ETxBXmhN4EMIvU6nRe2ZewZiGlIKv+FyoeYUhm7nUvoNVyxHaQ3JE\nm60Rae2OjzV+vgn5jD460EFlO8xy2ro2sixfWTatU59omaCw638Vtg9XRqo8Mml5\nNQhyWANfsOwQp46Bn4LXhd6LWpNMSMjCIXt3Dc0dAoGAXOtm8okRkBrflsAzEKRF\nJUgNvUC0IdfRAmhQjSSqDp9WV1uK+XHrcDRLNVU8icaO7cVTmqd5h5H4gPPrvCKC\nr1Rc8pTFM9MmMmWCdbJcKgzukM8CVKOG4WIHmRpIVUhoQcisMTTALbc8JZu0DRbL\nRV7pEWiiadhdKliZY4EAqiI=\n-----END PRIVATE KEY-----\n",
        "client_email": "firebase-adminsdk-fbsvc@push-atrios-work.iam.gserviceaccount.com",
        "client_id": "112559163626223166464",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40push-atrios-work.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com"
      };
    }

    if (serviceAccount) {
      firebaseAdminApp = (admin as any).initializeApp({
        credential: (admin as any).credential.cert(serviceAccount)
      });
      console.log("Firebase Admin SDK inicializado com sucesso.");
      return admin;
    }
  } catch (err) {
    console.error("Falha ao inicializar o Firebase Admin SDK:", err);
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Rotas da API FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", firebaseInitialized: !!getFirebaseAdmin() });
  });

  // Registrar Token FCM de um utilizador
  app.post("/api/register-fcm-token", (req, res) => {
    const { userId, token, role } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ error: "userId e token são obrigatórios." });
    }

    const tokens = getTokens();
    if (!tokens[userId]) {
      tokens[userId] = [];
    }

    // Evitar duplicados
    const exists = tokens[userId].find(t => t.token === token);
    if (!exists) {
      tokens[userId].push({
        token,
        role: role || "user",
        updatedAt: new Date().toISOString()
      });
      saveTokens(tokens);
    } else {
      // Atualizar dados de papel e data se já existir
      exists.role = role || exists.role;
      exists.updatedAt = new Date().toISOString();
      saveTokens(tokens);
    }

    res.json({ success: true, message: "Token FCM registrado com sucesso!" });
  });

  // Enviar push via FCM (segundo plano)
  app.post("/api/send-fcm-push", async (req, res) => {
    const { title, body, targetUserId, targetRole, url } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: "Título e corpo são obrigatórios." });
    }

    const firebaseInstance = getFirebaseAdmin();
    if (!firebaseInstance) {
      return res.status(500).json({ error: "Firebase Admin SDK não pôde ser inicializado." });
    }

    const tokensDb = getTokens();
    const targetTokens: string[] = [];

    // Filtrar tokens elegíveis com base no público-alvo
    Object.entries(tokensDb).forEach(([userId, userTokens]) => {
      userTokens.forEach(ut => {
        const isTargetUser = targetUserId === "all" || targetUserId === userId;
        const isTargetRole = targetRole === "all" || targetRole === ut.role;

        if (isTargetUser && isTargetRole) {
          targetTokens.push(ut.token);
        }
      });
    });

    if (targetTokens.length === 0) {
      return res.json({ success: true, sentCount: 0, message: "Nenhum dispositivo registrado para os critérios de envio." });
    }

    // Remover duplicados
    const uniqueTokens = Array.from(new Set(targetTokens));

    console.log(`Enviando FCM push para ${uniqueTokens.length} dispositivos...`);

    const messages = uniqueTokens.map(token => ({
      token,
      notification: {
        title: title,
        body: body
      },
      data: {
        title: title,
        body: body,
        url: url || "/"
      },
      webpush: {
        headers: {
          Urgency: "high"
        },
        notification: {
          body: body,
          icon: "/logo_atualizado.jpg",
          badge: "/logo_atualizado.jpg",
          clickAction: url || "/"
        }
      }
    }));

    let successCount = 0;
    let failCount = 0;

    try {
      const response = await firebaseInstance.messaging().sendEach(messages);
      successCount = response.successCount;
      failCount = response.failureCount;
      
      // Limpar tokens expirados/inválidos
      if (response.responses) {
        const tokensToRemove: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errCode = resp.error.code;
            if (
              errCode === "messaging/registration-token-not-registered" ||
              errCode === "messaging/invalid-registration-token"
            ) {
              tokensToRemove.push(uniqueTokens[idx]);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          console.log(`Limpando ${tokensToRemove.length} tokens inválidos...`);
          Object.keys(tokensDb).forEach(userId => {
            tokensDb[userId] = tokensDb[userId].filter(ut => !tokensToRemove.includes(ut.token));
          });
          saveTokens(tokensDb);
        }
      }
    } catch (err) {
      console.error("Erro ao enviar mensagens via FCM:", err);
      return res.status(500).json({ error: "Erro interno ao enviar notificações via FCM." });
    }

    res.json({
      success: true,
      sentCount: uniqueTokens.length,
      successCount,
      failCount,
      message: `Disparo concluído: ${successCount} enviados com sucesso, ${failCount} falhas.`
    });
  });

  // Configuração do Vite Middleware para desenvolvimento, ou servir arquivos estáticos em produção
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
