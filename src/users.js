// إدارة المستخدمين (للأدمن بس): إضافة · تعديل الاسم والدور · إيقاف/تفعيل. مفيش حذف (الإيقاف بدل الحذف) ومفيش تغيير كلمة سر لحد تاني من هنا.
// الإنشاء بيتم من نسخة Firebase تانية جوه الصفحة (secondary) علشان الأدمن يفضل مسجّل دخول بحسابه. التسجيل لازم يكون مفتوح في Firebase.
// حساب من غير مستند users/{uid} مالوش أي صلاحية — فالتسجيل المفتوح مش بيدّي حد حاجة.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLES = { admin: 'مدير', cashier: 'كاشير', viewer: 'مطّلع (صاحب الصيدلية)', driver: 'مندوب (تطبيق التوصيل)' };
const ORDER = { admin: 0, cashier: 1, viewer: 2, driver: 3 };
const USER_RE = /^[a-z0-9._-]{3,30}$/;
const MIN_PW = 8;

let SEC = null;   // نسخة Firebase التانية (بتتعمل مرة واحدة)
const secondaryAuth = cfg => { if (!SEC) SEC = initializeApp(cfg, 'secondary'); return getAuth(SEC); };

const MSG = {
  'auth/admin-restricted-operation': 'التسجيل مقفول في Firebase. فعّله مؤقتاً: Authentication ← Settings ← User actions ← Enable create (sign-up) وجرّب تاني.',
  'auth/operation-not-allowed': 'التسجيل بالإيميل والباسورد مش مفعّل في Firebase (Authentication ← Sign-in method).',
  'auth/weak-password': 'كلمة السر ضعيفة — اكتب كلمة أطول وأصعب.',
  'auth/invalid-email': 'اسم الدخول مش مكتوب صح.',
  'auth/network-request-failed': 'مفيش اتصال بالإنترنت.',
  'auth/too-many-requests': 'محاولات كتير — استنى شوية وجرّب تاني.',
  'permission-denied': 'القواعد مش بتسمح (غالباً القواعد الجديدة لسه ماتنشرتش في Firebase Console).',
};
const explain = e => MSG[e.code] || ('حصلت مشكلة: ' + (e.code || e.message));

