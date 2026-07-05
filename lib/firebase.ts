import { initializeApp, getApp, deleteApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import appletConfig from '../firebase-applet-config.json';

// Configurações do Firebase obtidas do JSON gerado com bypass TS se necessário
const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || "AIzaSyD9rSDTCmaxNIRRwZexrIyuOWHAgiIbQgo" || appletConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "push-atrios-work.firebaseapp.com" || appletConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "push-atrios-work" || appletConfig.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "push-atrios-work.firebasestorage.app" || appletConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "409947740098" || appletConfig.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || "1:409947740098:web:ed16cb847b12182eab685b" || appletConfig.appId,
};

// Verifica se as variáveis mínimas de configuração do Firebase estão presentes
export const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

// Verifica suporte a PWA/Notificações neste navegador
export const isPushSupported = () => {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

export let app: any = null;
export let messaging: Messaging | null = null;

if (isFirebaseConfigured && isPushSupported()) {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  } catch (error) {
    console.error('Erro ao inicializar Firebase Cloud Messaging:', error);
  }
}

// Re-inicialização dinâmica com dados recebidos do Supabase
export function reinitializeFirebase(customConfig: {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}) {
  if (!customConfig || !customConfig.apiKey || !customConfig.projectId) {
    return null;
  }
  try {
    const apps = getApps();
    if (apps.length > 0) {
      for (const existingApp of apps) {
        deleteApp(existingApp).catch(e => console.warn('Erro ao deletar app existente:', e));
      }
    }
    app = initializeApp(customConfig);
    messaging = getMessaging(app);
    console.log('Firebase re-inicializado com sucesso com configuração customizada:', customConfig.projectId);
    return messaging;
  } catch (error) {
    console.error('Erro ao re-inicializar Firebase com configuração customizada:', error);
    return null;
  }
}

export { getToken, onMessage };

