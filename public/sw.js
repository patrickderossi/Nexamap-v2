// Service Worker for caching static assets and map tiles
const CACHE_NAME = 'wa-property-app-v1';
const STATIC_CACHE = 'static-v1';
const TILES_CACHE = 'map-tiles-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/robots.txt'
];

// Map tile URLs to cache
const TILE_URL_PATTERNS = [
  /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/,
  /^https:\/\/public-services\.slip\.wa\.gov\.au\/.*/,
  /^https:\/\/services\.slip\.wa\.gov\.au\/.*/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== TILES_CACHE && cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests with appropriate caching strategies
  if (TILE_URL_PATTERNS.some(pattern => pattern.test(request.url))) {
    // Map tiles: Cache first, then network (for better performance)
    event.respondWith(cacheFirstStrategy(request, TILES_CACHE));
  } else if (request.destination === 'image') {
    // Images: Cache first strategy
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
  } else if (request.destination === 'script' || request.destination === 'style') {
    // JS/CSS: Stale while revalidate
    event.respondWith(staleWhileRevalidateStrategy(request, STATIC_CACHE));
  } else if (url.pathname.startsWith('/api/') || url.hostname.includes('slip.wa.gov.au')) {
    // API calls: Network first with short cache fallback
    event.respondWith(networkFirstStrategy(request, CACHE_NAME, 5 * 60 * 1000)); // 5 minutes
  } else {
    // Other resources: Network first
    event.respondWith(networkFirstStrategy(request, CACHE_NAME));
  }
});

// Cache first strategy - good for static assets and map tiles
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Cache hit:', request.url);
      return cachedResponse;
    }
    
    console.log('Cache miss, fetching:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    throw error;
  }
}

// Network first strategy - good for API calls and dynamic content
async function networkFirstStrategy(request, cacheName, maxAge = null) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      
      // Add timestamp for maxAge checking
      if (maxAge) {
        const responseToCache = networkResponse.clone();
        responseToCache.headers.set('sw-cache-timestamp', Date.now().toString());
        cache.put(request, responseToCache);
      } else {
        cache.put(request, networkResponse.clone());
      }
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', request.url);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Check if cache is too old
      if (maxAge) {
        const cacheTimestamp = cachedResponse.headers.get('sw-cache-timestamp');
        if (cacheTimestamp && (Date.now() - parseInt(cacheTimestamp)) > maxAge) {
          console.log('Cache too old, removing:', request.url);
          cache.delete(request);
          throw error;
        }
      }
      console.log('Serving from cache (offline):', request.url);
      return cachedResponse;
    }
    
    throw error;
  }
}

// Stale while revalidate strategy - good for non-critical resources
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Start fetching the latest version in the background
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      // Ignore network errors for this strategy
    });
  
  // Return cached version immediately if available, otherwise wait for network
  if (cachedResponse) {
    console.log('Serving stale content:', request.url);
    return cachedResponse;
  }
  
  return fetchPromise;
}

// Handle service worker messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
