// إعدادات الصيدلية — الأدمن بيعدّلها من جوه البرنامج (settings/app في Firestore) من غير ما حد يلمس كود.
// البيانات مسطّحة (zoneIn/zoneOut… مش مجموعات متداخلة) علشان قواعد Firestore تتحقق منها بسهولة.
// بعد الحفظ بنعمل reload: core.js بيقرا الإعدادات مرة واحدة وقت التحميل.
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { mountUsers } from "./users.js";

const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REF = db => doc(db, 'settings', 'app');

// بيدمج الإعدادات المحفوظة فوق الافتراضي (CFG). بيرجّع true لو الأدمن ظبّطها قبل كده.
export async function loadSettings(db, CFG) {
  const s = await getDoc(REF(db));
  if (!s.exists()) return false;
  const d = s.data();
  if (d.name) CFG.name = d.name;
  if (typeof d.receiptSub === 'string') CFG.receiptSub = d.receiptSub;
  if (d.zoneIn) CFG.zones.in = d.zoneIn;
  if (d.zoneOut) CFG.zones.out = d.zoneOut;
  CFG.zoneAliases = { in: d.aliasIn || [], out: d.aliasOut || [] };
  if (typeof d.commissionOut === 'number') CFG.commissionOut = d.commissionOut;
  if (typeof d.promiseMin === 'number') CFG.promiseMin = d.promiseMin;
  if (typeof d.dayStartHour === 'number') CFG.dayStartHour = d.dayStartHour;
  if (Array.isArray(d.employees) && d.employees.length) CFG.employees = d.employees;
  return true;
}

const hourLbl = h => (h % 12 || 12) + (h < 12 ? ' ص' : ' م') + (h === 0 ? ' (منتصف الليل)' : '');

