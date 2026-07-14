const CACHE_NAME = 'atrioswork-v6.3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo_atualizado.jpg?v=20260314_v1'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(
          ASSETS_TO_CACHE.map(async (url) => {
            try {
              await cache.add(url);
            } catch (err) {
              console.warn(`Falha ao colocar no cache durante instalação: ${url}`, err);
            }
          })
        );
      } catch (e) {
        console.warn('[SW] Cache open failed during install:', e);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      } catch (e) {
        console.warn('[SW] Cache keys failed during activate:', e);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorar chamadas de API de forma estrita para evitar interceptação ou caches falsos
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Ignorar qualquer requisição para origens externas (ex: Supabase, Jivosite, Google APIs, etc.) para evitar erros de rede / Failed to fetch
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

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
            try {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone).catch(() => {});
              }).catch(() => {});
            } catch (e) {
              console.warn('[SW] Cache storage access denied in this context:', e);
            }
          }
          return response;
        })
        .catch(async () => {
          try {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) return cachedResponse;
            const indexResponse = await caches.match('/index.html');
            if (indexResponse) return indexResponse;
            const rootResponse = await caches.match('/');
            if (rootResponse) return rootResponse;
          } catch (e) {
            console.warn('[SW] Cache fallback failed:', e);
          }
          // If no cache or cache throws, we can't do anything else, let browser handle or fail
        })
    );
  } else {
    // Cache First for other static assets/resources with absolute safety fallback
    event.respondWith(
      (async () => {
        try {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
        } catch (e) {
          console.warn('[SW] Cache match threw exception:', e);
        }
        return fetch(event.request);
      })()
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
    // Inicializar imediatamente com uma tag única baseada no tempo atual para garantir que nunca seja vazia ou duplicada
    let tag = `push-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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

      if (rawData && typeof rawData === 'object') {
        const notif = rawData.notification || {};
        const data = rawData.data || {};
        const nestedNotif = data.notification || {};

        // Extrair informações de todas as formas possíveis (FCM, VAPID, plana, nested, data) de forma segura
        title = notif.title || 
                rawData.title || 
                data.title || 
                nestedNotif.title || 
                'AtriosWork';
                    
        body = notif.body || 
               rawData.body || 
               data.body || 
               nestedNotif.body || 
               'Nova notificação do sistema!';
                   
        url = notif.data?.url ||
              data.url || 
              rawData.url || 
              nestedNotif.url || 
              '/';

        // Usar a tag fornecida ou manter a tag única gerada dinamicamente para evitar agrupamentos indesejados
        tag = notif.tag || 
              rawData.tag || 
              data.tag || 
              nestedNotif.tag || 
              tag;
      }
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
        tag: tag, // Tag única para cada notificação para que acumulem individualmente
        requireInteraction: true, // Força a notificação a ficar visível até que o utilizador interaja (não desaparece sozinha)
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
          data: url,
          tag: tag, // Tag única também no fallback
          requireInteraction: true
        });
      }
    } catch (showErr) {
      console.error('[Service Worker] Erro fatal ao tentar disparar showNotification:', showErr);
      try {
        // Fallback absoluto e super simples para satisfazer o requisito de "user-visible-only" do Chrome/Safari e evitar punição de quota
        await self.registration.showNotification(title || 'AtriosWork', {
          body: body || 'Nova atualização no sistema.',
          tag: tag || 'atrioswork-fail-safe',
          requireInteraction: true
        });
      } catch (fatalErr) {
        console.error('[Service Worker] Falha no fallback absoluto:', fatalErr);
      }
    }
  })());
});

// Lidar com o toque ou clique na notificação push
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  let targetUrl = event.notification.data || '/';
  if (typeof targetUrl !== 'string') {
    targetUrl = '/';
  }
  
  let absoluteUrl = targetUrl;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    try {
      absoluteUrl = new URL(targetUrl, self.location.origin).href;
    } catch (e) {
      absoluteUrl = self.location.origin + '/';
    }
  }

  console.log('[Service Worker] Notificação clicada. Redirecionando para:', absoluteUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 1. Procurar por uma aba que já esteja na URL exata e focar nela
        for (const client of clientList) {
          if (client.url === absoluteUrl && 'focus' in client) {
            return client.focus();
          }
        }

        // 2. Tentar focar em qualquer aba aberta na mesma origem e navegar para a URL de destino
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client && client.url !== absoluteUrl) {
              try {
                client.navigate(absoluteUrl);
              } catch (navErr) {
                console.warn('[Service Worker] Falha ao navegar aba aberta para a URL de destino:', navErr);
              }
            }
            return client.focus();
          }
        }
        
        // 3. Se nenhuma aba do app estiver aberta, abrir uma nova janela
        if (clients.openWindow) {
          return clients.openWindow(absoluteUrl);
        }
      })
      .catch((err) => {
        console.error('[Service Worker] Erro ao lidar com o clique da notificação:', err);
      })
  );
});