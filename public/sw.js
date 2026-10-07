/*
 * RQ PWA lifecycle worker.
 *
 * Deliberately does not cache or intercept requests: authenticated application
 * data, API responses, and Firebase traffic must always use the network and
 * retain their normal server-side authorization behavior.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
