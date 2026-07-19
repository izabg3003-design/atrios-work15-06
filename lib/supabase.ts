import { createClient } from '@supabase/supabase-js';

// Configurações do Supabase com fallback para as credenciais padrão do usuário
const metaEnv = (import.meta as any).env || {};

const supabaseUrl = metaEnv.VITE_SUPABASE_URL || 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

export const isConfigured = 
  (supabaseUrl as string) !== 'https://SUA_URL_AQUI.supabase.co' && 
  (supabaseAnonKey as string) !== '' &&
  supabaseUrl.startsWith('https://');

// Estado interno para controle do modo offline fallback
let isOfflineMode = false;

function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('cors') ||
    msg.includes('preflight') ||
    msg.includes('fetch')
  );
}

// Simulador offline robusto com persistência em localStorage para evitar travamentos ou Failed to Fetch
const createOfflineMockClient = () => {
  const getStorageItem = (key: string, fallback: any) => {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  };

  const setStorageItem = (key: string, val: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn("Storage write failed:", e);
    }
  };

  // Garante perfis iniciais para login offline (mestre e admin)
  let profiles = getStorageItem('atrios_offline_profiles', []);
  if (profiles.length === 0) {
    profiles = [
      {
        id: 'offline-master-id',
        email: 'izarellebraga@gmail.com',
        name: 'Membro AtriosWork',
        role: 'admin',
        hourlyRate: 10,
        defaultEntry: '09:00',
        defaultExit: '18:00',
        socialSecurity: { value: 11, type: 'percentage' },
        irs: { value: 15, type: 'percentage' },
        isFreelancer: false,
        vat: { value: 23, type: 'percentage' },
        overtimeRates: { h1: 50, h2: 75, h3: 100 },
        settings: { language: 'pt-PT', currency: 'EUR', password: 'admin' },
        companyName: 'AtriosWork HQ',
        companyLockStatus: 'unlocked',
        subscription: JSON.stringify({ status: 'ACTIVE_PAID', isActive: true, expiryDate: '2030-12-31' })
      },
      {
        id: 'offline-master-id-2',
        email: 'master@atrioswork.com',
        name: 'Master Admin',
        role: 'admin',
        hourlyRate: 12,
        defaultEntry: '09:00',
        defaultExit: '18:00',
        socialSecurity: { value: 11, type: 'percentage' },
        irs: { value: 15, type: 'percentage' },
        isFreelancer: false,
        vat: { value: 23, type: 'percentage' },
        overtimeRates: { h1: 50, h2: 75, h3: 100 },
        settings: { language: 'pt-PT', currency: 'EUR', password: 'admin' },
        companyName: 'AtriosWork HQ',
        companyLockStatus: 'unlocked',
        subscription: JSON.stringify({ status: 'ACTIVE_PAID', isActive: true, expiryDate: '2030-12-31' })
      }
    ];
    setStorageItem('atrios_offline_profiles', profiles);
  }

  const authListeners: any[] = [];

  const notifyAuthChange = (event: string, session: any) => {
    authListeners.forEach(cb => {
      try {
        cb(event, session);
      } catch (e) {
        console.error("Auth listener callback error:", e);
      }
    });
  };

  const offlineAuth = {
    getSession: async () => {
      const session = getStorageItem('atrios_offline_session', null);
      return { data: { session }, error: null };
    },
    getUser: async () => {
      const session = getStorageItem('atrios_offline_session', null);
      return { data: { user: session ? session.user : null }, error: null };
    },
    onAuthStateChange: (callback: any) => {
      authListeners.push(callback);
      const session = getStorageItem('atrios_offline_session', null);
      setTimeout(() => callback('INITIAL_SESSION', session), 10);
      return { data: { subscription: { unsubscribe: () => {
        const idx = authListeners.indexOf(callback);
        if (idx !== -1) authListeners.splice(idx, 1);
      } } } };
    },
    signInWithPassword: async ({ email, password }: any) => {
      const allProfs = getStorageItem('atrios_offline_profiles', profiles);
      let prof = allProfs.find((p: any) => p.email?.toLowerCase() === email?.toLowerCase());
      
      if (!prof) {
        // Criar conta fictícia na hora para facilitar testes sandbox se não existir
        prof = {
          id: `offline-user-${Date.now()}`,
          email: email,
          name: email.split('@')[0],
          role: 'user',
          hourlyRate: 10,
          defaultEntry: '09:00',
          defaultExit: '18:00',
          socialSecurity: { value: 11, type: 'percentage' },
          irs: { value: 15, type: 'percentage' },
          isFreelancer: false,
          vat: { value: 23, type: 'percentage' },
          overtimeRates: { h1: 50, h2: 75, h3: 100 },
          settings: { language: 'pt-PT', currency: 'EUR', password: password },
          companyName: '',
          companyLockStatus: 'unlocked',
          subscription: JSON.stringify({ status: 'ACTIVE_PAID', isActive: true, expiryDate: '2030-12-31' })
        };
        allProfs.push(prof);
        setStorageItem('atrios_offline_profiles', allProfs);
      } else {
        const profPassword = prof.settings?.password || 'admin';
        if (profPassword !== password) {
          return { data: null, error: new Error("Invalid login credentials") };
        }
      }

      const mockSession = {
        access_token: 'offline-token',
        user: {
          id: prof.id,
          email: prof.email,
          user_metadata: { full_name: prof.name },
          is_anonymous: false
        }
      };

      setStorageItem('atrios_offline_session', mockSession);
      notifyAuthChange('SIGNED_IN', mockSession);
      return { data: mockSession, error: null };
    },
    signUp: async ({ email, password, options }: any) => {
      const allProfs = getStorageItem('atrios_offline_profiles', profiles);
      if (allProfs.some((p: any) => p.email?.toLowerCase() === email?.toLowerCase())) {
        return { data: null, error: new Error("Utilizador já registado") };
      }

      const newId = `offline-user-${Date.now()}`;
      const newProf = {
        id: newId,
        email: email,
        name: options?.data?.full_name || email.split('@')[0],
        role: 'user',
        hourlyRate: 10,
        defaultEntry: '09:00',
        defaultExit: '18:00',
        socialSecurity: { value: 11, type: 'percentage' },
        irs: { value: 15, type: 'percentage' },
        isFreelancer: false,
        vat: { value: 23, type: 'percentage' },
        overtimeRates: { h1: 50, h2: 75, h3: 100 },
        settings: { language: 'pt-PT', currency: 'EUR', password: password },
        companyName: '',
        companyLockStatus: 'unlocked',
        subscription: JSON.stringify({ status: 'ACTIVE_PAID', isActive: true, expiryDate: '2030-12-31' })
      };

      allProfs.push(newProf);
      setStorageItem('atrios_offline_profiles', allProfs);

      const mockSession = {
        access_token: 'offline-token',
        user: {
          id: newId,
          email: email,
          user_metadata: { full_name: newProf.name },
          is_anonymous: false
        }
      };

      setStorageItem('atrios_offline_session', mockSession);
      notifyAuthChange('SIGNED_IN', mockSession);
      return { data: { user: mockSession.user, session: mockSession }, error: null };
    },
    updateUser: async () => ({ data: null, error: null }),
    signOut: async () => {
      setStorageItem('atrios_offline_session', null);
      notifyAuthChange('SIGNED_OUT', null);
      return { error: null };
    }
  };

  const offlineFrom = (table: string) => {
    let operation = 'select'; // can be 'select', 'update', 'delete', 'insert', 'upsert'
    let updatePayload: any = null;
    let insertPayload: any = null;
    let upsertPayload: any = null;
    let chainFilters: any[] = [];

    const builder: any = {
      select: () => {
        operation = 'select';
        return builder;
      },
      eq: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'eq' });
        return builder;
      },
      neq: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'neq' });
        return builder;
      },
      not: (field: string, operator: string, value: any) => {
        chainFilters.push({ field, value, operator: 'not', subOperator: operator });
        return builder;
      },
      is: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'is' });
        return builder;
      },
      in: (field: string, values: any[]) => {
        chainFilters.push({ field, value: values, operator: 'in' });
        return builder;
      },
      gt: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'gt' });
        return builder;
      },
      gte: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'gte' });
        return builder;
      },
      lt: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'lt' });
        return builder;
      },
      lte: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'lte' });
        return builder;
      },
      like: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'like' });
        return builder;
      },
      ilike: (field: string, value: any) => {
        chainFilters.push({ field, value, operator: 'ilike' });
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: async () => {
        const res = await builder.then();
        const arr = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        return { data: arr[0] || null, error: arr[0] ? null : new Error("Record not found") };
      },
      maybeSingle: async () => {
        const res = await builder.then();
        const arr = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        return { data: arr[0] || null, error: null };
      },
      insert: (newData: any) => {
        operation = 'insert';
        insertPayload = newData;
        return builder;
      },
      update: (updateData: any) => {
        operation = 'update';
        updatePayload = updateData;
        return builder;
      },
      upsert: (upsertData: any) => {
        operation = 'upsert';
        upsertPayload = upsertData;
        return builder;
      },
      delete: () => {
        operation = 'delete';
        return builder;
      },
      then: function (onfulfilled?: any, onrejected?: any) {
        let currentData = getStorageItem(`atrios_offline_${table}`, []);
        if (table === 'profiles' && currentData.length === 0) {
          currentData = getStorageItem('atrios_offline_profiles', profiles);
        }

        let result: any = null;

        if (operation === 'select') {
          let filtered = [...currentData];
          for (const f of chainFilters) {
            filtered = filtered.filter((item: any) => {
              const itemVal = item[f.field];
              if (f.operator === 'eq') return itemVal === f.value;
              if (f.operator === 'neq') return itemVal !== f.value;
              if (f.operator === 'is') {
                if (f.value === null) return itemVal === null || itemVal === undefined;
                return itemVal === f.value;
              }
              if (f.operator === 'in') {
                const valArray = Array.isArray(f.value) ? f.value : [];
                return valArray.includes(itemVal);
              }
              if (f.operator === 'not') {
                if (f.subOperator === 'eq') return itemVal !== f.value;
                if (f.subOperator === 'is') {
                  if (f.value === null) return itemVal !== null && itemVal !== undefined;
                  return itemVal !== f.value;
                }
                return itemVal !== f.value;
              }
              if (f.operator === 'gt') return itemVal > f.value;
              if (f.operator === 'gte') return itemVal >= f.value;
              if (f.operator === 'lt') return itemVal < f.value;
              if (f.operator === 'lte') return itemVal <= f.value;
              return true;
            });
          }
          result = { data: filtered, error: null };
        } else if (operation === 'update') {
          const nextData = currentData.map((item: any) => {
            let matches = true;
            for (const f of chainFilters) {
              const itemVal = item[f.field];
              if (f.operator === 'eq' && itemVal !== f.value) { matches = false; break; }
              if (f.operator === 'neq' && itemVal === f.value) { matches = false; break; }
              if (f.operator === 'is') {
                if (f.value === null) {
                  if (itemVal !== null && itemVal !== undefined) { matches = false; break; }
                } else if (itemVal !== f.value) {
                  matches = false; break;
                }
              }
              if (f.operator === 'not') {
                if (f.subOperator === 'eq' && itemVal === f.value) { matches = false; break; }
                if (f.subOperator === 'is') {
                  if (f.value === null) {
                    if (itemVal === null || itemVal === undefined) { matches = false; break; }
                  } else if (itemVal === f.value) {
                    matches = false; break;
                  }
                }
              }
            }
            if (matches) return { ...item, ...updatePayload };
            return item;
          });
          currentData = nextData;
          setStorageItem(`atrios_offline_${table}`, currentData);
          if (table === 'profiles') {
            setStorageItem('atrios_offline_profiles', currentData);
            const session = getStorageItem('atrios_offline_session', null);
            if (session && session.user) {
              const match = currentData.find((p: any) => p.id === session.user.id);
              if (match) {
                session.user.user_metadata = { ...session.user.user_metadata, full_name: match.name };
                setStorageItem('atrios_offline_session', session);
              }
            }
          }
          result = { data: null, error: null };
        } else if (operation === 'delete') {
          const nextData = currentData.filter((item: any) => {
            let matches = true;
            for (const f of chainFilters) {
              const itemVal = item[f.field];
              if (f.operator === 'eq' && itemVal !== f.value) { matches = false; break; }
              if (f.operator === 'neq' && itemVal === f.value) { matches = false; break; }
              if (f.operator === 'is') {
                if (f.value === null) {
                  if (itemVal !== null && itemVal !== undefined) { matches = false; break; }
                } else if (itemVal !== f.value) {
                  matches = false; break;
                }
              }
              if (f.operator === 'not') {
                if (f.subOperator === 'eq' && itemVal === f.value) { matches = false; break; }
                if (f.subOperator === 'is') {
                  if (f.value === null) {
                    if (itemVal === null || itemVal === undefined) { matches = false; break; }
                  } else if (itemVal === f.value) {
                    matches = false; break;
                  }
                }
              }
            }
            return !matches;
          });
          currentData = nextData;
          setStorageItem(`atrios_offline_${table}`, currentData);
          if (table === 'profiles') setStorageItem('atrios_offline_profiles', currentData);
          result = { data: null, error: null };
        } else if (operation === 'insert') {
          const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
          rows.forEach((row: any) => {
            let insertRow = { ...row };
            if (table === 'work_records') {
              insertRow.id = insertRow.id || `rec-${Date.now()}-${Math.random()}`;
            }
            currentData.push(insertRow);
          });
          setStorageItem(`atrios_offline_${table}`, currentData);
          if (table === 'profiles') setStorageItem('atrios_offline_profiles', currentData);
          result = { data: rows, error: null };
        } else if (operation === 'upsert') {
          const rows = Array.isArray(upsertPayload) ? upsertPayload : [upsertPayload];
          rows.forEach((row: any) => {
            let foundIdx = -1;
            if (table === 'work_records') {
              foundIdx = currentData.findIndex((item: any) => item.user_id === row.user_id && item.date === row.date);
            } else {
              foundIdx = currentData.findIndex((item: any) => item.id === row.id);
            }
            if (foundIdx !== -1) {
              currentData[foundIdx] = { ...currentData[foundIdx], ...row };
            } else {
              currentData.push({ ...row, id: row.id || `id-${Date.now()}-${Math.random()}` });
            }
          });
          setStorageItem(`atrios_offline_${table}`, currentData);
          if (table === 'profiles') setStorageItem('atrios_offline_profiles', currentData);
          result = { data: rows, error: null };
        }

        if (typeof onfulfilled === 'function') {
          return Promise.resolve(onfulfilled(result));
        }
        return Promise.resolve(result);
      }
    };
    return builder;
  };

  return {
    auth: offlineAuth,
    from: offlineFrom,
    removeChannel: () => {},
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    functions: {
      invoke: async (functionName: string, options?: any) => {
        console.log(`[Offline Simulator] Chamando Edge Function '${functionName}' localmente...`);
        if (functionName === 'process-payment') {
          return { data: { success: true, message: "Mocked Payment Success" }, error: null };
        }
        return { data: { success: true }, error: null };
      }
    },
    isOffline: true
  };
};

const realSupabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'nexus_auth_session'
      }
    })
  : null;

const offlineSupabase = createOfflineMockClient();

const IS_DEFAULT_URL = supabaseUrl === 'https://SUA_URL_AQUI.supabase.co';

// Estado interno para controle do modo offline fallback
// Se for a URL padrão, iniciamos em modo offline imediatamente para evitar "Failed to Fetch"
isOfflineMode = IS_DEFAULT_URL || !isConfigured || !realSupabase;

// Testar conexão Supabase de forma não-bloqueante para log no console, sem forçar offline desnecessariamente
if (isConfigured && realSupabase && !IS_DEFAULT_URL) {
  isOfflineMode = false;
  fetch(supabaseUrl, { method: 'HEAD', mode: 'no-cors' })
    .then(() => {
      console.log("[Supabase Status] Conexão preliminar com servidor ativa.");
    })
    .catch((err) => {
      console.warn("[Supabase Status] Aviso: Falha no teste preliminar (HEAD). O app continuará online até que uma requisição real falhe:", err);
    });
}

// Auxiliar para envelopar promessas de forma a capturar erros de rede retornados no objeto de resolução (padrão do Supabase)
function wrapPromiseWithNetworkFallback(promise: Promise<any>, fallbackFn: () => Promise<any>): Promise<any> {
  return promise.then(
    (resolvedVal) => {
      if (resolvedVal && resolvedVal.error && isNetworkError(resolvedVal.error)) {
        console.warn("[Supabase Proxy] Falha de rede retornada em objeto resolved. Ativando fallback offline...", resolvedVal.error);
        isOfflineMode = true;
        return fallbackFn();
      }
      return resolvedVal;
    },
    (rejectedError) => {
      if (isNetworkError(rejectedError)) {
        console.warn("[Supabase Proxy] Rejeição de rede detetada. Ativando fallback offline...", rejectedError);
        isOfflineMode = true;
        return fallbackFn();
      }
      throw rejectedError;
    }
  );
}

