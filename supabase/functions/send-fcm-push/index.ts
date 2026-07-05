import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 🔵 CORS
function cors() {
  return new Response("ok", { headers: corsHeaders });
}

// 🔵 BASE64 helpers (Firebase JWT)
function base64UrlEncode(str: string) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 🔵 GOOGLE ACCESS TOKEN
async function getGoogleAccessToken(clientEmail: string, privateKey: string) {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));

  const now = Math.floor(Date.now() / 1000);

  const claim = base64UrlEncode(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const toSign = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    str2ab(atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|[\s\n\r\t]|\\n/g, ""))),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(toSign)
  );

  const jwt = `${toSign}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  return data.access_token;
}

// helper
function str2ab(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// 🔵 MAIN FUNCTION
serve(async (req) => {
  if (req.method === "OPTIONS") return cors();

  try {
    const { title, body, audience, targetUserId, targetUserEmail, url } = await req.json();
    const finalUrl = url || '/';

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, fcm_token, role, email")
      .not("fcm_token", "is", null);

    // Filter profiles based on audience (so master/admin receive correct targets)
    const isMasterEmail = (email?: string) => {
      const e = (email || '').toLowerCase();
      return e.includes('master@atrioswork.com') || 
             e.includes('izarellebraga@gmail.com') || 
             e.includes('master@digitalnexus.com');
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

    const hasTargetUser = !!(targetUserId || targetUserEmail);
    const isSys = isSystemNotification(title, body, audience, hasTargetUser);

    let filteredProfiles = profiles || [];

    if (targetUserId) {
      filteredProfiles = filteredProfiles.filter(p => p.id === targetUserId);
    } else if (targetUserEmail) {
      filteredProfiles = filteredProfiles.filter(p => (p.email || "").toLowerCase() === targetUserEmail.toLowerCase());
    } else if (isSys) {
      // Notificações de sistema vão UNICAMENTE para os Master accounts
      filteredProfiles = filteredProfiles.filter(p => isAdminUser(p));
    } else {
      // Fluxo normal para as outras notificações (ex: expiração de licença, informativos gerais, etc.)
      if (audience === 'admin' || audience === 'master') {
        filteredProfiles = filteredProfiles.filter(p => isAdminUser(p));
      } else if (audience === 'vendors') {
        filteredProfiles = filteredProfiles.filter(p => p.role === 'vendor');
      } else if (audience === 'support') {
        filteredProfiles = filteredProfiles.filter(p => p.role === 'support' || isAdminUser(p));
      } else if (audience === 'user') {
        filteredProfiles = filteredProfiles.filter(p => p.role === 'user' && !isMasterEmail(p.email));
      }
    }

    // Retrieve VAPID details dynamically from app_banners table
    let vapidPublicKey = "";
    let vapidPrivateKey = "";
    const vapidSubject = "mailto:master@atrioswork.com";

    try {
      const { data: keysData, error: keysError } = await supabase
        .from("app_banners")
        .select("*")
        .eq("user_type", "system_vapid_keys")
        .maybeSingle();

      if (!keysError && keysData && keysData.highlight && keysData.cta_text) {
        vapidPublicKey = keysData.highlight;
        vapidPrivateKey = keysData.cta_text;
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        console.log("[Edge Function VAPID] Chaves Web Push obtidas do banco de dados com sucesso.");
      }
    } catch (err) {
      console.warn("[Edge Function VAPID] Erro ao obter chaves do banco de dados:", err);
    }

    const rawTokens = filteredProfiles.map(p => p.fcm_token).filter((t): t is string => !!t && t.trim().length > 0);
    const fcmTokens: string[] = [];
    const webPushSubscriptions: any[] = [];

    rawTokens.forEach((t) => {
      const trimmed = t.trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && parsed.endpoint) {
            webPushSubscriptions.push({
              subscription: parsed,
              userId: null,
            });
            if (parsed.fcmToken) {
              fcmTokens.push(parsed.fcmToken);
            }
          } else if (parsed && parsed.fcmToken) {
            fcmTokens.push(parsed.fcmToken);
          } else if (parsed && parsed.token) {
            fcmTokens.push(parsed.token);
          }
        } catch (_e) {
          fcmTokens.push(trimmed);
        }
      } else {
        fcmTokens.push(trimmed);
      }
    });

    if (!fcmTokens.length && !webPushSubscriptions.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No active devices or subscriptions for this audience" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    // 🔵 DISPARO 1: Enviar notificações via Web Push (VAPID)
    const webPushPromises = [];
    if (vapidPublicKey && vapidPrivateKey && webPushSubscriptions.length > 0) {
      webPushPromises.push(...webPushSubscriptions.map(async (ws) => {
        const payload = JSON.stringify({
          notification: {
            title,
            body,
            icon: "https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app/logo_atualizado.jpg?v=20260314_v1",
            badge: "https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app/logo_atualizado.jpg?v=20260314_v1",
            vibrate: [100, 50, 100],
            data: { url: finalUrl },
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
          console.error("[Edge VAPID] Erro ao enviar para assinatura:", err.message || err);
        }
      }));
    } else {
      console.log("[Edge Function] Web Push (VAPID) não disparado devido a chaves ou assinaturas ausentes.");
    }

    // 🔵 DISPARO 2: Enviar notificações via Firebase Cloud Messaging (FCM)
    const fcmPromises = [];
    if (fcmTokens.length > 0) {
      const serviceAccountEnv = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (serviceAccountEnv) {
        try {
          const serviceAccount = JSON.parse(serviceAccountEnv);
          const accessToken = await getGoogleAccessToken(
            serviceAccount.client_email,
            serviceAccount.private_key
          );
          const projectId = serviceAccount.project_id;

          fcmPromises.push(...fcmTokens.map(async (token) => {
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
                          icon: 'https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app/logo_atualizado.jpg?v=20260314_v1',
                          badge: 'https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app/logo_atualizado.jpg?v=20260314_v1',
                        },
                        fcm_options: {
                          link: finalUrl,
                        },
                      },
                      data: {
                        url: finalUrl,
                      },
                    },
                  }),
                }
              );

              if (fcmResponse.ok) {
                totalSent++;
              } else {
                const fcmErrResult = await fcmResponse.json();
                console.error(`[Edge FCM] Erro para o token ${token.substring(0, 15)}...:`, fcmErrResult);
              }
            } catch (err: any) {
              console.error(`[Edge FCM] Falha ao despachar para o token ${token.substring(0, 15)}...:`, err);
            }
          }));
        } catch (authErr: any) {
          console.error("[Edge FCM] Falha na autenticação do Google Access Token:", authErr);
        }
      } else {
        console.warn("[Edge FCM] A variável de ambiente FIREBASE_SERVICE_ACCOUNT não está configurada.");
      }
    }

    await Promise.all([...webPushPromises, ...fcmPromises]);

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, message: `Disparo de push concluído: ${totalSent} destinos atendidos.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || String(e) }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});