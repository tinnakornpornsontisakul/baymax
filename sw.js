/* ไฟล์นี้ "ไม่จำเป็น" — ถ้าไม่วางไว้ index.html ก็ยังทำงานได้ปกติทุกอย่าง
   วางไว้คู่กันเมื่อไหร่ คู่มือจะเปิดอ่านได้ตอนไม่มีเน็ต */

const VERSION = 'v3.26.0';
const CACHE = `baymax-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // เปิดหน้าเว็บ: ลองเน็ตก่อน ไม่มีเน็ตค่อยดึงของที่เก็บไว้
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        (await caches.open(CACHE)).put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // ฟอนต์ Google: ใช้ของเดิมไปก่อน แล้วค่อยอัปเดตเงียบ ๆ
  const url = new URL(req.url);
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
  }
});
