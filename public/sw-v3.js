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
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // ONLY intercept GET requests to prevent issues with POST/PUT/DELETE API calls or third-party connections
  if (event.request.method !== 'GET') {
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
    // Cache First for other static assets/resources
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((networkResponse) => {
          // Optional dynamic caching can be done here, or simply return the response directly
          return networkResponse;
        }).catch((err) => {
          console.log(`Falha ao obter recurso fora de rede: ${event.request.url}`, err);
        });
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
                 
      url = rawData.data?.url || 
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