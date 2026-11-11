// غلاف البرنامج: دخول بالاسم وكلمة السر ← قراءة الدور ← فتح شاشة التوصيل (core.js).
// الأدوار في Firestore: users/{uid} = { role: 'admin' | 'cashier' | 'viewer', name }.
//   admin = كل حاجة · cashier = جهاز الكاشير/الدليفري (يسجّل ويسلّم) · viewer = صاحب الصيدلية (إحصائيات وسجل من غير تعديل)
// مفيش تسجيل حساب جديد من البرنامج: الحسابات بيعملها الأدمن (Firebase Console دلوقتي).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CFG } from "./config.js";
import { firebaseConfig } from "./firebase-config.js";
import { setBackend } from "./firebase.js";
import { loadSettings, renderSettings } from "./settings.js";
// core.js بيتحمّل بعد الدخول وبعد دمج إعدادات الصيدلية (import ديناميكي) علشان بيقرا الإعدادات مرة واحدة وقت التحميل

const $ = s => document.querySelector(s);
const ROLES = { admin: 'مدير', cashier: 'كاشير', viewer: 'مطّلع', driver: 'مندوب' };   // driver = نسخة Pro (شاشة المندوب + موقع التسليم)
const ERR = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة السر غلط',
  'auth/wrong-password': 'اسم المستخدم أو كلمة السر غلط',
  'auth/user-not-found': 'اسم المستخدم أو كلمة السر غلط',
  'auth/invalid-email': 'اسم المستخدم مش مكتوب صح',
  'auth/user-disabled': 'الحساب ده متوقف — كلّم المدير',
  'auth/too-many-requests': 'محاولات كتير — استنى شوية وجرّب تاني',
  'auth/network-request-failed': 'مفيش اتصال بالإنترنت',
};

let LOCKED = false;   // حساب موقوف: بعد ما نعرض الرسالة مفيش شاشة تانية تتفتح فوقها
function show(id) { if (LOCKED && id !== 'msg') return; ['boot', 'msg', 'login', 'app'].forEach(x => { $('#' + x).hidden = x !== id; }); }
function message(title, body, withLogout, lock) {
  if (lock) LOCKED = true;
  $('#msgT').textContent = title; $('#msgB').textContent = body; $('#msgOut').hidden = !withLogout; show('msg');
}

document.title = CFG.name + ' — متابعة التوصيل';
$('#loginName').textContent = CFG.name;
$('#appName').textContent = CFG.name;

if (!firebaseConfig || !firebaseConfig.apiKey) {
  message('البرنامج لسه مش متوصل بقاعدة بيانات', 'محتاج ربط مشروع Firebase الخاص بالصيدلية قبل ما يشتغل.', false);
} else {
  start();
}

/* ---------- PWA: ملفات أوفلاين + حالة الاتصال + زرار التثبيت ---------- */
if ('serviceWorker' in navigator && !window.__DEV) navigator.serviceWorker.register('sw.js').catch(() => { });   // window.__DEV = تجربة محلية بـ Firebase وهمي (من غير كاش)

function flash(t) { const d = document.createElement('div'); d.className = 'flash'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
function netState() {
  const on = navigator.onLine;
  document.body.classList.toggle('offline', !on); $('#offBar').hidden = on; $('#net').textContent = on ? '' : '⚠ مفيش نت';
}
addEventListener('online', netState); addEventListener('offline', netState); netState();
// حارس: أوفلاين مفيش تسجيل/تسليم/حذف. الكتابة المعلّقة في Firestore كانت هتستنى النت من غير ما الشاشة تقول، وممكن تتقفل لما يرجع (القواعد بتشترط وقت السيرفر).
document.addEventListener('click', ev => {
  if (navigator.onLine) return;
  const b = ev.target.closest && ev.target.closest('#delRoot :is(.go:not(.ghost),.fin,[data-fin],[data-asgo],[data-rm],[data-brn],[data-adddrv],[data-deldrv],[data-new])');
  if (b) { ev.preventDefault(); ev.stopImmediatePropagation(); flash('مفيش نت — مينفعش تسجّل أو تسلّم دلوقتي'); }
}, true);

let installEv = null;
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEv = ev; $('#install').hidden = false; });
addEventListener('appinstalled', () => { installEv = null; $('#install').hidden = true; });
$('#install').onclick = async () => { if (!installEv) return; installEv.prompt(); try { await installEv.userChoice; } catch (e) { } installEv = null; $('#install').hidden = true; };

/* ---------- تغيير كلمة السر (كل مستخدم لنفسه): لازم يكتب الحالية الأول ---------- */
const PW_ERR = { 'auth/wrong-password': 'كلمة السر الحالية غلط', 'auth/invalid-credential': 'كلمة السر الحالية غلط', 'auth/weak-password': 'كلمة السر الجديدة ضعيفة',
  'auth/too-many-requests': 'محاولات كتير — استنى شوية وجرّب تاني', 'auth/network-request-failed': 'مفيش اتصال بالإنترنت', 'auth/requires-recent-login': 'اخرج وادخل تاني وجرّب' };
