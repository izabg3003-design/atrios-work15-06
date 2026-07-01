// ============================================================================
// 🔵 INICIALIZAÇÃO IMEDIATA E SÍNCRONA DO FIREBASE CLOUD MESSAGING SDK
// ============================================================================
try {
  // Importar o SDK Compatível com Service Workers do Firebase v10
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

  const defaultFirebaseConfig = {
    apiKey: "AIzaSyD9rSDTCmaxNIRRwZexrIyuOWHAgiIbQgo",
    authDomain: "push-atrios-work.firebaseapp.com",
    projectId: "push-atrios-work",
    storageBucket: "push-atrios-work.firebasestorage.app",
    messagingSenderId: "409947740098",
    appId: "1:409947740098:web:ed16cb847b12182eab685b"
  };

  if (typeof firebase !== 'undefined') {
    // Inicialização imediata com configuração padrão
    firebase.initializeApp(defaultFirebaseConfig);
    self.messagingInstance = firebase.messaging();

    // Handler síncrono registrado no topo para responder instantaneamente a notificações push em background
    self.handleBackgroundMessage = function(payload) {
      console.log('[SW Background FCM] Notificação recebida em segundo plano (app fechado):', payload);
      
      const title = payload.notification?.title || payload.data?.title || 'AtriosWork';
      const body = payload.notification?.body || payload.data?.body || 'Nova notificação do sistema!';
      const targetUrl = payload.data?.url || payload.notification?.data?.url || '/';
      
      const origin = self.location.origin;
      const iconUrl = new URL('/logo_atualizado.jpg?v=20260314_v1', origin).href;

      const options = {
        body: body,
        icon: iconUrl,
        badge: iconUrl,
        vibrate: [200, 100, 200],
        data: targetUrl,
        actions: [
          { action: 'open', title: 'Ver App' }
        ]
      };

      return self.registration.showNotification(title, options);
    };

    self.messagingInstance.onBackgroundMessage(self.handleBackgroundMessage);
    console.log('[SW Background FCM] Inicialização síncrona inicial com sucesso!');

    // Tentar ler uma configuração customizada do cache dinâmico se houver e re-inicializar
    caches.match('/fcm-config.json')
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse.json().catch(() => null);
        }
        return null;
      })
      .then((customConfig) => {
        if (customConfig && customConfig.apiKey && customConfig.projectId) {
          console.log('[SW Background FCM] Configuração customizada detetada no cache. Re-inicializando...', customConfig.projectId);
          if (firebase.apps.length > 0) {
            Promise.all(firebase.apps.map(app => app.delete()))
              .then(() => {
                firebase.initializeApp(customConfig);
                self.messagingInstance = firebase.messaging();
                self.messagingInstance.onBackgroundMessage(self.handleBackgroundMessage);
                console.log('[SW Background FCM] Re-inicializado com sucesso com configuração customizada do cache!');
              })
              .catch((e) => console.warn('[SW Background FCM] Erro ao re-inicializar com customConfig:', e));
          } else {
            firebase.initializeApp(customConfig);
            self.messagingInstance = firebase.messaging();
            self.messagingInstance.onBackgroundMessage(self.handleBackgroundMessage);
            console.log('[SW Background FCM] Re-inicializado com sucesso com configuração customizada do cache (sem apps anteriores)!');
          }
        }
      })
      .catch((err) => {
        console.warn('[SW Background FCM] Erro ao tentar ler configuração customizada do cache:', err);
      });
  }
} catch (fcmErr) {
  console.warn('[SW Background FCM] Erro de carregamento do Firebase SDK (VAPID nativo ativo):', fcmErr);
}

const CACHE_NAME = 'atrioswork-v6.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo_atualizado.jpg?v=20260314_v1'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use a resilient, asset-by-asset logic so that a single 404 or transient failure
      // doesn't block or crash the Service Worker installation
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => 
          cache.add(url).catch(err => console.warn(`Falha ao colocar no cache durante instalação: ${url}`, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== 'fcm-config') {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // ONLY intercept GET requests from the same origin on http/https protocols
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http') || url.origin !== self.location.origin) {
    return;
  }

  // Check if we are navigating to an HTML page
  const isNavigate = event.request.mode === 'navigate' || 
                    (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'));

  if (isNavigate) {
    // Network First: Always try to get the fresh HTML from the web so new deployments load immediately.
    // Fall back to Cache only when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request) || caches.match('/index.html') || caches.match('/');
        })
    );
  } else {
    // Cache First for other static assets/resources.
    // Return cached response if found, otherwise let fetch fail naturally without swallowing rejection
    // which avoids TypeError: "The value provided is not a Response" (Failed to fetch).
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

// Suporte para Receber Notificações Push Locais ou de Servidor (compatível com FCM e padrão)
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let rawData = {};
    let title = 'AtriosWork';
    let body = 'Nova notificação do sistema!';
    let url = '/';

    try {
      if (event.data) {
        try {
          rawData = event.data.json();
          console.log('[Service Worker] Notificação push JSON recebida:', rawData);

          // Se for uma mensagem do FCM (Firebase) e o SDK oficial estiver carregado, 
          // evitamos tratar aqui no listener nativo para que não haja duplicações (o SDK do Firebase cuidará de onBackgroundMessage).
          const isFromFcm = rawData.from || rawData['gcm.message_id'] || rawData.data?.['gcm.message_id'] || rawData.notification;
          if (isFromFcm && typeof firebase !== 'undefined') {
            console.log('[Service Worker] Mensagem FCM detectada. Delegando tratamento ao SDK do Firebase...');
            return;
          }
        } catch (e) {
          console.log('[Service Worker] Notificação push de texto recebida:', event.data.text());
          rawData = { title: 'AtriosWork', body: event.data.text() };
        }
      }

      // Extrair informações de todas as formas possíveis (FCM, VAPID, plana, nested, data)
      title = rawData.notification?.title || 
              rawData.title || 
              rawData.data?.title || 
              rawData.data?.notification?.title || 
              'AtriosWork';
                  
      body = rawData.notification?.body || 
             rawData.body || 
             rawData.data?.body || 
             rawData.data?.notification?.body || 
             'Nova notificação do sistema!';
                 
      url = rawData.notification?.data?.url ||
            rawData.data?.url || 
            rawData.url || 
            rawData.data?.notification?.url || 
            '/';
    } catch (extractErr) {
      console.error('[Service Worker] Erro ao extrair dados da notificação:', extractErr);
    }

    try {
      // Resolver URLs relativas para absolutas usando self.location.origin para garantir que o OS consiga carregar as imagens em segundo plano com o app fechado
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

      try {
        await self.registration.showNotification(title, options);
      } catch (innerShowErr) {
        console.warn('[Service Worker] Falha ao exibir com opções avançadas (ações/vibração), tentando fallback simples:', innerShowErr);
        // Fallback simples sem ações ou vibrações complexas
        await self.registration.showNotification(title, {
          body: body,
          icon: iconUrl,
          data: url
        });
      }
    } catch (showErr) {
      console.error('[Service Worker] Erro fatal ao tentar disparar showNotification:', showErr);
    }
  })());
});

// Lidar com o toque ou clique na notificação push
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já tiver uma aba aberta, faz o focus nela
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não, abre uma nova janela
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// FCM Integrado ao topo síncrono.
