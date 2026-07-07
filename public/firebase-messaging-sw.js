// Importa as bibliotecas necessárias do Firebase compat de forma resiliente
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuração padrão de fallback do Firebase (compatível com o projeto push-atrios-work)
const firebaseConfig = {
  apiKey: "AIzaSyD9rSDTCmaxNIRRwZexrIyuOWHAgiIbQgo",
  authDomain: "push-atrios-work.firebaseapp.com",
  projectId: "push-atrios-work",
  storageBucket: "push-atrios-work.firebasestorage.app",
  messagingSenderId: "409947740098",
  appId: "1:409947740098:web:ed16cb847b12182eab685b"
};

// Inicializar o Firebase no escopo do Service Worker
try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Escutar mensagens em segundo plano (background) do FCM
  messaging.onBackgroundMessage((payload) => {
    console.log('[Firebase SW] Recebida mensagem em segundo plano:', payload);
    
    const title = payload.notification?.title || payload.data?.title || 'AtriosWork';
    const body = payload.notification?.body || payload.data?.body || 'Nova notificação do sistema!';
    const url = payload.data?.url || payload.data?.click_action || '/';
    
    const origin = self.location.origin;
    const iconUrl = new URL('/logo_atualizado.jpg?v=20260314_v1', origin).href;

    const options = {
      body: body,
      icon: iconUrl,
      badge: iconUrl,
      vibrate: [200, 100, 200],
      data: url,
      actions: [
        { action: 'open', title: 'Ver App' }
      ]
    };

    return self.registration.showNotification(title, options);
  });
  console.log('[Firebase SW] Firebase Messaging compat inicializado com sucesso.');
} catch (err) {
  console.error('[Firebase SW] Falha ao inicializar o Firebase Messaging compat:', err);
}

// Importa a lógica do service worker principal AtriosWork (/sw-v3.js) que contém o caching, fetch e o listener genérico de push
importScripts('/sw-v3.js');

