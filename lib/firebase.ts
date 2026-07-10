import { initializeApp, getApp, deleteApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { getFirestore } from 'firebase/firestore';
import appletConfig from '../firebase-applet-config.json';

// Configurações do Firebase obtidas do JSON gerado com bypass TS se necessário
const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || appletConfig.apiKey || "AIzaSyD9rSDTCmaxNIRRwZexrIyuOWHAgiIbQgo",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || "push-atrios-work.firebaseapp.com",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || "push-atrios-work",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || "push-atrios-work.firebasestorage.app",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "409947740098",
  appId: metaEnv.VITE_FIREBASE_APP_ID || appletConfig.appId || "1:409947740098:web:ed16cb847b12182eab685b",
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
export let db: any = null;
export let messaging: Messaging | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    const dbId = (appletConfig as any).firestoreDatabaseId || undefined;
    db = getFirestore(app, dbId);
    if (isPushSupported()) {
      messaging = getMessaging(app);
    }
  } catch (error) {
    console.error('Erro ao inicializar Firebase:', error);
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
  firestoreDatabaseId?: string;
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
    db = getFirestore(app, customConfig.firestoreDatabaseId || undefined);
    messaging = getMessaging(app);
    console.log('Firebase re-inicializado com sucesso com configuração customizada:', customConfig.projectId);
    return messaging;
  } catch (error) {
    console.error('Erro ao re-inicializar Firebase com configuração customizada:', error);
    return null;
  }
}

export { getToken, onMessage };