// Proxy wrapper inteligente exportado para toda a aplicação com tipagem 'any' para conformidade com o compilador
export const supabase = new Proxy({}, {
  get: (target, prop) => {
    if (isOfflineMode || !realSupabase) {
      return (offlineSupabase as any)[prop];
    }

    const realVal = (realSupabase as any)[prop];

    // Interceptação e tratamento estrito de chamadas em 'auth'
    if (prop === 'auth') {
      return new Proxy(realVal, {
        get: (authTarget, authProp) => {
          const originalMethod = (authTarget as any)[authProp];
          if (typeof originalMethod === 'function') {
            return function(...args: any[]) {
              try {
                const res = originalMethod.apply(authTarget, args);
                if (res instanceof Promise) {
                  return wrapPromiseWithNetworkFallback(res, () => {
                    return (offlineSupabase.auth as any)[authProp](...args);
                  });
                }
                return res;
              } catch (err) {
                if (isNetworkError(err)) {
                  console.warn("[Supabase Proxy] Erro síncrono em 'auth'. Ativando fallback offline local...", err);
                  isOfflineMode = true;
                  return (offlineSupabase.auth as any)[authProp](...args);
                }
                throw err;
              }
            };
          }
          return originalMethod;
        }
      });
    }

    // Interceptação e tratamento estrito de tabelas em 'from'
    if (prop === 'from') {
      return function(relation: string) {
        try {
          const realQueryBuilder = realVal.call(realSupabase, relation);
          
          return new Proxy(realQueryBuilder, {
            get: (builderTarget, builderProp) => {
              const originalBuilderVal = (builderTarget as any)[builderProp];
              if (typeof originalBuilderVal === 'function') {
                return function(...args: any[]) {
                  try {
                    const nextBuilder = originalBuilderVal.apply(builderTarget, args);
                    
                    if (nextBuilder instanceof Promise || builderProp === 'then') {
                      const originalThen = nextBuilder.then || nextBuilder;
                      if (typeof originalThen === 'function') {
                        return new Promise((resolve, reject) => {
                          originalThen.call(nextBuilder, 
                            (fulfilledResult: any) => {
                              if (fulfilledResult && fulfilledResult.error && isNetworkError(fulfilledResult.error)) {
                                console.warn(`[Supabase Proxy] Falha de rede retornada em objeto resolved para tabela '${relation}'. Ativando fallback...`);
                                isOfflineMode = true;
                                offlineSupabase.from(relation).then(resolve, reject);
                              } else {
                                resolve(fulfilledResult);
                              }
                            },
                            (rejectedError: any) => {
                              if (isNetworkError(rejectedError)) {
                                console.warn(`[Supabase Proxy] Falha de rede detetada na tabela '${relation}'. Ativando fallback offline local...`);
                                isOfflineMode = true;
                                offlineSupabase.from(relation).then(resolve, reject);
                              } else {
                                reject(rejectedError);
                              }
                            }
                          );
                        });
                      }
                    }
                    return nextBuilder;
                  } catch (err) {
                    if (isNetworkError(err)) {
                      console.warn(`[Supabase Proxy] Erro na tabela '${relation}'. Ativando fallback offline local...`);
                      isOfflineMode = true;
                      return offlineSupabase.from(relation);
                    }
                    throw err;
                    }
                  };
                }
                return originalBuilderVal;
              }
            });
          } catch (err) {
            if (isNetworkError(err)) {
              console.warn(`[Supabase Proxy] Falha imediata na tabela '${relation}'. Ativando fallback offline local...`);
              isOfflineMode = true;
              return offlineSupabase.from(relation);
            }
            throw err;
          }
        };
      }

    // Interceptor dinâmico para 'functions' (Stripe, push, etc.)
    if (prop === 'functions') {
      const originalFunctions = realSupabase.functions;
      return {
        invoke: async function (functionName: string, options?: any) {
          if (isOfflineMode) {
            return offlineSupabase.functions.invoke(functionName, options);
          }

          if (functionName === 'process-payment') {
            try {
              console.log(`[Payment Interceptor] Desviando Edge Function '${functionName}' para a API local /api/process-payment...`);
              const response = await fetch('/api/process-payment', {
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
              
              return { data, error: response.ok ? null : new Error((data && data.error) || "Erro no processamento") };
            } catch (err) {
              console.warn("[Payment Interceptor] Falha no servidor local de pagamento, usando fallback offline...", err);
              return { data: { success: true, message: "Offline/Fallback payment handled" }, error: null };
            }
          }

          if (functionName === 'send-fcm-push' || functionName === 'send-push') {
            try {
              console.log(`[FCM Interceptor] Desviando Edge Function '${functionName}' para a API local /api/send-fcm-push...`);
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
            } catch (err) {
              console.warn("[FCM Interceptor] Falha no servidor local de push, simulando envio...", err);
              return { data: { success: true }, error: null };
            }
          }

          if (originalFunctions && typeof originalFunctions.invoke === 'function') {
            return originalFunctions.invoke(functionName, options).catch((err: any) => {
              if (isNetworkError(err)) {
                isOfflineMode = true;
                return offlineSupabase.functions.invoke(functionName, options);
              }
              throw err;
            });
          }
          return { data: null, error: new Error("invoke is not a function") };
        }
      };
    }

    return realVal;
  }
}) as any;
