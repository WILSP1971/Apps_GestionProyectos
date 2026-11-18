/// <reference lib="webworker" />
import type { PrecacheEntry, RouteHandlerCallback, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';

/**
 * Service Worker de SierraFlow (Offline-First).
 *  - Precarga el "app shell": todos los JS/CSS de Next.js y la página /offline.
 *  - Páginas: red primero (4 s) y, sin red, la copia en caché.
 *  - Detalle de solicitud: sin copia exacta, sirve cualquier otro detalle en caché como plantilla;
 *    el componente lee el id de la URL y los datos de IndexedDB.
 *  - /api/*: siempre red (los datos viajan por el motor de sincronización, no por la caché).
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const CACHE_PAGINAS = 'sierraflow-paginas';
const RUTA_DETALLE = /^\/solicitudes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
const RUTA_OFFLINE = '/offline';

const estrategiaPaginas = new NetworkFirst({
  cacheName: CACHE_PAGINAS,
  networkTimeoutSeconds: 4,
  matchOptions: { ignoreVary: true },
  plugins: [
    // Nunca guardar redirecciones (p. ej. a /login cuando la sesión expiró) bajo la URL pedida
    { cacheWillUpdate: async ({ response }) => (response.ok && !response.redirected ? response : null) },
    new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 14 * 24 * 60 * 60 }),
  ],
});

const manejarPagina: RouteHandlerCallback = async ({ request, event }) => {
  try {
    return await estrategiaPaginas.handle({ request, event });
  } catch {
    const ruta = new URL(request.url).pathname;
    if (RUTA_DETALLE.test(ruta)) {
      const cache = await caches.open(CACHE_PAGINAS);
      for (const clave of await cache.keys()) {
        if (RUTA_DETALLE.test(new URL(clave.url).pathname)) {
          const copia = await cache.match(clave, { ignoreVary: true });
          if (copia) return copia;
        }
      }
    }
    return (await serwist.matchPrecache(RUTA_OFFLINE)) ?? Response.error();
  }
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, sameOrigin }) =>
        sameOrigin && request.method === 'GET' && (request.mode === 'navigate' || request.headers.get('X-Precalentar') === '1'),
      handler: manejarPagina,
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'sierraflow-estaticos',
        plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && ['image', 'font', 'style', 'script', 'manifest'].includes(request.destination),
      handler: new StaleWhileRevalidate({
        cacheName: 'sierraflow-recursos',
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ],
});

serwist.addEventListeners();