export function mountUsers(el, { db, firebaseConfig, CFG, me }) {
  let LIST = [], DRIVERS = [], BUSY = false, EDIT = '', NOTE = '', OK = false;   // NOTE = رسالة فوق القايمة (OK = نجاح بالأخضر، غير كده خطأ بالأحمر)
  const domain = CFG.loginDomain;

  async function load() {
    try {
      try { DRIVERS = (await getDocs(collection(db, 'deliv_drivers'))).docs.map(d => d.data().name).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'ar')); } catch (e) { DRIVERS = []; }
      const s = await getDocs(collection(db, 'users'));
      LIST = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (ORDER[a.role] ?? 9) - (ORDER[b.role] ?? 9) || String(a.name).localeCompare(String(b.name), 'ar'));
    } catch (e) { LIST = []; NOTE = 'مقدرتش أقرا المستخدمين: ' + explain(e); OK = false; }
    draw();
  }

  function draw() {
    const active = LIST.filter(u => u.active !== false).length;
    el.innerHTML = `<h3>المستخدمين <span class="cnt">${LIST.length ? `${active} شغّال من ${LIST.length}` : ''}</span></h3>
      ${NOTE ? `<p class="${OK ? 'okmsg' : 'err'}" role="status">${esc(NOTE)}</p>` : ''}
      <div class="ulist">${LIST.map(u => row(u)).join('') || '<p class="hint">مفيش مستخدمين لسه.</p>'}</div>
      <details class="uadd" ${LIST.length < 2 ? 'open' : ''}><summary>➕ إضافة مستخدم</summary>
        <label for="uName">الاسم (بيظهر في البرنامج)</label><input id="uName" maxlength="40" autocomplete="off">
        <label for="uUser">اسم الدخول (إنجليزي صغير وأرقام، من 3 لـ 30 حرف)</label><input id="uUser" maxlength="30" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="مثلاً: cashier2">
        <label for="uPw">كلمة السر (${MIN_PW} حروف على الأقل)</label><input id="uPw" type="password" dir="ltr" autocomplete="new-password">
        <label for="uRole">الدور</label><select id="uRole"><option value="cashier">${ROLES.cashier}</option><option value="viewer">${ROLES.viewer}</option><option value="admin">${ROLES.admin}</option><option value="driver">${ROLES.driver}</option></select>
        <div id="uDrvBox" hidden><label for="uDrv">اسم المندوب (من قايمة المناديب — لازم يكون هو نفس الاسم اللي الكاشير بيختاره)</label>${drvSelect('id="uDrv"', '')}</div>
        <p class="hint">كلمة السر مش هتظهر تاني بعد الإضافة، فسلّمها للموظف بنفسك. هو يقدر يغيّرها من 🔑 بعد ما يدخل. لو نسيها: امسح حسابه من Firebase Console (Authentication ← Users) واعمله من هنا تاني بنفس الاسم.</p>
        <div class="err" id="uErr" role="alert"></div>
        <button type="button" class="go" id="uAdd">إضافة</button></details>`;
    el.querySelector('#uAdd').onclick = add;
    const roleSel = el.querySelector('#uRole'); roleSel.onchange = () => { el.querySelector('#uDrvBox').hidden = roleSel.value !== 'driver'; };
    el.querySelectorAll('[data-uedit]').forEach(b => b.onclick = () => { EDIT = EDIT === b.dataset.uedit ? '' : b.dataset.uedit; draw(); });
    el.querySelectorAll('[data-utoggle]').forEach(b => b.onclick = () => toggle(b.dataset.utoggle));
    el.querySelectorAll('[data-usave]').forEach(b => b.onclick = () => saveEdit(b.dataset.usave));
    el.querySelectorAll('.uedit [data-er]').forEach(r => r.onchange = () => { r.closest('.uedit').querySelector('[data-edrvbox]').hidden = r.value !== 'driver'; });
  }

  function row(u) {
    const self = u.id === me, off = u.active === false;
    return `<div class="urow ${off ? 'off' : ''}"><div class="uinfo"><b>${esc(u.name || '—')}</b>${self ? ' <span class="pill">إنت</span>' : ''}
        <small dir="ltr">${esc(u.username || '(اتعمل من Console)')}${u.role === 'driver' ? ` · 🛵 ${esc(u.driverName || '')}` : ''}</small></div>
      <span class="pill ${off ? 'red' : ''}">${off ? 'موقوف' : esc(ROLES[u.role] || u.role)}</span>
      ${self ? '' : `<div class="uact"><button type="button" class="ghost sm" data-uedit="${esc(u.id)}">✏️ تعديل</button>
        <button type="button" class="ghost sm" data-utoggle="${esc(u.id)}">${off ? '▶ تفعيل' : '⏸ إيقاف'}</button></div>`}
      ${EDIT === u.id ? `<div class="uedit"><label>الاسم</label><input data-en maxlength="40" value="${esc(u.name)}">
        <label>الدور</label><select data-er>${Object.keys(ROLES).map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select>
        <div data-edrvbox ${u.role === 'driver' ? '' : 'hidden'}><label>اسم المندوب</label>${drvSelect('data-edrv', u.driverName || '')}</div>
        <div class="err" data-eerr></div><button type="button" class="go" data-usave="${esc(u.id)}">حفظ التعديل</button></div>` : ''}</div>`;
  }

  const drvSelect = (id, cur) => `<select ${id}>${DRIVERS.length ? '' : '<option value="">مفيش مناديب — ضيف مندوب من شاشة التوصيل الأول</option>'}${DRIVERS.map(n => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const guard = () => { if (!navigator.onLine) { NOTE = 'مفيش اتصال بالإنترنت — مينفعش تعدّل المستخدمين دلوقتي.'; OK = false; draw(); return false; } NOTE = ''; OK = false; return !BUSY; };

  async function toggle(id) {
    const u = LIST.find(x => x.id === id); if (!u || id === me || !guard()) return;
    const off = u.active === false;
    if (!off && !confirm(`توقف «${u.name}»؟ هيتقفل عليه فوراً ومش هيقدر يدخل لحد ما تفعّله تاني. بياناته وأوردراته القديمة مش بتتمسح.`)) return;
    if (off && u.role === 'admin' && !confirm(`«${u.name}» مدير — لما تفعّله هيرجع بكل الصلاحيات. متأكد؟`)) return;
    BUSY = true;
    try { await updateDoc(doc(db, 'users', id), { role: u.role, name: u.name || u.username || 'مستخدم', active: off, ...(u.role === 'driver' ? { driverName: u.driverName } : {}) }); NOTE = `✔ ${off ? 'اتفعّل' : 'اتوقّف'} «${u.name || u.username}»`; OK = true; }
    catch (e) { NOTE = 'مقدرتش أغيّر الحالة: ' + explain(e); OK = false; }
    BUSY = false; await load();
  }

  async function saveEdit(id) {
    const u = LIST.find(x => x.id === id); if (!u || id === me || !guard()) return;
    const box = el.querySelector(`[data-usave="${CSS.escape(id)}"]`).closest('.uedit'), err = box.querySelector('[data-eerr]');
    const name = box.querySelector('[data-en]').value.trim(), role = box.querySelector('[data-er]').value, drv = box.querySelector('[data-edrv]').value;
    if (!name || name.length > 40) { err.textContent = 'اكتب اسم (لحد 40 حرف)'; return; }
    if (role === 'driver' && !drv) { err.textContent = 'اختار اسم المندوب'; return; }
    if (role === 'driver' && LIST.some(x => x.id !== id && x.role === 'driver' && x.active !== false && x.driverName === drv) && !confirm(`فيه حساب مندوب شغّال تاني بنفس الاسم «${drv}». متأكد؟`)) return;
    if (role === 'admin' && u.role !== 'admin' && !confirm(`هتدّي «${name}» صلاحيات مدير كاملة (إعدادات ومستخدمين وكل حاجة). متأكد؟`)) return;
    BUSY = true;
    try { await updateDoc(doc(db, 'users', id), { role, name, active: u.active !== false, driverName: role === 'driver' ? drv : deleteField() }); EDIT = ''; NOTE = `✔ اتحفظ تعديل «${name}»`; OK = true; }
    catch (e) { err.textContent = 'مقدرتش أحفظ: ' + explain(e); BUSY = false; return; }
    BUSY = false; await load();
  }

  async function add() {
    const g = id => el.querySelector('#' + id), err = g('uErr'); err.textContent = '';
    if (!guard()) return;
    const name = g('uName').value.trim(), user = g('uUser').value.trim().toLowerCase(), pw = g('uPw').value, role = g('uRole').value, drv = role === 'driver' ? g('uDrv').value : '';
    const bad = (!name && 'اكتب اسم المستخدم') || (name.length > 40 && 'الاسم أطول من 40 حرف') || (!USER_RE.test(user) && 'اسم الدخول: حروف إنجليزي صغيرة وأرقام و . _ - بس، من 3 لـ 30 حرف')
      || (pw.length < MIN_PW && `كلمة السر لازم ${MIN_PW} حروف على الأقل`) || (pw.toLowerCase() === user && 'كلمة السر ماتبقاش نفس اسم الدخول') || (role === 'driver' && !drv && 'اختار اسم المندوب (لو القايمة فاضية ضيف المندوب من شاشة التوصيل الأول)');
    if (bad) { err.textContent = bad; return; }
    if (role === 'driver' && LIST.some(x => x.role === 'driver' && x.active !== false && x.driverName === drv) && !confirm(`فيه حساب مندوب شغّال بنفس الاسم «${drv}». متأكد إنك عايز حساب تاني؟`)) return;
    if (role === 'admin' && !confirm('هتضيف مدير بصلاحيات كاملة (إعدادات ومستخدمين وكل حاجة). متأكد؟')) return;
    BUSY = true; g('uAdd').disabled = true; g('uAdd').textContent = 'جاري الإضافة…';
    const email = `${user}@${domain}`, sec = secondaryAuth(firebaseConfig);
    let uid = '', completing = false;
    try {
      try { uid = (await createUserWithEmailAndPassword(sec, email, pw)).user.uid; }
      catch (e) {
        if (e.code !== 'auth/email-already-in-use') throw e;
        // الاسم موجود في Firebase: يا حساب يتيم من محاولة ناقصة (نكمّله لو كلمة السر مطابقة) يا حساب مستخدم فعلاً
        let cred; try { cred = await signInWithEmailAndPassword(sec, email, pw); } catch (e2) { throw Object.assign(new Error('taken'), { code: 'app/taken' }); }
        uid = cred.user.uid; completing = true;
      }
      let exists = false; try { exists = (await getDoc(doc(db, 'users', uid))).exists(); } catch (e) { }
      if (exists) throw Object.assign(new Error('exists'), { code: 'app/exists' });
      try { await setDoc(doc(db, 'users', uid), { role, name, username: user, active: true, createdAt: serverTimestamp(), createdBy: me, ...(role === 'driver' ? { driverName: drv } : {}) }); }
      catch (e) { throw Object.assign(new Error('half'), { code: 'app/half', inner: e }); }
      NOTE = `✔ اتضاف «${name}» — اسم الدخول: ${user}${completing ? ' (اتكمّل حساب كان ناقص)' : ''}. سلّم كلمة السر للموظف.`; OK = true;
    } catch (e) {
      BUSY = false;
      err.textContent = e.code === 'app/exists' ? 'الاسم ده مستخدم بالفعل.'
        : e.code === 'app/taken' ? 'اسم الدخول ده موجود في Firebase. لو كان حساب ناقص من محاولة فاشلة اكتب نفس كلمة السر بتاعته، وإلا اختار اسم تاني أو امسحه من Firebase Console.'
        : e.code === 'app/half' ? 'الحساب اتعمل بس الصلاحيات ماتسجلتش (' + explain(e.inner) + '). دوس «إضافة» تاني بنفس البيانات علشان نكمّله.'
        : explain(e);
      g('uAdd').disabled = false; g('uAdd').textContent = 'إضافة';
      try { await signOut(sec); } catch (x) { }
      return;
    }
    try { await signOut(sec); } catch (x) { }
    BUSY = false; await load();
  }

  load();
}
