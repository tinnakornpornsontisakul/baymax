/* คู่มือผู้ใช้ Baymax — service worker
   กลยุทธ์:
   - app shell  : precache ตอน install, เสิร์ฟแบบ cache-first
   - ฟอนต์/CDN  : stale-while-revalidate เก็บไว้แคชแยก
   - navigation : network-first แล้ว fallback เป็นหน้าที่แคชไว้ (ใช้งาน offline ได้)
*/

const VERSION = 'v1.1.0';
const SHELL_CACHE = `baymax-shell-${VERSION}`;
const ASSET_CACHE = `baymax-assets-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // ไฟล์ใดโหลดไม่ได้ก็ไม่ให้ install ล้ม
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

// หน้าเว็บสั่งให้ SW ตัวใหม่ทำงานทันที
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isFontRequest = (url) =>
  url.origin === 'https://fonts.googleapis.com' ||
  url.origin === 'https://fonts.gstatic.com';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) เปิดหน้าเว็บ — ลองเน็ตก่อน ถ้าไม่มีเน็ตค่อยดึงจากแคช
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // 2) ฟอนต์จาก Google Fonts — ใช้ของเดิมไปก่อน แล้วค่อยอัปเดตเงียบ ๆ
  if (isFontRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => { cache.put(request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })());
    return;
  }

  // 3) ไฟล์ในโดเมนเดียวกัน — แคชก่อน แล้วเติมแคชเมื่อโหลดใหม่ได้
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const res = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, res.clone());
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })());
  }
});
