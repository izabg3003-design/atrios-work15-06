// Importa o Service Worker principal AtriosWork (/sw-v3.js) para lidar com eventos push VAPID nativos
importScripts('/sw-v3.js');

// Importa os SDKs do Firebase Compat para suportar background messaging do Firebase Cloud Messaging (FCM)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

try {
  const firebaseConfig = {
    apiKey: "AIzaSyClZrrC0g02fWxqH5n0aaZW_K8oog8_Qnw",
    authDomain: "gen-lang-client-0484473706.firebaseapp.com",
    projectId: "gen-lang-client-0484473706",
    storageBucket: "gen-lang-client-0484473706.firebasestorage.app",
    messagingSenderId: "930305696130",
    appId: "1:930305696130:web:bd82c9a63cf737900f6f9b"
  };

  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  if (typeof firebase !== 'undefined' && firebase.messaging) {
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[FCM Background SW] Notificação recebida com o app fechado:', payload);
      const title = payload.notification?.title || payload.data?.title || 'AtriosWork';
      const body = payload.notification?.body || payload.data?.body || 'Nova notificação do sistema!';
      const targetUrl = payload.data?.url || payload.fcmOptions?.link || payload.fcm_options?.link || '/';
      const origin = self.location.origin;
      const iconUrl = new URL('/logo_atualizado.jpg?v=20260314_v1', origin).href;
      const tag = `atrioswork-fcm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      return self.registration.showNotification(title, {
        body: body,
        icon: iconUrl,
        badge: iconUrl,
        vibrate: [200, 100, 200],
        data: targetUrl,
        tag: tag,
        requireInteraction: true,
        actions: [{ action: 'open', title: 'Ver App' }]
      });
    });
  }
} catch (fcmErr) {
  console.warn('[firebase-messaging-sw.js] Aviso ao inicializar FCM compat em segundo plano:', fcmErr);
}

