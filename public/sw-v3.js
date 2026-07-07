const CACHE_NAME = 'atrioswork-v6.2.0';
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

      // Evitar duplicar notificações do FCM se o SDK do Firebase já estiver ativo na mesma thread do Service Worker E a app estiver FOCADA (ativa no ecrã).
      // Se a app estiver em segundo plano ou FECHADA, garantimos a exibição forçada para garantir que chegue sempre.
      let isAppFocused = false;
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        isAppFocused = clients && clients.some(client => client.focused);
      } catch (clientErr) {
        console.warn('[Service Worker] Falha ao verificar se app está focado:', clientErr);
      }

      const isFcmMessage = !!(rawData && (rawData.from || rawData.collapse_key || rawData['gcm.message_id'] || rawData.google || rawData.multicast_id));

      if (isFcmMessage) {
        if (isAppFocused) {
          console.log('[Service Worker] Notificação push detectada como FCM com o App FOCADO e ativo. O Firebase SDK ou app tratará em primeiro plano. Ignorando.');
          return;
        } else {
          console.log('[Service Worker] Notificação push detectada como FCM com o App desfocado ou FECHADO. Forçando exibição manual para garantir entrega.');
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

      // Gerar uma tag única para de-duplicação nativa do navegador
      const messageTag = rawData['gcm.message_id'] || rawData.collapse_key || rawData.data?.['gcm.message_id'] || title;

      // Verificar se já existe uma notificação visível idêntica ou com a mesma tag para de-duplicar
      try {
        const activeNotifications = await self.registration.getNotifications();
        const isAlreadyShown = activeNotifications.some(n => 
          n.tag === messageTag || (n.title === title && n.body === body)
        );
        if (isAlreadyShown) {
          console.log('[Service Worker] Notificação com mesma tag ou conteúdo já está visível. Cancelando exibição duplicada.');
          return;
        }
      } catch (notifCheckErr) {
        console.warn('[Service Worker] Falha ao obter notificações ativas:', notifCheckErr);
      }
    } catch (extractErr) {
      console.error('[Service Worker] Erro ao extrair dados da notificação:', extractErr);
    }

    try {
      // Resolver URLs relativas para absolutas usando self.location.origin para garantir que o OS consiga carregar as imagens em segundo plano com o app fechado
      const origin = self.location.origin;
      const iconUrl = new URL('/logo_atualizado.jpg?v=20260314_v1', origin).href;
      const messageTag = rawData['gcm.message_id'] || rawData.collapse_key || rawData.data?.['gcm.message_id'] || title;

      const options = {
        body: body,
        icon: iconUrl,
        badge: iconUrl,
        vibrate: [200, 100, 200],
        data: url,
        tag: messageTag,
        renotify: false, // Não re-vibrar se for apenas atualização
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
          tag: messageTag
        });
      }
    } catch (showErr) {
      console.error('[Service Worker] Erro fatal ao tentar disparar showNotification:', showErr);
      try {
        // Último recurso de fallback absoluto para evitar que o navegador bloqueie permissões de push por silêncio
        await self.registration.showNotification(title, {
          body: body
        });
      } catch (catastrophicErr) {
        console.error('[Service Worker] Falha catastrófica no fallback absoluto de segurança:', catastrophicErr);
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