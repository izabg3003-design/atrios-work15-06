
import { createClient } from '@supabase/supabase-js';

// Credenciais reais da AtriosWork fornecidas pelo usuário
export const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

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

/**
 * Invoca de forma segura a Edge Function 'send-push' usando fetch padrão.
 * Isso contorna problemas de CORS/401 do Supabase JS Client ao injetar
 * corretamente os cabeçalhos de API Key e tratar de forma opcional o JWT.
 */
export async function invokeSendPush(body: any) {
  if (!isConfigured) return { error: new Error("Supabase não configurado") };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    };

    // Sempre garante o cabeçalho Authorization. Se houver sessão ativa do usuário,
    // envia o token JWT do usuário, caso contrário, envia a própria anonKey.
    // Isso evita que o gateway do Supabase (Kong) barrei a chamada como 401 Unauthorized.
    headers['Authorization'] = `Bearer ${session?.access_token || supabaseAnonKey}`;

    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Erro de resposta na Edge Function (${response.status}):`, errorText);
      return { error: new Error(errorText) };
    }

    const data = await response.json().catch(() => ({}));
    return { data, error: null };
  } catch (err: any) {
    console.error('Erro de rede ao chamar a Edge Function send-push:', err);
    return { error: err };
  }
}

