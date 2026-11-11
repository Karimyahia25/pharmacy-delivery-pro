// شاشة المندوب (نسخة Pro): أوردراته الشغّالة بس + زرار «تسليم» بيسجّل موقعه لحظة التسليم (مش تتبع طول اليوم).
// القراية: query واحد على أوردراته (driverName == اسمه && status == PENDING) — القواعد بتشترط الفلتر ده بالظبط.
// التسليم: updateDoc بحقول محددة؛ العمولة بتتحسب هنا بنفس قاعدة القواعد (والقواعد بتتأكد منها). لو الموقع فشل التسليم يكمّل بعلامة «بدون موقع».
import { collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOC_MSG = {
  denied: 'رفضت إذن الموقع، فمش هنقدر نسجّل مكان التسليم. تسلّم من غير موقع؟ (تقدر تفعّل الإذن من إعدادات المتصفح)',
  timeout: 'الموقع اتأخر ومقدرناش نحدده. تسلّم من غير موقع؟',
  unavailable: 'الـ GPS مش متاح دلوقتي (شغّل الموقع في الموبايل). تسلّم من غير موقع؟',
};
const LOC_LBL = { ok: '📍 اتسجّل الموقع', denied: 'من غير موقع (رفض الإذن)', timeout: 'من غير موقع (اتأخر)', unavailable: 'من غير موقع (GPS مش متاح)' };

function getLocation() {
  return new Promise(res => {
    if (!navigator.geolocation) return res({ status: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      p => res({ ok: true, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.max(0, Math.round(p.coords.accuracy || 0)) }),
      e => res({ status: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}

const PLATFORM = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop';
const HOW = {
  android: 'اضغط أيقونة الإعدادات (🔒 أو ⚙) يسار الرابط ← الأذونات ← الموقع ← سماح. ولو التطبيق مثبّت: دوس مطوّلاً على أيقونته ← معلومات التطبيق ← الأذونات ← الموقع ← السماح أثناء الاستخدام. وتأكد إن الموقع (GPS) شغّال من إعدادات الموبايل.',
  ios: 'الإعدادات ← الخصوصية والأمان ← خدمات الموقع ← شغّلها، وبعدين Safari Websites ← «أثناء استخدام التطبيق». وارجع افتح البرنامج.',
  desktop: 'اضغط أيقونة الإعدادات يسار الرابط ← Site settings ← Location ← Allow، وبعدين حدّث الصفحة.',
};
function css() {
  if (document.getElementById('drvCss')) return;
  const s = document.createElement('style'); s.id = 'drvCss';
  s.textContent = `
.drvwrap{max-width:560px;margin:0 auto;color:#1e293b}
.drvwrap .dhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0 10px}
.drvwrap .dhead h2{margin:0;font-size:19px}
.drvwrap .dcount{background:#dbeafe;color:#1e3a8a;border-radius:99px;padding:3px 12px;font-weight:800;font-size:14px}
.drvwrap .dnote{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:12px;padding:8px 12px;font-size:12.5px;margin-bottom:12px}
.drvwrap .dloc{border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:12px;border:1px solid;display:flex;flex-direction:column;gap:6px}
.drvwrap .dloc.ok{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
.drvwrap .dloc.warn{background:#fffbeb;border-color:#fde68a;color:#78350f}
.drvwrap .dloc.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}
.drvwrap .dloc b{font-size:14px}
.drvwrap .dloc .dlb{align-self:flex-start;min-height:38px;padding:6px 14px;border-radius:10px;border:1px solid currentColor;background:#fff;color:inherit;font-weight:800;font-size:13px}
.drvwrap .dloc .dhow{background:rgba(255,255,255,.7);border-radius:8px;padding:8px 10px;line-height:1.7}
.drvwrap .dcard{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:14px;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.05);display:flex;flex-direction:column;gap:8px}
.drvwrap .dcard.late{border:2px solid #f87171;background:#fef2f2}
.drvwrap .dtop{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.drvwrap .dcust{font-size:17px;font-weight:900}
.drvwrap .dval{font-size:24px;font-weight:900;color:#1d4ed8;white-space:nowrap}
.drvwrap .dchg{font-size:12.5px;color:#64748b}
.drvwrap .dchips{display:flex;flex-wrap:wrap;gap:6px}
.drvwrap .dchip{border-radius:8px;padding:2px 9px;font-size:12px;font-weight:700;background:#f1f5f9;color:#334155}
.drvwrap .dchip.out{background:#eef2ff;color:#3730a3}.drvwrap .dchip.in{background:#ecfdf5;color:#065f46}.drvwrap .dchip.late{background:#dc2626;color:#fff}
.drvwrap .dchip.pay{background:#dbeafe;color:#1e3a8a}
.drvwrap .dnotes{font-size:13px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:6px 10px;color:#78350f}
.drvwrap .dgo{width:100%;min-height:52px;font-size:17px;font-weight:900;background:#1d4ed8;color:#fff;border:0;border-radius:14px;box-shadow:0 6px 12px -6px rgba(29,78,216,.7)}
.drvwrap .dgo:disabled{opacity:.6}
.drvwrap .dempty{text-align:center;color:#64748b;padding:30px 10px;background:#fff;border:1px dashed #cbd5e1;border-radius:16px}
.drvwrap h3{font-size:14px;margin:18px 0 8px;color:#475569}
.drvwrap .ddone{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:8px 12px;background:#f8fafc;border-radius:10px;margin-bottom:6px}
.dtoast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:12px;z-index:95;font-size:14px;max-width:90vw;text-align:center}`;
  document.head.appendChild(s);
}

export function mountDriver(root, { db, CFG, uid, driverName }) {
  css(); root.classList.add('drvwrap');
  const OUT = new Set([CFG.zones.out, ...((CFG.zoneAliases && CFG.zoneAliases.out) || [])]);
  const isOut = z => OUT.has(z), commFor = z => isOut(z) ? CFG.commissionOut : 0;
  const M = n => Math.round(n || 0).toLocaleString('en-US') + ' ' + CFG.currency;
  const timeStr = ts => new Intl.DateTimeFormat(CFG.locale, { timeZone: CFG.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  const toast = t => { const d = document.createElement('div'); d.className = 'dtoast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); };
  let ORDERS = [], DONE = [], BUSY = '', READY = false, SEEN = null;
  let PERM = (window.isSecureContext && navigator.geolocation) ? 'unknown' : 'unsupported', TEST = null, TESTING = false;   // حالة إذن الموقع ونتيجة آخر فحص

  function locBar() {
    const btn = (t) => `<button type="button" class="dlb" data-loctest ${TESTING ? 'disabled' : ''}>${TESTING ? '⏳ بفحص…' : t}</button>`;
    if (PERM === 'unsupported') return `<div class="dloc bad"><b>🔴 الموقع مش متاح في المتصفح ده</b><span>افتح البرنامج من كروم أو سفاري على رابط https. التسليم هيتسجّل من غير موقع.</span></div>`;
    if (PERM === 'denied') return `<div class="dloc bad"><b>🔴 الموقع محظور</b><span>هتسلّم من غير موقع لحد ما تفتحه.</span><div class="dhow">${HOW[PLATFORM]}</div>${btn('🔄 جرّب تاني')}</div>`;
    if (TEST && !TEST.ok) {
      const m = TEST.status === 'timeout' ? 'الموقع اتأخر — جرّب في مكان مفتوح (بره المبنى).' : 'الـ GPS مش متاح — شغّل «الموقع/Location» من إعدادات الموبايل.';
      return `<div class="dloc warn"><b>🟡 مقدرتش أحدد موقعك</b><span>${m}</span>${btn('🔄 فحص تاني')}</div>`;
    }
    if (TEST && TEST.ok) return `<div class="dloc ${TEST.acc > 100 ? 'warn' : 'ok'}"><b>${TEST.acc > 100 ? '🟡' : '🟢'} الموقع شغّال — دقة ±${TEST.acc} متر</b>${TEST.acc > 100 ? '<span>الدقة ضعيفة — لو أمكن اقف في مكان مفتوح قبل التسليم.</span>' : ''}${btn('🔄 فحص تاني')}</div>`;
    if (PERM === 'granted') return `<div class="dloc ok"><b>🟢 الموقع مسموح</b>${btn('📍 اختبر موقعي')}</div>`;
    return `<div class="dloc warn"><b>🟡 لسه ماسمحتش بالموقع</b><span>فعّله دلوقتي علشان التسليم يتسجّل بمكانه.</span>${btn('📍 فعّل الموقع')}</div>`;
  }
  async function testLocation() {
    if (TESTING || PERM === 'unsupported') return;
    TESTING = true; draw();
    const r = await getLocation(); TESTING = false; TEST = r;
    if (r.ok) PERM = 'granted'; else if (r.status === 'denied') { PERM = 'denied'; TEST = null; }
    draw();
  }

  function draw() {
    const now = Date.now();
    const list = [...ORDERS].sort((a, b) => (a.assignedAt || a.startTime) - (b.assignedAt || b.startTime));   // الأقدم الأول
    root.innerHTML = `<div class="dhead"><h2>🛵 أهلاً ${esc(driverName)}</h2><span class="dcount">${list.length} أوردر</span></div>
      <div class="dnote">📍 بنسجّل موقعك لحظة ضغطك على «تسليم» بس — مش بنتتبعك طول اليوم.</div>
      ${locBar()}
      ${!READY ? '<div class="dempty">⏳ جاري التحميل…</div>' : list.length ? list.map(o => card(o, now)).join('') : '<div class="dempty">مفيش أوردرات عليك دلوقتي ✔</div>'}
      ${DONE.length ? `<h3>اتسلّمت دلوقتي</h3>${DONE.slice(0, 8).map(o => `<div class="ddone"><span>${esc(o.customerName || 'عميل')} · ${M(o.orderValue)}</span><span>${LOC_LBL[o.locStatus] || ''}</span></div>`).join('')}` : ''}`;
    root.querySelectorAll('[data-fin]').forEach(b => b.onclick = () => deliver(b.dataset.fin));
    root.querySelectorAll('[data-loctest]').forEach(b => b.onclick = testLocation);
  }

  function card(o, now) {
    const min = Math.floor((now - (o.assignedAt || o.startTime)) / 60000), late = !isOut(o.zone) && (now - o.startTime) >= CFG.promiseMin * 60000, out = isOut(o.zone);
    return `<div class="dcard ${late ? 'late' : ''}"><div class="dtop"><div><div class="dcust">👤 ${esc(o.customerName || 'عميل')}</div>${o.changeGiven ? `<div class="dchg">فكة معاك: ${M(o.changeGiven)}</div>` : ''}</div><div class="dval">${M(o.orderValue)}</div></div>
      <div class="dchips"><span class="dchip ${out ? 'out' : 'in'}">${esc(out ? CFG.zones.out : CFG.zones.in)}${out && CFG.commissionOut ? ` · عمولتك ${M(CFG.commissionOut)}` : ''}</span>
        <span class="dchip">🕒 خرجت من ${min} د</span>${late ? `<span class="dchip late">⚠ عدّى ${CFG.promiseMin} دقيقة</span>` : ''}
        ${o.isVisa ? '<span class="dchip pay">💳 فيزا</span>' : ''}${o.isVodafoneCash ? '<span class="dchip pay">📱 فودافون كاش</span>' : ''}</div>
      ${o.notes ? `<div class="dnotes">📝 ${esc(o.notes)}</div>` : ''}
      <button type="button" class="dgo" data-fin="${esc(o.id)}" ${BUSY ? 'disabled' : ''}>${BUSY === o.id ? '⏳ بحدد موقعك…' : '✔ تسليم'}</button></div>`;
  }

  async function deliver(id) {
    const o = ORDERS.find(x => x.id === id); if (!o || BUSY) return;
    if (!navigator.onLine) { toast('مفيش نت — مينفعش تسلّم دلوقتي'); return; }
    if (!confirm(`تأكيد تسليم أوردر «${o.customerName || 'عميل'}» (${M(o.orderValue)})؟`)) return;
    BUSY = id; draw();
    const loc = await getLocation();
    if (loc.ok) PERM = 'granted'; else if (loc.status === 'denied') PERM = 'denied';
    if (!loc.ok && !confirm(LOC_MSG[loc.status])) { BUSY = ''; draw(); return; }
    const data = { status: 'COMPLETED', endTime: Date.now(), endSource: 'app', comm: commFor(o.zone),
      ...(loc.ok ? { locStatus: 'ok', deliveredLoc: { lat: loc.lat, lng: loc.lng, acc: loc.acc } } : { locStatus: loc.status }) };
    try {
      await updateDoc(doc(db, 'deliv_orders', id), data);
      DONE.unshift({ ...o, ...data });
      toast(loc.ok && loc.acc > 100 ? `✔ اتسلّم (دقة الموقع ضعيفة ±${loc.acc} متر)` : '✔ اتسلّم');
    } catch (e) { toast('مقدرتش أسلّم: ' + (e.code === 'permission-denied' ? 'الأوردر اتغيّر أو اتسلّم قبل كده — حدّث الصفحة' : (e.code || e.message))); }
    BUSY = ''; draw();
  }

  onSnapshot(query(collection(db, 'deliv_orders'), where('driverName', '==', driverName), where('status', '==', 'PENDING')), snap => {
    ORDERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const ids = new Set(ORDERS.map(o => o.id));
    if (SEEN && [...ids].some(i => !SEEN.has(i))) { try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch (e) { } toast('🆕 أوردر جديد'); }
    SEEN = ids; READY = true; draw();
  }, e => { root.innerHTML = `<div class="banner bad">مقدرتش أقرا أوردراتك: ${esc(e.code || e.message)}${e.code === 'permission-denied' ? ' — كلّم المدير (حسابك مش مربوط باسمك في قايمة المناديب)' : ''}</div>`; });
  if (PERM === 'unknown' && navigator.permissions && navigator.permissions.query) {   // لو المتصفح بيدعم Permissions API: نعرف الحالة من غير ما نطلب إذن، ونتابع أي تغيير
    navigator.permissions.query({ name: 'geolocation' }).then(st => { PERM = st.state; st.onchange = () => { PERM = st.state; if (PERM !== 'granted') TEST = null; draw(); }; draw(); }).catch(() => { });
  }
  setInterval(() => { if (root.isConnected && !BUSY && !TESTING) draw(); }, 30000);   // تحديث الدقايق محلياً (من غير قراية)
  draw();
}