function setupPassword(user) {
  const dlg = $('#pwDlg'), g = id => $('#' + id), err = g('pwErr');
  const close = () => { dlg.hidden = true; ['pwCur', 'pwNew', 'pwNew2'].forEach(i => { g(i).value = ''; }); err.textContent = ''; g('pwSave').disabled = false; };
  $('#pwBtn').hidden = false;
  $('#pwBtn').onclick = () => { dlg.hidden = false; g('pwCur').focus(); };
  g('pwCancel').onclick = close;
  dlg.onclick = ev => { if (ev.target === dlg) close(); };
  g('pwSave').onclick = async () => {
    err.textContent = '';
    const cur = g('pwCur').value, nw = g('pwNew').value, nw2 = g('pwNew2').value;
    const bad = (!cur && 'اكتب كلمة السر الحالية') || (nw.length < 8 && 'كلمة السر الجديدة لازم 8 حروف على الأقل') || (nw !== nw2 && 'التأكيد مش مطابق') || (nw === cur && 'الجديدة لازم تختلف عن الحالية');
    if (bad) { err.textContent = bad; return; }
    if (!navigator.onLine) { err.textContent = 'مفيش اتصال بالإنترنت'; return; }
    g('pwSave').disabled = true;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
      await updatePassword(user, nw);
      close(); flash('✔ كلمة السر اتغيّرت');
    } catch (e) { err.textContent = PW_ERR[e.code] || ('مقدرتش أغيّرها: ' + (e.code || e.message)); g('pwSave').disabled = false; }
  };
}

function openDb(app) {   // كاش محلي (IndexedDB): الشاشة بتفتح بآخر بيانات حتى من غير نت. لو المتصفح مش بيدعمه (تصفح خاص) نرجع للعادي.
  try { return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { return getFirestore(app); }
}

function start() {
  const app = initializeApp(firebaseConfig), auth = getAuth(app), db = openDb(app);
  setBackend(db, auth);
  // الخروج بيمسح كاش البيانات من الجهاز (الأجهزة مشتركة) وبعدين reload علشان حالة الشاشة تتصفّر
  const out = async () => {
    try { await signOut(auth); } catch (e) { }
    try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { }
    location.reload();
  };
  $('#appOut').onclick = out; $('#msgOut').onclick = out;

  // اسم المستخدم من غير @ ← نكمّله بدومين الدخول (الكاشير يكتب «cashier» بس)
  const email = v => { v = v.trim(); return v.includes('@') ? v : v + '@' + CFG.loginDomain; };
  $('#login').onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('#lgo'), err = $('#lerr'); err.textContent = ''; btn.disabled = true;
    try { await signInWithEmailAndPassword(auth, email($('#lu').value), $('#lp').value); }
    catch (e) { err.textContent = ERR[e.code] || ('مقدرتش أدخّلك: ' + (e.code || e.message)); btn.disabled = false; }
  };

  let mounted = false;
  onAuthStateChanged(auth, async user => {
    if (!user) { mounted = false; show('login'); $('#lgo').disabled = false; return; }
    if (mounted) return;
    show('boot');
    let prof = null;
    try { const s = await getDoc(doc(db, 'users', user.uid)); prof = s.exists() ? s.data() : null; }
    catch (e) { message('مقدرتش أقرا بيانات حسابك', (e.code || e.message), true); return; }
    if (prof && prof.active === false) { message('حسابك موقوف', 'كلّم المدير علشان يفعّل حسابك تاني.', true, true); return; }
    if (!prof || !ROLES[prof.role]) { message('حسابك لسه مش متفعّل', 'كلّم المدير يضيفك في البرنامج وبعدين ادخل تاني.', true); return; }
    mounted = true;
    // مراقبة مستندي أنا: لو اتوقفت أو اتمسح مستندي أتقفل فوراً، ولو دوري اتغيّر أعمل reload علشان الصلاحيات الجديدة تتطبق
    onSnapshot(doc(db, 'users', user.uid), s => {
      const d = s.exists() ? s.data() : null;
      if (!d || d.active === false) { message('حسابك موقوف', 'كلّم المدير علشان يفعّل حسابك تاني.', true, true); return; }
      if (d.role !== prof.role) location.reload();
    }, () => { });
    setupPassword(user);
    let configured = false;
    try { configured = await loadSettings(db, CFG); }   // لو فشلت القراية نكمّل بالافتراضي (الكاش المحلي بيغطي الأوفلاين)
    catch (e) { flash('مقدرتش أقرا إعدادات الصيدلية — شغال بالافتراضي'); }
    document.title = CFG.name + ' — متابعة التوصيل'; $('#loginName').textContent = CFG.name; $('#appName').textContent = CFG.name;
    $('#appUser').textContent = (prof.name || '') + ' · ' + ROLES[prof.role];
    show('app');
    if (prof.role === 'admin') {   // الأدمن بس: شاشة الإعدادات
      const toSettings = on => { $('#settings').hidden = !on; $('#delRoot').hidden = on; $('#cfgHint').hidden = on || configured; scrollTo(0, 0); };
      $('#cfgBtn').hidden = false;
      $('#cfgBtn').onclick = () => { renderSettings($('#settings'), { db, CFG, uid: user.uid, firebaseConfig, onClose: () => toSettings(false) }); toSettings(true); };
      $('#cfgHintGo').onclick = () => $('#cfgBtn').click();
      $('#cfgHint').hidden = configured;
    }
    try {
      if (prof.role === 'driver') {   // شاشة المندوب: أوردراته بس + زرار تسليم بموقع
        if (!configured) { $('#delRoot').innerHTML = '<div class="banner bad">المدير لسه ماظبطش إعدادات الصيدلية — كلّمه وبعدين افتح البرنامج تاني.</div>'; return; }
        const { mountDriver } = await import('./driver.js'); await mountDriver($('#delRoot'), { db, CFG, uid: user.uid, driverName: prof.driverName });
      } else { const { mountDelivery } = await import('./core.js'); await mountDelivery($('#delRoot'), prof.role); }
    }
    catch (e) { $('#delRoot').innerHTML = '<div class="banner bad">مقدرتش أفتح شاشة التوصيل: ' + String(e.code || e.message).replace(/[<>&]/g, '') + '</div>'; }
  });
}
