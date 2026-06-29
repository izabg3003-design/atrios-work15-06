import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    str2ab(atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, ""))),
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
    const { title, body, audience } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("fcm_token, role, email")
      .not("fcm_token", "is", null);

    // Filter profiles based on audience (so master/admin receive correct targets)
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

    const tokens = filteredProfiles.map(p => p.fcm_token).filter((t): t is string => !!t && t.trim().length > 0);

    if (!tokens.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No active tokens for this audience" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccountEnv = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountEnv) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A variável de ambiente FIREBASE_SERVICE_ACCOUNT não está configurada nas Secrets do Supabase. Configure-a no dashboard do Supabase ou via CLI (Project Settings -> API -> Edge Function Secrets)."
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(serviceAccountEnv);
    } catch (parseErr) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro de formato JSON em FIREBASE_SERVICE_ACCOUNT: ${parseErr.message}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const accessToken = await getGoogleAccessToken(
      serviceAccount.client_email,
      serviceAccount.private_key
    );

    const projectId = serviceAccount.project_id;

    const results = await Promise.all(
      tokens.map(async (token) => {
        return fetch(
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
      })
    );

    return new Response(
      JSON.stringify({ success: true, sent: results.length }),
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