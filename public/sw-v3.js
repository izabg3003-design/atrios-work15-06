const CACHE_NAME = 'atrioswork-v6.5';
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
          // If no cache or cache throws, return a friendly offline response rather than returning undefined which causes "TypeError: Failed to fetch"
          return new Response(
            'AtriosWork: Ligação perdida e nenhum conteúdo offline guardado em cache. Por favor, verifique a sua ligação à Internet.',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
            }
          );
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
        try {
          return await fetch(event.request);
        } catch (fetchErr) {
          console.warn('[SW] Fetch failed for:', event.request.url, fetchErr);
          // Retornar uma resposta de erro amigável em vez de permitir a exceção "Failed to fetch" sem tratamento
          return new Response('Recurso indisponível temporariamente', { 
            status: 408, 
            statusText: 'Network Error',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        }
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
    let tag = `atrioswork-push-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (event.data) {
        let rawText = '';
        try {
          rawText = event.data.text();
        } catch (readErr) {
          console.warn('[Service Worker] Erro ao ler stream do event.data:', readErr);
        }

        if (rawText) {
          try {
            rawData = JSON.parse(rawText);
            console.log('[Service Worker] Notificação push JSON recebida:', rawData);
          } catch (e) {
            console.log('[Service Worker] Notificação push de texto recebida:', rawText);
            rawData = { title: 'AtriosWork', body: rawText };
          }
        }
      }

      if (rawData && typeof rawData === 'object') {
        const notif = rawData.notification || {};
        const data = rawData.data || {};
        const nestedNotif = data.notification || {};

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
                    
        const rawUrl = notif.data?.url ||
                       data.url || 
                       rawData.url || 
                       nestedNotif.url || 
                       rawData.fcmOptions?.link ||
                       rawData.fcm_options?.link ||
                       '/';

        url = (typeof rawUrl === 'string' && rawUrl.length > 0) ? rawUrl : '/';
        tag = `atrioswork-push-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      }
    } catch (extractErr) {
      console.error('[Service Worker] Erro ao extrair dados da notificação:', extractErr);
    }

    if (typeof title !== 'string' || !title) title = 'AtriosWork';
    if (typeof body !== 'string' || !body) body = 'Nova notificação do sistema!';
    if (typeof url !== 'string' || !url) url = '/';

    // Resolver ícone absoluto de forma segura usando a origem do Service Worker
    const origin = self.location.origin;
    const iconUrl = `${origin}/logo_atualizado.jpg?v=20260314_v1`;

    // Exibição resiliente com fallback em 3 níveis (Garante que a notificação SEMPRE seja exibida no SO com o app fechado)
    try {
      // Nível 1: Notificação completa com ícone, badge e link de redirecionamento
      await self.registration.showNotification(title, {
        body: body,
        icon: iconUrl,
        badge: iconUrl,
        data: url,
        tag: tag
      });
    } catch (err1) {
      console.warn('[Service Worker] Tentativa 1 de exibição falhou, tentando minimal com ícone:', err1);
      try {
        // Nível 2: Minimal com ícone e link
        await self.registration.showNotification(title, {
          body: body,
          icon: iconUrl,
          data: url,
          tag: tag
        });
      } catch (err2) {
        console.warn('[Service Worker] Tentativa 2 de exibição falhou, tentando fallback apenas texto:', err2);
        try {
          // Nível 3: Fallback absoluto (apenas título, corpo e tag) - Impossível falhar em qualquer SO/PWA
          await self.registration.showNotification(title || 'AtriosWork', {
            body: body || 'Nova mensagem no sistema',
            tag: tag
          });
        } catch (fatalErr) {
          console.error('[Service Worker] Falha no fallback absoluto de notificação:', fatalErr);
        }
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

  // Garantir de forma absoluta que a URL de redirecionamento use a origem atual do Service Worker (self.location.origin)
  // Isto resolve de forma robusta e definitiva o problema de ir para localhost em produção/móvel,
  // ou de ir para localhost/atrioswork.pt quando o utilizador testa na sandbox do Google AI Studio.
  try {
    const parsed = new URL(absoluteUrl);
    const swOrigin = self.location.origin;
    if (parsed.origin !== swOrigin) {
      absoluteUrl = swOrigin + parsed.pathname + parsed.search + parsed.hash;
    }
  } catch (e) {
    console.warn('[Service Worker] Erro ao analisar ou reescrever URL do clique:', e);
    absoluteUrl = self.location.origin + '/';
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