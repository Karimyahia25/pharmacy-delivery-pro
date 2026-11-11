// Service worker: بيحفظ ملفات البرنامج في الجهاز علشان يفتح حتى لو النت وقع.
// مبيلمسش اتصالات Firebase (Firestore/Auth) خالص — دي بتروح للشبكة دايماً. البيانات الأوفلاين من كاش Firestore نفسه مش من هنا.
// الملفات: الشبكة الأول (بنتجاوز كاش المتصفح لأن GitHub Pages بيحط max-age=600 فكان بيرجّع نسخة قديمة لحد 10 دقايق)،
// ولو الشبكة وقعت أو اتأخرت أكتر من 4 ثواني ← النسخة المحفوظة. المكتبات الخارجية (نسخ مثبّتة برقم) ← الكاش الأول.
// لما تغيّر أي ملف في البرنامج: ارفع رقم V علشان الأجهزة تمسح النسخة القديمة.
const V = 'delivery-pro-v2';
const SHELL = ['./', 'index.html', 'css/app.css', 'src/app.js', 'src/settings.js', 'src/users.js', 'src/driver.js', 'src/core.js', 'src/config.js', 'src/firebase.js', 'src/firebase-config.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/'];
const WAIT = 4000;

self.addEventListener('install', e => {
  // cache: 'reload' = من السيرفر مش من كاش المتصفح
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' }).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const fromCache = req => caches.open(V).then(c => c.match(req, { ignoreSearch: true }));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (CDN.some(p => req.url.startsWith(p))) {                       // مكتبات خارجية مثبّتة برقم الإصدار: من الكاش لو موجودة
    e.respondWith(caches.open(V).then(c => c.match(req)).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return res;
    })));
    return;
  }

  if (url.origin !== location.origin) return;                        // أي حاجة تانية (Firebase APIs…) تعدّي للشبكة

  // ملفات البرنامج: الشبكة الأول من غير كاش المتصفح، والنسخة المحفوظة لو فشلت أو اتأخرت
  e.respondWith((async () => {
    const net = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return res;
    });
    try {
      return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), WAIT))]);
    } catch (err) {
      net.catch(() => { });                                           // الطلب يكمّل في الخلفية ويحدّث الكاش
      const hit = await fromCache(req);
      return hit || (req.mode === 'navigate' ? await fromCache('index.html') : Response.error());
    }
  })());
});
