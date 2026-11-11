// الدخول وقاعدة البيانات — مكان واحد بس. لسه مفيش مشروع Firebase (الخطوة 3): الدوال دي بترمي رسالة واضحة بدل ما تفشل في صمت.
// لما نربط مشروع الصيدلية هنا: initializeApp(firebaseConfig) + getFirestore + getAuth.
let _db = null, _auth = null;
export function setBackend(db, auth) { _db = db; _auth = auth; }
export function getDb() { if (!_db) throw new Error('Firebase مش متوصل لسه — الخطوة 3'); return _db; }
export function getUid() { return _auth && _auth.currentUser ? _auth.currentUser.uid : ''; }
