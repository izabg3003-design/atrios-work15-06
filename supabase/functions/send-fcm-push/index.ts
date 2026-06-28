import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// Funções Auxiliares para codificação Base64Url e Assinatura RS256 de forma nativa e sem dependências
function b64Url(input: string | ArrayBuffer): string {
  let binary = "";
  if (typeof input === "string") {
    binary = btoa(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } else {
    const bytes = new Uint8Array(input);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    binary = btoa(binary);
  }
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binaryString = atob(b64.replace(/\s/g, ""));
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function cleanPEM(pem: string): string {
  return pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
}

// Gera o token de acesso OAuth2 para a API do Firebase Messaging usando a chave privada da Service Account
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const cleanKey = cleanPEM(privateKeyPem);
  const binaryKey = base64ToArrayBuffer(cleanKey);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = b64Url(JSON.stringify(header));
  const encodedClaims = b64Url(JSON.stringify(claims));
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, dataToSign);
  const encodedSignature = b64Url(signature);

  const jwt = `${encodedHeader}.${encodedClaims}.${encodedSignature}`;

  // Requisita o token de acesso real
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Erro ao obter token OAuth2 do Google: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

serve(async (req) => {
  // Lidar com CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const requestData = await req.json()
    const { title, body, audience, serviceAccount } = requestData

    if (!title || !body) {
      throw new Error("Título e corpo da mensagem são obrigatórios.");
    }

    console.log(`[FCM-PUSH] Iniciando envio: "${title}" - Audiência: ${audience || 'all'}`);

    // Obter credenciais Supabase para buscar destinatários
    const supabaseUrl = (globalThis as any).Deno.env.get('SUPABASE_URL')?.trim();
    const supabaseKey = (globalThis as any).Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Credenciais do Supabase ausentes no servidor.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Resolver credenciais do Firebase (Service Account) das variáveis de ambiente ou corpo do request
    let projectId = '';
    let clientEmail = '';
    let privateKey = '';

    if (serviceAccount) {
      try {
        const sa = typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount;
        projectId = sa.project_id || '';
        clientEmail = sa.client_email || '';
        privateKey = sa.private_key || '';
      } catch (e) {
        console.error('Erro ao ler serviceAccount enviado no request:', e);
      }
    }

    if (!projectId) {
      const serviceAccountEnv = (globalThis as any).Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (serviceAccountEnv) {
        try {
          const sa = JSON.parse(serviceAccountEnv);
          projectId = sa.project_id || '';
          clientEmail = sa.client_email || '';
          privateKey = sa.private_key || '';
        } catch (e) {
          console.error('Erro ao ler FIREBASE_SERVICE_ACCOUNT JSON:', e);
        }
      }
    }

    if (!projectId) projectId = (globalThis as any).Deno.env.get('FIREBASE_PROJECT_ID') || '';
    if (!clientEmail) clientEmail = (globalThis as any).Deno.env.get('FIREBASE_CLIENT_EMAIL') || '';
    if (!privateKey) privateKey = (globalThis as any).Deno.env.get('FIREBASE_PRIVATE_KEY') || '';

    // Normalização da chave privada para que quebras de linha sejam interpretadas corretamente
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Credenciais do Firebase (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) não estão configuradas nas variáveis de ambiente da Edge Function.");
    }

    // 1. Obter lista de usuários com token FCM de acordo com a audiência
    const query = supabaseAdmin
      .from('profiles')
      .select('id, fcm_token, name, role, email, subscription')
      .not('fcm_token', 'is', null);

    const { data: profiles, error: dbError } = await query;

    if (dbError) {
      throw new Error(`Erro ao consultar perfis de destino no Supabase: ${dbError.message}`);
    }

    let filteredProfiles = profiles || [];
    if (audience === 'vendors') {
      filteredProfiles = filteredProfiles.filter(p => p.role === 'vendor');
    } else if (audience === 'admin') {
      filteredProfiles = filteredProfiles.filter(p => 
        p.role === 'admin' || 
        p.email?.toLowerCase()?.includes('master@atrioswork.com') || 
        p.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || 
        p.email?.toLowerCase()?.includes('master@digitalnexus.com')
      );
    } else if (audience === 'support') {
      filteredProfiles = filteredProfiles.filter(p => p.role === 'support');
    } else if (audience === 'part_time' || audience === 'user') {
      filteredProfiles = filteredProfiles.filter(p => p.role === 'user');
    } else if (audience === 'premium') {
      filteredProfiles = filteredProfiles.filter(p => {
        const isMasterOrAdmin = p.role === 'admin' || 
          p.email?.toLowerCase()?.includes('master@atrioswork.com') || 
          p.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || 
          p.email?.toLowerCase()?.includes('master@digitalnexus.com');
        if (isMasterOrAdmin) return true;

        const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
        return sub && sub.status === 'ACTIVE_PAID';
      });
    } else if (audience === 'free') {
      filteredProfiles = filteredProfiles.filter(p => {
        const isMasterOrAdmin = p.role === 'admin' || 
          p.email?.toLowerCase()?.includes('master@atrioswork.com') || 
          p.email?.toLowerCase()?.includes('izarellebraga@gmail.com') || 
          p.email?.toLowerCase()?.includes('master@digitalnexus.com');
        if (isMasterOrAdmin) return true; // Master e admin recebem sempre para fins de teste

        const sub = typeof p.subscription === 'string' ? JSON.parse(p.subscription) : p.subscription;
        const isPaid = sub && sub.status === 'ACTIVE_PAID';
        return !isPaid;
      });
    }

    const validTokens = filteredProfiles
      .map(p => p.fcm_token)
      .filter((t): t is string => !!t && t.trim().length > 0);

    if (validTokens.length === 0) {
      console.log("[FCM-PUSH] Nenhum usuário com token FCM registrado para esta audiência.");
      return new Response(
        JSON.stringify({
          success: true,
          sentCount: 0,
          message: "Nenhum dispositivo com FCM ativo para esta audiência."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`[FCM-PUSH] Encontrados ${validTokens.length} dispositivos para envio. Solicitando token de acesso do Google...`);

    // 2. Autenticar com o Google OAuth2 para obter o token Bearer temporário
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    console.log("[FCM-PUSH] Token de acesso obtido com sucesso. Iniciando disparos...");

    // 3. Disparar notificações via FCM HTTP v1 API
    const sendPromises = validTokens.map(async (token) => {
      try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: token,
              notification: {
                title: title,
                body: body,
              },
              android: {
                priority: "high"
              },
              apns: {
                headers: {
                  "apns-priority": "10"
                },
                payload: {
                  aps: {
                    sound: "default"
                  }
                }
              },
              webpush: {
                headers: {
                  "Urgency": "high"
                }
              },
              data: {
                title: title,
                body: body,
                url: "/",
                click_action: "/"
              }
            }
          })
        });

        const result = await response.json();
        if (!response.ok) {
          console.error(`[FCM-PUSH-SEND-ERROR] Falha para o token ${token.substring(0, 15)}... :`, result);
          return { success: false, token };
        }
        return { success: true, token };
      } catch (err) {
        console.error(`[FCM-PUSH-SEND-FATAL] Erro ao enviar para o token ${token.substring(0, 15)}... :`, err);
        return { success: false, token };
      }
    });

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`[FCM-PUSH] Envio concluído. Sucessos: ${successCount}, Falhas: ${failureCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        sentCount: successCount,
        failedCount: failureCount,
        totalTargeted: validTokens.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("[FCM-PUSH-FATAL]:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
