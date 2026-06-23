// Supabase Edge Function: send-push
// Permite disparar notificações push nativas mesmo com a aplicação AtriosWork fechada.
// Usa o protocolo Web Push padrão suportado nativamente em iOS, Android e Desktop.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import webpush from "https://esm.sh/web-push@3.6.0";

// CONFIGURAÇÃO DOS CABEÇALHOS CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chaves VAPID - Devem ser configuradas nas variáveis de ambiente do Supabase (Edge Function Settings)
// Pode gerar novas chaves usando o comando: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "BI5_vP-V3T9M_gM6F_8pS7T_8O0p3Q7_6V5I4_8V3t6Y9Z8_wN5Z7T4_8O0p3Q7_6V5I4_8V3t6Y9Z8_wN5Z7T4_8";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "suporte@atrioswork.pt";

if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${VAPID_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

serve(async (req) => {
  // Lidar com requisições CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Ler dados da requisição (geralmente enviados por um Database Webhook de insert no app_banners)
    const payload = await req.json();
    
    // Obter dados do banner inserido
    const { record, type } = payload;
    const banner = record || payload; // Aceitar payload direto ou estrutura de webhook

    // Se não for um push ou banner activo, ignorar
    const isPush = banner.title?.toUpperCase().includes("[PUSH]") || 
                   banner.user_type === "push_notification";

    if (!isPush) {
      return new Response(JSON.stringify({ status: "ignored", message: "Não é uma notificação do tipo push" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Limpar o título de tags internas
    const cleanTitle = banner.title.replace("[PUSH]", "").replace("[push]", "").trim();
    const cleanBody = `${banner.highlight || ""} ${banner.subtitle || ""}`.trim();

    // Determinar audiência (todos, apenas premium, apenas free)
    let query = supabaseClient.from("user_push_subscriptions").select("*");

    // Opcional: Se quiser filtrar as subscrições por tipo de utilizador no auth.users
    // unindo tabelas se necessário, mas para envio em massa mandamos para todos os registados
    const { data: subscriptions, error: subError } = await query;

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "Nenhum dispositivo subscrito encontrado." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Preparar objeto de notificação
    const notificationPayload = JSON.stringify({
      title: cleanTitle,
      body: cleanBody,
      url: banner.cta_link || "/"
    });

    // Enviar para todas as subscrições em paralelo
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, notificationPayload);
          return { endpoint: sub.endpoint, success: true };
        } catch (err) {
          // Se o endpoint retornou 410 (Gone) ou 404 (Not Found), a subscrição expirou ou é inválida, podemos apagá-la
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseClient
              .from("user_push_subscriptions")
              .delete()
              .eq("id", sub.id);
          }
          return { endpoint: sub.endpoint, success: false, error: err.message };
        }
      })
    );

    return new Response(JSON.stringify({
      status: "success",
      total_attempted: subscriptions.length,
      details: results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
