// Importa o Service Worker principal AtriosWork (/sw-v3.js) para lidar com eventos push VAPID nativos
importScripts('/sw-v3.js');

// Importa os SDKs do Firebase Compat protegidos contra erros de rede/offline
try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
} catch (cdnErr) {
  console.warn('[firebase-messaging-sw.js] Falha ao carregar SDKs do Firebase CDN (offline/segundo plano):', cdnErr);
}

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
      console.log('[FCM Background SW] Evento FCM recebido no Service Worker:', payload);
      // O sw-v3.js já trata de forma unificada o evento 'push' nativo para prevenir notificações duplicadas
    });
  }
} catch (fcmErr) {
  console.warn('[firebase-messaging-sw.js] Aviso ao inicializar FCM compat em segundo plano:', fcmErr);
}