export function renderSettings(root, { db, CFG, uid, onClose, firebaseConfig }) {
  root.innerHTML = `
  <div class="cfgwrap">
    <div class="cfgtop"><h2>⚙ إعدادات الصيدلية</h2><button type="button" class="ghost sm" data-close>رجوع للتوصيل</button></div>

    <section class="cfgsec"><h3>بيانات الصيدلية</h3>
      <label for="cName">اسم الصيدلية (بيظهر في الهيدر والإيصال)</label><input id="cName" maxlength="80" value="${esc(CFG.name)}">
      <label for="cSub">سطر تحت الاسم في الإيصال (مثلاً رقم التليفون)</label><input id="cSub" maxlength="120" value="${esc(CFG.receiptSub)}"></section>

    <section class="cfgsec"><h3>المناطق والعمولة</h3>
      <div class="g2"><div><label for="cZin">اسم المنطقة الأولى (من غير عمولة)</label><input id="cZin" maxlength="40" value="${esc(CFG.zones.in)}"></div>
        <div><label for="cZout">اسم المنطقة التانية (عليها عمولة)</label><input id="cZout" maxlength="40" value="${esc(CFG.zones.out)}"></div></div>
      <label for="cComm">عمولة المندوب على كل أوردر في المنطقة التانية (جنيه)</label><input id="cComm" type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${CFG.commissionOut}">
      <p class="hint">تغيير الاسم آمن: الأوردرات القديمة بتفضل متصنّفة صح. تغيير العمولة بيسري على الأوردرات الجاية بس.</p></section>

    <section class="cfgsec"><h3>التوصيل</h3>
      <div class="g2"><div><label for="cProm">وعد التوصيل (بالدقايق)</label><input id="cProm" type="number" inputmode="numeric" min="5" max="240" step="1" value="${CFG.promiseMin}"></div>
        <div><label for="cDay">اليوم التشغيلي بيبدأ الساعة</label><select id="cDay">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === CFG.dayStartHour ? 'selected' : ''}>${hourLbl(h)}</option>`).join('')}</select></div></div>
      <p class="hint">تنبيه: تغيير وعد التوصيل أو بداية اليوم بيغيّر طريقة حساب الإحصائيات القديمة كمان (التأخير وتقسيم الأيام)، مش الجاية بس.</p></section>

    <section class="cfgsec"><h3>الموظفين</h3>
      <label for="cEmp">أسماء الموظفين اللي بيسجّلوا الأوردرات (اسم في كل سطر)</label>
      <textarea id="cEmp" rows="6" placeholder="كاشير 1&#10;كاشير 2">${esc((CFG.employees || []).join('\n'))}</textarea>
      <p class="hint">دي القايمة اللي بتظهر في «الموظف المسئول». المناديب بتتضاف وتتشال من شاشة التوصيل نفسها.</p></section>

    <div class="err" id="cErr" role="alert"></div>
    <div class="cfgbtns"><button type="button" class="go" id="cSave">حفظ الإعدادات</button><button type="button" class="ghost" data-close>إلغاء</button></div>

    <section class="cfgsec" id="usersSec" style="margin-top:22px"></section>
  </div>`;
  mountUsers(root.querySelector('#usersSec'), { db, firebaseConfig, CFG, me: uid });

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = onClose);
  root.querySelector('#cSave').onclick = async () => {
    const g = id => root.querySelector('#' + id), err = g('cErr'); err.textContent = '';
    const name = g('cName').value.trim(), sub = g('cSub').value.trim(), zin = g('cZin').value.trim(), zout = g('cZout').value.trim();
    const comm = parseFloat(g('cComm').value), prom = parseInt(g('cProm').value, 10), day = parseInt(g('cDay').value, 10);
    const emps = [...new Set(g('cEmp').value.split('\n').map(x => x.trim()).filter(Boolean))];
    const bad = (!name && 'اكتب اسم الصيدلية') || (!zin && 'اكتب اسم المنطقة الأولى') || (!zout && 'اكتب اسم المنطقة التانية')
      || (zin === zout && 'اسمين المناطق لازم يختلفوا') || (!(comm >= 0 && comm <= 500) && 'العمولة بين 0 و 500')
      || (!(prom >= 5 && prom <= 240) && 'وعد التوصيل بين 5 و 240 دقيقة') || (!(day >= 0 && day <= 23) && 'ساعة بداية اليوم مش صح')
      || (!emps.length && 'ضيف موظف واحد على الأقل') || (emps.length > 50 && 'أقصى عدد موظفين 50') || (emps.some(e => e.length > 40) && 'اسم الموظف أطول من 40 حرف');
    if (bad) { err.textContent = bad; return; }
    // الأسماء القديمة للمناطق بتتحفظ كـ aliases علشان الأوردرات القديمة تتحسب صح
    const keep = (list, oldName, newName) => [...new Set([...(list || []), oldName])].filter(x => x !== newName).slice(-10);
    const aliasIn = zin !== CFG.zones.in ? keep(CFG.zoneAliases.in, CFG.zones.in, zin) : (CFG.zoneAliases.in || []).filter(x => x !== zin);
    const aliasOut = zout !== CFG.zones.out ? keep(CFG.zoneAliases.out, CFG.zones.out, zout) : (CFG.zoneAliases.out || []).filter(x => x !== zout);
    if (aliasIn.includes(zout) || aliasOut.includes(zin)) { err.textContent = 'الاسم ده كان مستخدم قبل كده لمنطقة تانية — اختار اسم مختلف'; return; }
    if (!navigator.onLine) { err.textContent = 'مفيش اتصال بالإنترنت — مينفعش تحفظ دلوقتي.'; return; }
    const btn = g('cSave'); btn.disabled = true;
    try {
      await setDoc(REF(db), { name, receiptSub: sub, zoneIn: zin, zoneOut: zout, aliasIn, aliasOut, commissionOut: comm, promiseMin: prom, dayStartHour: day, employees: emps, updatedAt: serverTimestamp(), updatedBy: uid });
      btn.textContent = 'اتحفظ ✔ — جاري التطبيق…'; setTimeout(() => location.reload(), 600);
    } catch (e) { btn.disabled = false; err.textContent = 'مقدرتش أحفظ: ' + (e.code || e.message); }
  };
}
