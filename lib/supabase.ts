
import { createClient } from '@supabase/supabase-js';

// Configurações do Supabase com fallback para as credenciais padrão do usuário
const metaEnv = (import.meta as any).env || {};

const supabaseUrl = metaEnv.VITE_SUPABASE_URL || 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

export const isConfigured = 
  (supabaseUrl as string) !== 'https://SUA_URL_AQUI.supabase.co' && 
  (supabaseAnonKey as string) !== '' &&
  supabaseUrl.startsWith('https://');

// Configuração otimizada para evitar erro de Refresh Token
export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'nexus_auth_session'
      }
    })
  : (new Proxy({}, {
      get: () => {
        return () => ({
          then: () => ({ catch: () => {} }),
          select: () => ({ eq: () => ({ single: () => ({ data: null }), select: () => ({ eq: () => ({}) }), eq: () => ({}) }) }),
          auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: async () => ({ error: new Error("Supabase não configurado") }),
            signUp: async () => ({ error: new Error("Supabase não configurado") }),
            updateUser: async () => ({ error: null }),
            signOut: async () => {}
          },
          from: () => ({
            select: () => ({ eq: () => ({ single: () => ({ data: null }), select: () => ({ eq: () => ({}) }), eq: () => ({}) }) }),
            upsert: async () => ({ error: null }),
            update: async () => ({ error: null }),
            insert: async () => ({ error: null }),
            delete: async () => ({ eq: () => ({}) })
          })
        });
      }
    }) as any);

// Interceptador inteligente para enviar notificações push via API local (evita erros de CORS nas Deno Edge Functions)
if (isConfigured && supabase && supabase.functions) {
  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);
  supabase.functions.invoke = async function (functionName: string, options?: any) {
    if (functionName === 'send-fcm-push' || functionName === 'send-push') {
      try {
        console.log(`[FCM Interceptor] Desviando chamada da Edge Function '${functionName}' para a API local /api/send-fcm-push...`);
        const response = await fetch('/api/send-fcm-push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(options?.body || {}),
        });
        
        const data = await response.json();
        return { data, error: response.ok ? null : new Error(data.error || "Erro no envio do FCM via backend") };
      } catch (err: any) {
        console.warn("[FCM Interceptor] Falha ao chamar a API de backup local, recorrendo à Edge Function do Supabase:", err);
        return originalInvoke(functionName, options);
      }
    }
    return originalInvoke(functionName, options);
  };
}
