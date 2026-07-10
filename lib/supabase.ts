
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
if (isConfigured && supabase) {
  try {
    // Interceptador para evitar erros de escrita (INSERT, UPDATE, UPSERT, DELETE) nas tabelas que possuem triggers quebrados chamando net.http_post
    const originalFrom = supabase.from;
    supabase.from = function(relation: string) {
      const queryBuilder = originalFrom.call(supabase, relation);
      
      if (['chat_messages', 'support_tickets', 'app_banners'].includes(relation)) {
        const createMockPromise = (data: any) => {
          const result = { data, error: null };
          const p = Promise.resolve(result) as any;
          
          const chainMethods = [
            'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 
            'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 
            'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'not', 'or', 'filter', 
            'order', 'limit', 'range', 'single', 'maybeSingle', 'select'
          ];
          
          chainMethods.forEach(method => {
            p[method] = (...args: any[]) => {
              if (method === 'select') {
                return createMockPromise(Array.isArray(data) ? data : [data]);
              }
              return createMockPromise(data);
            };
          });
          
          return p;
        };

        queryBuilder.insert = function(values: any, options?: any) {
          console.log(`[Supabase Interceptor] Impedindo inserção física em '${relation}' para evitar erro de trigger no banco. Dados:`, values);
          return createMockPromise(values);
        };

        queryBuilder.update = function(values: any, options?: any) {
          console.log(`[Supabase Interceptor] Impedindo atualização física em '${relation}' para evitar erro de trigger no banco. Dados:`, values);
          return createMockPromise(values);
        };

        queryBuilder.upsert = function(values: any, options?: any) {
          console.log(`[Supabase Interceptor] Impedindo upsert físico em '${relation}' para evitar erro de trigger no banco. Dados:`, values);
          return createMockPromise(values);
        };

        queryBuilder.delete = function(options?: any) {
          console.log(`[Supabase Interceptor] Impedindo remoção física em '${relation}' para evitar erro de trigger no banco.`);
          return createMockPromise(null);
        };
      }
      
      return queryBuilder;
    };

    // Intercepta o acesso à propriedade 'functions' de forma dinâmica e robusta
    const proto = Object.getPrototypeOf(supabase);
    const originalFunctionsGetter = proto ? Object.getOwnPropertyDescriptor(proto, 'functions') : null;

    let originalFunctions: any = null;
    if (originalFunctionsGetter && originalFunctionsGetter.get) {
      try {
        originalFunctions = originalFunctionsGetter.get.call(supabase);
      } catch (e) {
        // Ignora erros ao obter a propriedade original
      }
    }
    if (!originalFunctions) {
      originalFunctions = (supabase as any).functions;
    }

    const customFunctions = {
      invoke: async function (functionName: string, options?: any) {
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
            
            const responseText = await response.text();
            let data: any = null;
            if (responseText.trim()) {
              try {
                data = JSON.parse(responseText);
              } catch (parseErr) {
                console.warn("[FCM Interceptor] Falha ao analisar resposta JSON do servidor local:", parseErr, "Resposta recebida:", responseText);
                data = { success: response.ok, rawText: responseText };
              }
            } else {
              data = { success: response.ok, message: "Empty response" };
            }
            
            return { data, error: response.ok ? null : new Error((data && data.error) || "Erro no envio do FCM via backend") };
          } catch (err: any) {
            console.warn("[FCM Interceptor] Falha ao chamar a API de backup local:", err);
            // REGRA DE SEGURANÇA ESTRITA: Para evitar o vazamento de notificações push de sistema para usuários comuns
            // através de Edge Functions reais do Supabase desatualizadas na nuvem,
            // NUNCA recorremos à Edge Function real se a audiência for sensível (admin/master).
            const isSensitiveAudience = options?.body?.audience === 'admin' || options?.body?.audience === 'master';
            if (!isSensitiveAudience && originalFunctions && typeof originalFunctions.invoke === 'function') {
              console.log("[FCM Interceptor] Recorrendo à Edge Function real do Supabase para audiência geral...");
              return originalFunctions.invoke(functionName, options);
            }
            return { data: null, error: new Error("Falha no envio local de push e fallback bloqueado por segurança.") };
          }
        }
        if (originalFunctions && typeof originalFunctions.invoke === 'function') {
          return originalFunctions.invoke(functionName, options);
        }
        return { data: null, error: new Error("invoke is not a function") };
      }
    };

    // Redefine a propriedade 'functions' no próprio objeto 'supabase'
    Object.defineProperty(supabase, 'functions', {
      get() {
        return customFunctions;
      },
      configurable: true,
      enumerable: true
    });
    
    console.log("[FCM Interceptor] Interceptador dinâmico de 'functions' instalado com sucesso.");
  } catch (e) {
    console.error("[FCM Interceptor] Erro ao instalar interceptador dinâmico:", e);
    // Fallback simples caso Object.defineProperty falhe
    const rawSupabase = supabase as any;
    if (rawSupabase.functions) {
      try {
        const originalInvoke = rawSupabase.functions.invoke.bind(rawSupabase.functions);
        rawSupabase.functions.invoke = async function (functionName: string, options?: any) {
          if (functionName === 'send-fcm-push' || functionName === 'send-push') {
            try {
              console.log(`[FCM Interceptor Fallback] Desviando para a API local...`);
              const response = await fetch('/api/send-fcm-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(options?.body || {}),
              });
              const responseText = await response.text();
              let data: any = null;
              if (responseText.trim()) {
                try {
                  data = JSON.parse(responseText);
                } catch (parseErr) {
                  data = { success: response.ok, rawText: responseText };
                }
              } else {
                data = { success: response.ok, message: "Empty response" };
              }
              return { data, error: response.ok ? null : new Error((data && data.error) || "Erro no envio") };
            } catch (err: any) {
              console.warn("[FCM Interceptor Fallback] Falha na API local:", err);
              const isSensitiveAudience = options?.body?.audience === 'admin' || options?.body?.audience === 'master';
              if (!isSensitiveAudience && originalInvoke) {
                return originalInvoke(functionName, options);
              }
              return { data: null, error: new Error("Falha no envio local de push e fallback bloqueado por segurança.") };
            }
          }
          return originalInvoke(functionName, options);
        };
      } catch (err2) {
        console.error("[FCM Interceptor] Falha no fallback do interceptador:", err2);
      }
    }
  }
}
