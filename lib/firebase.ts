import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import appletConfig from '../firebase-applet-config.json';

// Configurações do Firebase obtidas do JSON gerado com bypass TS se necessário
const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: appletConfig.apiKey || metaEnv.VITE_FIREBASE_API_KEY,
  authDomain: appletConfig.authDomain || metaEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: appletConfig.projectId || metaEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: appletConfig.storageBucket || metaEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: appletConfig.messagingSenderId || metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: appletConfig.appId || metaEnv.VITE_FIREBASE_APP_ID,
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

let app;
let messaging: Messaging | null = null;

if (isFirebaseConfigured && isPushSupported()) {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  } catch (error) {
    console.error('Erro ao inicializar Firebase Cloud Messaging:', error);
  }
}

export { messaging, getToken, onMessage };
