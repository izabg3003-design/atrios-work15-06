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

// --- LISTENER PARA NOTIFICAÇÕES PUSH EM SEGUNDO PLANO (APP FECHADO) ---
// Quando um servidor de Push de terceiros (FCM, OneSignal ou próprio servidor VAPID) 
// envia um payload, o browser acorda este Service Worker mesmo com o app fechado.
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Evento de Push recebido.');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      // Se não for JSON, trata como texto simples
      data = { title: 'AtriosWork', body: event.data.text() };
    }
  }

  const title = data.title || (data.notification && data.notification.title) || (data.data && data.data.title) || 'AtriosWork';
  const body = data.body || (data.notification && data.notification.body) || (data.data && data.data.body) || 'Nova notificação recebida!';
  const url = data.url || (data.data && data.data.url) || '/';
  
  const options = {
    body: body,
    icon: data.icon || (data.data && data.data.icon) || '/logo_atualizado.jpg',
    badge: data.badge || (data.data && data.data.badge) || '/logo_atualizado.jpg',
    vibrate: [100, 50, 100],
    data: {
      url: url
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// --- LISTENER PARA CLIQUE NA NOTIFICAÇÃO ---
// Quando o utilizador clica na notificação em segundo plano, abre o app ou foca na tab existente
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notificação clicada. Target URL:', event.notification.data.url);
  
  event.notification.close(); // Fecha o balão da notificação

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se houver uma aba aberta do site, foca nela e navega para a URL destino
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Se não houver abas abertas, abre uma nova janela
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});