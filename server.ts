import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

// Helper para obter token de acesso do Google OAuth2 de forma nativa e segura
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 🔵 API: Envio de Push FCM (Same-Origin, evita erros de CORS)
  app.post("/api/send-fcm-push", async (req, res) => {
    try {
      const { title, body, audience } = req.body;

      if (!title || !body) {
        return res.status(400).json({
          success: false,
          error: "Campos 'title' e 'body' são obrigatórios.",
        });
      }

      // Supabase credentials
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://zuawenhgajcciefbwear.supabase.co";
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseServiceKey) {
        return res.status(400).json({
          success: false,
          error: "Credenciais do Supabase não configuradas nas variáveis de ambiente.",
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Obter perfis com FCM token ativo
      const { data: profiles, error: dbError } = await supabase
        .from("profiles")
        .select("fcm_token, role, email")
        .not("fcm_token", "is", null);

      if (dbError) {
        console.error("[FCM Server] Erro ao buscar perfis no Supabase:", dbError);
        return res.status(500).json({
          success: false,
          error: `Erro de banco de dados: ${dbError.message}`,
        });
      }

      // Regras de público-alvo (Audience filtering)
      const isMasterEmail = (email?: string) => {
        const e = (email || '').toLowerCase();
        return e.includes('master@atrioswork.com') || 
               e.includes('izarellebraga@gmail.com') || 
               e.includes('master@digitalnexus.com');
      };

      const isAdminUser = (profile: any) => {
        return profile.role === 'admin' || isMasterEmail(profile.email);
      };

      let filteredProfiles = profiles || [];

      if (audience === 'admin' || audience === 'master') {
        filteredProfiles = filteredProfiles.filter(p => isAdminUser(p));
      } else if (audience === 'vendors') {
        filteredProfiles = filteredProfiles.filter(p => p.role === 'vendor');
      } else if (audience === 'support') {
        filteredProfiles = filteredProfiles.filter(p => p.role === 'support' || isAdminUser(p));
      } else if (audience === 'user') {
        filteredProfiles = filteredProfiles.filter(p => p.role === 'user' && !isMasterEmail(p.email));
      }

      const tokens = filteredProfiles
        .map(p => p.fcm_token)
        .filter((t): t is string => !!t && t.trim().length > 0);

      if (tokens.length === 0) {
        return res.json({
          success: true,
          sent: 0,
          message: "Nenhum dispositivo com token push registado para esta audiência.",
        });
      }

      // Configuração da Conta de Serviço do Firebase
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!serviceAccountEnv) {
        return res.status(400).json({
          success: false,
          error: "A variável de ambiente FIREBASE_SERVICE_ACCOUNT não está configurada nas Secrets/Configurações do painel.",
        });
      }

      let serviceAccount: any;
      try {
        serviceAccount = JSON.parse(serviceAccountEnv);
      } catch (parseErr: any) {
        return res.status(400).json({
          success: false,
          error: `Erro de formato JSON em FIREBASE_SERVICE_ACCOUNT: ${parseErr.message}`,
        });
      }

      const accessToken = getGoogleAccessToken(
        serviceAccount.client_email,
        serviceAccount.private_key
      );

      const projectId = serviceAccount.project_id;

      // Disparar notificações FCM via HTTP v1
      const sendPromises = tokens.map(async (token) => {
        try {
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
                        sound: "default",
                      },
                    },
                  },
                  webpush: {
                    notification: {
                      title,
                      body,
                      icon: '/logo_atualizado.jpg?v=20260314_v1',
                      badge: '/logo_atualizado.jpg?v=20260314_v1',
                    },
                    fcm_options: {
                      link: '/',
                    },
                  },
                  data: {
                    url: '/',
                  },
                },
              }),
            }
          );

          if (!fcmResponse.ok) {
            const fcmErrResult = await fcmResponse.json();
            console.error(`[FCM Server] Erro ao enviar para o token ${token.substring(0, 15)}...:`, fcmErrResult);
          }
        } catch (fcmSendErr) {
          console.error(`[FCM Server] Falha de rede para o token ${token.substring(0, 15)}...:`, fcmSendErr);
        }
      });

      await Promise.all(sendPromises);

      return res.json({
        success: true,
        sent: tokens.length,
      });

    } catch (err: any) {
      console.error("[FCM Server] Erro catastrófico:", err);
      return res.status(500).json({
        success: false,
        error: err.message || String(err),
      });
    }
  });

  // Configuração do Vite middleware ou arquivos estáticos
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AtriosWork Backend] Servidor rodando com sucesso em http://0.0.0.0:${PORT}`);
  });
}

startServer();
