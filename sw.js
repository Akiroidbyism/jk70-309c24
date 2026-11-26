// 受験70 service worker: 一度開けば、電波がなくても使えるようにする
const VER = 'jk70-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'data/q_eng.json', 'data/q_math.json', 'data/q_sci.json', 'data/q_soc.json', 'data/q_his.json', 'data/q_jpn.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => { if (res && res.ok) { const cp = res.clone(); caches.open(VER).then(c => c.put(r, cp)); } return res; }).catch(() => hit);
    return hit || net;   // まず保存ずみを返し、裏で新しいものに更新
  }));
});
