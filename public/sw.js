/**
 * Knowledge Foyer Service Worker
 * Progressive Web App implementation with caching strategies
 */

const CACHE_NAME = 'knowledge-foyer-v1.0.0';
const DYNAMIC_CACHE = 'knowledge-foyer-dynamic-v1';
const API_CACHE = 'knowledge-foyer-api-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/main.css',
  '/css/layouts/spa.css',
  '/js/core/app.js',
  '/js/core/router.js',
  '/js/core/mcp-client.js',
  '/js/core/spa-manager.js',
  '/js/core/spa-navigation.js',
  '/js/components/modal.js',
  '/js/components/feedback-system.js',
  '/js/components/article-editor.js',
  '/js/pages/spa-landing.js',
  '/js/pages/spa-article.js',
  '/js/pages/spa-dashboard.js',
  '/js/pages/spa-editor.js',
  '/js/pages/spa-search.js',
  '/favicon.ico'
];

// Routes that should be cached
const CACHED_ROUTES = [
  '/',
  '/dashboard',
  '/search',
  '/create',
  '/login',
  '/register'
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /\/api\/articles/,
  /\/api\/users/,
  /\/api\/tags/,
  /\/api\/search/
];

/**
 * Service Worker Install Event
 */
self.addEventListener('install', event => {
  console.log('👷 Service Worker installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching static assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Failed to cache static assets:', error);
      })
  );
});

/**
 * Service Worker Activate Event
 */
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activating...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              return cacheName.startsWith('knowledge-foyer-') && cacheName !== CACHE_NAME;
            })
            .map(cacheName => {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('✅ Old caches cleaned up');
        return self.clients.claim();
      })
  );
});

/**
 * Service Worker Fetch Event
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Handle different types of requests
  if (isStaticAsset(request.url)) {
    event.respondWith(handleStaticAsset(request));
  } else if (isAPIRequest(request.url)) {
    event.respondWith(handleAPIRequest(request));
  } else if (isPageRequest(request)) {
    event.respondWith(handlePageRequest(request));
  } else {
    event.respondWith(handleDynamicContent(request));
  }
});

/**
 * Handle static asset requests (cache-first strategy)
 */
async function handleStaticAsset(request) {
  try {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('Error handling static asset:', error);
    return createOfflineResponse();
  }
}

/**
 * Handle API requests (network-first strategy with fallback)
 */
async function handleAPIRequest(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    throw new Error(`Network response not ok: ${networkResponse.status}`);
  } catch (error) {
    console.log('Network request failed, trying cache:', error.message);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return createAPIErrorResponse();
  }
}

/**
 * Handle page requests (SPA shell strategy)
 */
async function handlePageRequest(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    throw new Error(`Network response not ok: ${networkResponse.status}`);
  } catch (error) {
    console.log('Page request failed, serving app shell:', error.message);

    // Always serve the main app shell for SPA routes
    const appShell = await caches.match('/') || await caches.match('/index.html');
    if (appShell) {
      return appShell;
    }

    return createOfflinePageResponse();
  }
}

/**
 * Handle dynamic content (cache-first with network fallback)
 */
async function handleDynamicContent(request) {
  try {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      // Return cached version immediately, update in background
      updateCacheInBackground(request);
      return cachedResponse;
    }

    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('Error handling dynamic content:', error);
    return createOfflineResponse();
  }
}

/**
 * Update cache in background
 */
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, networkResponse);
    }
  } catch (error) {
    // Silently fail background updates
    console.log('Background cache update failed:', error.message);
  }
}

/**
 * Check if request is for a static asset
 */
function isStaticAsset(url) {
  return /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/.test(url);
}

/**
 * Check if request is for API data
 */
function isAPIRequest(url) {
  return API_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if request is for a page
 */
function isPageRequest(request) {
  return request.headers.get('accept')?.includes('text/html');
}

/**
 * Create offline response for static assets
 */
function createOfflineResponse() {
  return new Response('Offline content not available', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain'
    }
  });
}

/**
 * Create API error response
 */
function createAPIErrorResponse() {
  return new Response(JSON.stringify({
    error: true,
    message: 'API temporarily unavailable. Please check your connection.',
    offline: true
  }), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Create offline page response
 */
function createOfflinePageResponse() {
  const offlineHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - Knowledge Foyer</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: #f8fafc;
            }
            .offline-container {
                text-align: center;
                max-width: 400px;
                padding: 2rem;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .offline-icon {
                font-size: 4rem;
                margin-bottom: 1rem;
            }
            .offline-title {
                color: #1a202c;
                margin-bottom: 1rem;
            }
            .offline-message {
                color: #4a5568;
                margin-bottom: 2rem;
                line-height: 1.5;
            }
            .retry-btn {
                background: #2f5233;
                color: white;
                border: none;
                padding: 0.75rem 1.5rem;
                border-radius: 6px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: 500;
            }
            .retry-btn:hover {
                background: #1a2f1d;
            }
        </style>
    </head>
    <body>
        <div class="offline-container">
            <div class="offline-icon">📡</div>
            <h1 class="offline-title">You're Offline</h1>
            <p class="offline-message">
                It looks like you've lost your internet connection.
                Check your network and try again.
            </p>
            <button class="retry-btn" onclick="window.location.reload()">
                Try Again
            </button>
        </div>
    </body>
    </html>
  `;

  return new Response(offlineHTML, {
    headers: {
      'Content-Type': 'text/html'
    }
  });
}

/**
 * Handle background sync
 */
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('🔄 Performing background sync...');

  try {
    // Sync any pending data when connection is restored
    const pendingData = await getStoredPendingData();

    if (pendingData.length > 0) {
      for (const item of pendingData) {
        await syncPendingItem(item);
      }
      await clearPendingData();
      console.log('✅ Background sync completed');
    }
  } catch (error) {
    console.error('❌ Background sync failed:', error);
  }
}

/**
 * Handle push notifications
 */
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New content available!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification('Knowledge Foyer', options)
  );
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(clients => {
        // Check if there's already a window/tab open with the target URL
        for (const client of clients) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }

        // If not, open a new window/tab
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
  );
});

/**
 * Cache management utilities
 */
async function getStoredPendingData() {
  // Mock implementation - would use IndexedDB in production
  return [];
}

async function syncPendingItem(item) {
  // Mock implementation - would sync data to server
  console.log('Syncing pending item:', item);
}

async function clearPendingData() {
  // Mock implementation - would clear IndexedDB
  console.log('Clearing pending data');
}

/**
 * Cache size management
 */
async function cleanupOldCaches() {
  const cacheNames = await caches.keys();

  for (const cacheName of cacheNames) {
    if (cacheName.startsWith('knowledge-foyer-') && cacheName !== CACHE_NAME) {
      await caches.delete(cacheName);
    }
  }
}

// Periodic cache cleanup
setInterval(cleanupOldCaches, 24 * 60 * 60 * 1000); // Daily cleanup

console.log('🚀 Knowledge Foyer Service Worker initialized');