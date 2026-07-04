import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD9rSDTCmaxNIRRwZexrIyuOWHAgiIbQgo",
  authDomain: "push-atrios-work.firebaseapp.com",
  projectId: "push-atrios-work",
  storageBucket: "push-atrios-work.firebasestorage.app",
  messagingSenderId: "409947740098",
  appId: "1:409947740098:web:ed16cb847b12182eab685b",
  measurementId: "G-P98E1G082C"
};

let app: any = null;
let messaging: any = null;

try {
  app = initializeApp(firebaseConfig);
  if (typeof window !== "undefined") {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.error("Falha ao inicializar o Firebase Web SDK:", error);
}

export { app, messaging };

export async function requestAndRegisterFCM(userId: string, userRole?: string) {
  if (typeof window === "undefined" || !('serviceWorker' in navigator) || !messaging) {
    return null;
  }

  try {
    // 1. Solicitar permissão de notificação se necessário
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Permissão de notificação não concedida.");
      return null;
    }

    // 2. Aguardar o Service Worker estar pronto
    const registration = await navigator.serviceWorker.ready;
    if (!registration) {
      console.warn("Service Worker não está pronto.");
      return null;
    }

    // 3. Obter token FCM utilizando o Service Worker registado
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration
    }).catch(err => {
      console.warn("Falha ao obter token FCM. Pode ser necessário configurar VAPID no painel do Firebase:", err);
      return null;
    });

    if (token) {
      console.log("Token FCM Obtido com Sucesso:", token);

      // 4. Registar o token no servidor Express local
      const res = await fetch("/api/register-fcm-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          token,
          role: userRole || "user"
        })
      });

      if (res.ok) {
        console.log("Token FCM registado no servidor com sucesso.");
      } else {
        console.warn("Falha ao guardar Token FCM no servidor local.");
      }
      return token;
    }
  } catch (error) {
    console.error("Erro no fluxo de registo FCM:", error);
  }
  return null;
}
