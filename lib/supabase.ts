
import { createClient } from '@supabase/supabase-js';

// Credenciais reais da AtriosWork fornecidas pelo usuário
const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

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

// Patchear supabase.functions.invoke para evitar que erros de rede ou de funções não implantadas causem crash de "Failed to fetch"
if (isConfigured && supabase && supabase.functions) {
  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);
  supabase.functions.invoke = async function (functionName: string, options?: any) {
    try {
      const result = await originalInvoke(functionName, options);
      return result;
    } catch (err: any) {
      console.warn(`[Supabase Functions] Invoke falhou de forma silenciosa e controlada para '${functionName}':`, err.message || err);
      return { 
        data: null, 
        error: {
          message: err.message || "Falha na comunicação com a função do Supabase",
          context: {
            json: async () => ({ error: err.message || "Failed to fetch" })
          }
        } as any
      };
    }
  };
}
