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
          if (cacheName !== CACHE_NAME && cacheName !== 'atrioswork-config-v1') {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tenta executar uma checagem inicial em background ao instalar/activar
      return checkNewPushesInBackground();
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
    // Alimenta o trigger de checagem em background sempre que o utilizador navega
    event.waitUntil(checkNewPushesInBackground());

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

// Suporte para Receber Notificações Push Locais ou de Servidor (Push API nativo)
self.addEventListener('push', (event) => {
  let data = { title: 'Send Push', body: 'Nova notificação do sistema!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Send Push', body: event.data.text() };
    }
  }

  const origin = self.location.origin;
  const options = {
    body: data.body,
    icon: `${origin}/logo_atualizado.jpg?v=20260314_v1`,
    badge: `${origin}/logo_atualizado.jpg?v=20260314_v1`,
    vibrate: [200, 100, 200],
    data: data.url || '/',
    actions: [
      { action: 'open', title: 'Ver App' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
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

// -----------------------------------------------------------------------------
// Sincronização Periódica e Background Sync para checagem em ecrã bloqueado/fechado
// -----------------------------------------------------------------------------

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-new-pushes') {
    event.waitUntil(checkNewPushesInBackground());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'check-new-pushes') {
    event.waitUntil(checkNewPushesInBackground());
  }
});

// Funções utilitárias de leitura e gravação no CacheStorage partilhado
async function readFromCache(key) {
  try {
    const cache = await caches.open('atrioswork-config-v1');
    const response = await cache.match(new Request(`https://local-config/${key}`));
    if (response) {
      return await response.json();
    }
  } catch (e) {
    // Ignorado silenciado
  }
  return null;
}

async function saveToCache(key, data) {
  try {
    const cache = await caches.open('atrioswork-config-v1');
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(new Request(`https://local-config/${key}`), response);
  } catch (e) {
    // Ignorado silenciado
  }
}

// Checagem em background de novas mensagens via REST API do Supabase
async function checkNewPushesInBackground() {
  try {
    const config = await readFromCache('config');
    if (!config || !config.supabaseUrl || !config.supabaseKey) return;

    const fetchUrl = `${config.supabaseUrl}/rest/v1/app_banners?is_active=eq.true&order=created_at.desc`;
    const response = await fetch(fetchUrl, {
      headers: {
        'apikey': config.supabaseKey,
        'Authorization': `Bearer ${config.supabaseKey}`
      }
    });

    if (!response.ok) return;
    const data = await response.json();
    if (!data || data.length === 0) return;

    // Utiliza a mesma lógica de descompatibilização do cta_link e user_type
    const parsedBanners = data.map(dbBanner => {
      let user_type = 'all';
      let cta_link = dbBanner.cta_link || '';

      if (cta_link.includes('||user_type:')) {
        const parts = cta_link.split('||user_type:');
        cta_link = parts[0];
        user_type = parts[1];
      }

      return {
        ...dbBanner,
        cta_link,
        user_type
      };
    });

    const targetType = config.isPro ? 'premium' : 'free';
    const pushes = parsedBanners.filter(b => {
      const isPush = b.user_type === 'push_notification' || 
                     b.title.toUpperCase().includes('[PUSH]') || 
                     (b.highlight && b.highlight.toUpperCase().includes('[PUSH]'));
      
      const isAudienceMatch = b.user_type === 'all' || b.user_type === targetType || b.user_type === 'push_notification';
      return b.is_active && isPush && isAudienceMatch;
    });

    if (pushes.length === 0) return;

    const shownIds = await readFromCache('shown_push_ids') || [];
    const freshPushes = pushes.filter(p => !shownIds.includes(p.id));

    if (freshPushes.length > 0) {
      for (const freshPush of freshPushes) {
        const cleanTitle = freshPush.title.replace('[PUSH]', '').replace('[push]', '').trim();
        const cleanBody = `${freshPush.highlight || ''} ${freshPush.subtitle || ''}`.trim();

        await self.registration.showNotification(cleanTitle, {
          body: cleanBody,
          icon: `${self.location.origin}/logo_atualizado.jpg?v=20260314_v1`,
          badge: `${self.location.origin}/logo_atualizado.jpg?v=20260314_v1`,
          vibrate: [200, 100, 200],
          tag: `sendpush-alert-${freshPush.id}`,
          data: '/'
        });

        shownIds.push(freshPush.id);
      }

      await saveToCache('shown_push_ids', shownIds);
    }
  } catch (err) {
    console.warn('Erro ao atualizar push no Service Worker:', err);
  }
}
