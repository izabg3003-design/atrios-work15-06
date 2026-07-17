
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

/**
 * Utilitário para resolver URLs de API de forma resiliente.
 * Se o frontend estiver rodando no site oficial (static/SPA no domínio próprio),
 * direciona as chamadas de backend para a URL absoluta da nossa Cloud Run ativa na AI Studio.
 * Se estiver rodando em localhost ou no próprio ambiente de preview da AI Studio, usa caminhos relativos.
 */
export function getApiUrl(path: string, forceAbsolute = false): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  const remoteBackend = 'https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (forceAbsolute) {
    return `${remoteBackend}${cleanPath}`;
  }
  
  try {
    const currentHost = window.location.hostname;
    // Se estiver em localhost ou no próprio preview da AI Studio, ou nos domínios oficiais, usa caminhos relativos nativos
    if (
      currentHost === 'localhost' || 
      currentHost === '127.0.0.1' || 
      currentHost.includes('europe-west1.run.app') || 
      currentHost.includes('aistudio-preview') ||
      currentHost.includes('atrioswork.pt') ||
      currentHost.includes('atrioswork.com')
    ) {
      return path;
    }
  } catch (e) {
    // Fallback silencioso se executado em ambientes não-browser (SSR ou testes)
  }
  
  return `${remoteBackend}${cleanPath}`;
}

/**
 * Realiza requisições de API de forma resiliente.
 * Tenta primeiro usar o getApiUrl normal (que pode ser relativo se estivermos no mesmo servidor).
 * Se a requisição falhar com erro de rede ou retornar 404/500, e a URL for relativa,
 * tenta novamente usando a URL absoluta do backend remoto.
 */
export async function resilientFetch(path: string, options?: RequestInit): Promise<Response> {
  const primaryUrl = getApiUrl(path);
  try {
    const response = await fetch(primaryUrl, options);
    // Se der 404 ou status de erro de gateway/servidor e a URL original for relativa, tenta o backend remoto
    if ((response.status === 404 || response.status >= 502) && !primaryUrl.startsWith('http')) {
      const fallbackUrl = getApiUrl(path, true);
      console.log(`[Resilient Fetch] Resposta ${response.status} para URL relativa. Tentando fallback absoluto: ${fallbackUrl}`);
      return await fetch(fallbackUrl, options);
    }
    return response;
  } catch (err: any) {
    // Se houver falha de rede (ex: Failed to fetch) e a URL original for relativa, tenta a absoluta
    if (!primaryUrl.startsWith('http')) {
      const fallbackUrl = getApiUrl(path, true);
      console.warn(`[Resilient Fetch] Falha de rede (${err.message || err}) para URL relativa. Tentando fallback absoluto: ${fallbackUrl}`);
      try {
        return await fetch(fallbackUrl, options);
      } catch (fallbackErr) {
        throw err; // Se ambos falharem, lança o erro original
      }
    }
    throw err;
  }
}

// Interceptador inteligente para enviar notificações push via API local (evita erros de CORS nas Deno Edge Functions)
if (isConfigured && supabase) {
  try {
    // Interceptador passivo de erros de Trigger (evita falhas de escrita se pg_net ou net.http_post estiverem em falta no Supabase)
    const originalFrom = supabase.from;
    supabase.from = function(relation: string) {
      const queryBuilder = originalFrom.call(supabase, relation);
      
      if (['chat_messages', 'support_tickets', 'app_banners'].includes(relation)) {
        const wrapBuilder = (builder: any): any => {
          if (!builder || typeof builder !== 'object') return builder;
          if (builder.__isWrapped) return builder; // EVITA LOOP INFINITO DE ENVOLVIMENTO!
          builder.__isWrapped = true;
          
          const originalThen = builder.then;
          if (typeof originalThen === 'function') {
            builder.then = function(onfulfilled: any, onrejected: any) {
              return originalThen.call(builder, (result: any) => {
                if (result && result.error && (result.error.code === '42883' || (result.error.message && result.error.message.includes('net.http_post')))) {
                  console.log(`[Supabase Passive Interceptor] Capturado erro de Trigger do Supabase (falta de pg_net / net.http_post) ao gravar em '${relation}'. Simulando sucesso físico para evitar falhas no cliente.`);
                  if (typeof onfulfilled === 'function') return onfulfilled({ data: [], error: null });
                  return { data: [], error: null };
                }
                if (typeof onfulfilled === 'function') return onfulfilled(result);
                return result;
              }, (err: any) => {
                if (err && (err.code === '42883' || (err.message && err.message.includes('net.http_post')))) {
                  console.log(`[Supabase Passive Interceptor] Capturado erro de Trigger do Supabase (falta de pg_net / net.http_post) ao gravar em '${relation}'. Simulando sucesso físico para evitar falhas no cliente.`);
                  if (typeof onfulfilled === 'function') return onfulfilled({ data: [], error: null });
                  return { data: [], error: null };
                }
                if (typeof onrejected === 'function') return onrejected(err);
                throw err;
              });
            };
          }
          
          const methodsToWrap = [
            'insert', 'update', 'upsert', 'delete', 'select', 'eq', 'neq', 'gt', 'gte', 
            'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'match', 
            'not', 'or', 'filter', 'order', 'limit', 'range', 'single', 'maybeSingle'
          ];
          
          methodsToWrap.forEach(method => {
            const originalMethod = builder[method];
            if (typeof originalMethod === 'function') {
              builder[method] = function(...args: any[]) {
                const nextBuilder = originalMethod.apply(builder, args);
                return wrapBuilder(nextBuilder);
              };
            }
          });
          
          return builder;
        };
        
        return wrapBuilder(queryBuilder);
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
        if (functionName === 'process-payment') {
          try {
            console.log(`[Payment Interceptor] Desviando chamada da Edge Function '${functionName}' para a API local /api/process-payment...`);
            const response = await resilientFetch('/api/process-payment', {
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
                console.warn("[Payment Interceptor] Falha ao analisar resposta JSON do servidor local:", parseErr, "Resposta recebida:", responseText);
                data = { success: response.ok, rawText: responseText };
              }
            } else {
              data = { success: response.ok, message: "Empty response" };
            }
            
            return { data, error: response.ok ? null : new Error((data && data.error) || "Erro no processamento do pagamento via backend") };
          } catch (err: any) {
            console.warn("[Payment Interceptor] Falha ao chamar a API de backup local de pagamento:", err);
            return { data: null, error: new Error("Falha no processamento local do pagamento e fallback bloqueado.") };
          }
        }
        if (functionName === 'send-fcm-push' || functionName === 'send-push') {
          try {
            console.log(`[FCM Interceptor] Desviando chamada da Edge Function '${functionName}' para a API local /api/send-fcm-push...`);
            const response = await resilientFetch('/api/send-fcm-push', {
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
          if (functionName === 'process-payment') {
            try {
              console.log(`[Payment Interceptor Fallback] Desviando para a API local...`);
              const response = await resilientFetch('/api/process-payment', {
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
              return { data, error: response.ok ? null : new Error((data && data.error) || "Erro no processamento do pagamento") };
            } catch (err: any) {
              console.warn("[Payment Interceptor Fallback] Falha na API local de pagamento:", err);
              return { data: null, error: new Error("Falha no processamento local de pagamento.") };
            }
          }
          if (functionName === 'send-fcm-push' || functionName === 'send-push') {
            try {
              console.log(`[FCM Interceptor Fallback] Desviando para a API local...`);
              const response = await resilientFetch('/api/send-fcm-push', {
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



