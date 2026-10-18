/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// App shell.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Read-only shared exercise catalog (owner_user_id is null, so nothing personal):
// usable offline, refreshed in the background.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.pathname.startsWith('/rest/v1/exercises') &&
    url.searchParams.get('owner_user_id') === 'is.null',
  new StaleWhileRevalidate({
    cacheName: 'exercise-catalog',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
);

// The page decides when to activate a waiting worker (never mid-workout).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

function readPayload(event: PushEvent): PushPayload {
  try {
    return event.data?.json() ?? {};
  } catch {
    return { body: event.data?.text() };
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'FitTrack', {
      body: data.body,
      tag: data.tag, // same tag replaces instead of stacking
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | null)?.url ?? '/', self.location.origin)
    .href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser rotated the subscription: the app re-registers it on next open.
self.addEventListener('pushsubscriptionchange', () => {
  void self.clients
    .matchAll({ type: 'window' })
    .then((clients) => clients.forEach((c) => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })));
});
