
import { createClient } from '@supabase/supabase-js';
import { AppBanner } from '../types';

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

export const parseDbBanner = (dbBanner: any): AppBanner => {
  if (!dbBanner) return dbBanner;
  let user_type: AppBanner['user_type'] = 'all';
  let cta_link = dbBanner.cta_link || '';

  if (cta_link.includes('||user_type:')) {
    const parts = cta_link.split('||user_type:');
    cta_link = parts[0];
    user_type = parts[1] as any;
  }

  return {
    ...dbBanner,
    cta_link,
    user_type
  };
};

export const prepareBannerForDb = (banner: Partial<AppBanner>): any => {
  if (!banner) return banner;
  const { user_type, cta_link, ...rest } = banner;
  return {
    ...rest,
    cta_link: `${cta_link || ''}||user_type:${user_type || 'all'}`
  };
};

/**
 * Retorna a URL base correta para chamadas ao Express.
 * Se o origin for localhost ou run.app (ambientes de des/pre), usa relativo.
 * Se for o domínio de produção atrioswork.pt ou outro customizado, aponta para o Cloud Run do backend.
 */
export const getApiUrl = (path: string): string => {
  const currentOrigin = window.location.origin;
  const isDevOrPreview = currentOrigin.includes('localhost') || currentOrigin.includes('run.app') || currentOrigin.includes('127.0.0.1');
  
  // Preferir a variável de ambiente VITE_API_URL caso o usuário configure
  const envApiUrl = (import.meta as any).env?.VITE_API_URL;
  if (envApiUrl) {
    const base = envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  if (isDevOrPreview) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${currentOrigin}${cleanPath}`;
  }

  const baseCloudRunUrl = 'https://ais-pre-klns3osu2yeuvbbyqv7tl7-37225789255.europe-west1.run.app';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseCloudRunUrl}${cleanPath}`;
};

