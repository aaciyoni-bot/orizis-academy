/* ================================================================
   ORIZIS ACADEMY — application engine
   LMS + auth + Mobile Money enrolment + exam + certificate (PDF/QR)
   Works with Firebase (Auth+Firestore) when configured in config.js,
   otherwise runs in DEMO mode on localStorage.
   ================================================================ */
(function () {
'use strict';

const CONFIG = window.OA_CONFIG || {};
const COURSES = Array.isArray(window.COURSES) ? window.COURSES : [];
const $ = id => document.getElementById(id);

/* ---------- Firebase (optional) ---------- */
const firebaseReady = !!(CONFIG.firebase && CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
let auth = null, db = null;
if (firebaseReady) {
    try {
        firebase.initializeApp(CONFIG.firebase);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (e) { console.warn('Firebase init failed, falling back to demo mode:', e); }
}
const MODE = (firebaseReady && auth && db) ? 'firebase' : 'local';

/* ---------- Fields (categories) metadata ---------- */
const FIELDS = {
    business:    { label: 'Business & Entrepreneurship', icon: 'fa-briefcase',            grad: 'from-ink-500 to-violet-700' },
    web:         { label: 'Web & Building',              icon: 'fa-code',                 grad: 'from-blue-500 to-ink-700' },
    marketing:   { label: 'Digital Marketing',          icon: 'fa-bullhorn',             grad: 'from-fuchsia-500 to-purple-700' },
    money:       { label: 'Earn Online',                icon: 'fa-money-bill-trend-up',  grad: 'from-emerald-500 to-teal-700' },
    commerce:    { label: 'Commerce & Mobile Money',    icon: 'fa-store',                grad: 'from-amber-500 to-orange-600' },
    computer:    { label: 'Computer & Digital',         icon: 'fa-laptop',               grad: 'from-sky-500 to-blue-700' },
    english:     { label: 'English',                    icon: 'fa-language',             grad: 'from-rose-500 to-pink-700' },
    service:     { label: 'Customer Service',           icon: 'fa-headset',              grad: 'from-cyan-500 to-sky-700' },
    career:      { label: 'CV & Career',                icon: 'fa-file-lines',           grad: 'from-slate-500 to-ink-700' },
    finance:     { label: 'Finance',                    icon: 'fa-calculator',           grad: 'from-green-500 to-emerald-700' },
    agriculture: { label: 'Agriculture',               icon: 'fa-seedling',             grad: 'from-lime-500 to-green-700' },
    tailoring:   { label: 'Tailoring & Fashion',        icon: 'fa-scissors',             grad: 'from-pink-500 to-rose-700' },
    beauty:      { label: 'Beauty',                     icon: 'fa-wand-magic-sparkles',  grad: 'from-purple-500 to-fuchsia-700' },
    _default:    { label: 'Course',                     icon: 'fa-book',                 grad: 'from-ink-500 to-ink-700' }
};
const fieldOf = c => FIELDS[c && c.field] || FIELDS._default;

/* ---------- State ---------- */
let currentUser = null;          // { uid, name, email }
let enrolledMap = {};            // courseId -> enrollment (cache for the signed-in user)
let selectedProvider = null;
let payCourse = null;
let pendingEnrollCourse = null;
let learnCourse = null, learnKey = null;
let authMode = 'login';
let payMethod = 'momo';           // 'momo' | 'vp'

/* ---------- Helpers ---------- */
const fmtK = n => 'K' + Number(n || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const courseById = id => COURSES.find(c => c.id === id);
const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2800);
}

// Flatten a course into an ordered list of lessons with stable keys
function flatLessons(course) {
    const out = [];
    (course.modules || []).forEach((m, mi) => (m.lessons || []).forEach((l, li) => {
        out.push({ key: mi + '.' + li, moduleTitle: m.title, mi, li, title: l.title, minutes: l.minutes || 0, content: l.content || '' });
    }));
    return out;
}
const totalLessons = course => flatLessons(course).length;

// Minimal, safe formatter for lesson text: escapes HTML then renders
// ## headings, "- " bullets, and paragraphs.
// Inline formatting: escape, then **bold** and `code`.
function inlineFmt(text) {
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, '<code class="inl">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
}

// Rich lesson renderer. Supports (safe, escaped):
//   ## / ### headings · - or * bullets · 1. numbered steps · > callout
//   ```label ... ``` code blocks (prompts/commands) · ![alt](src) images
//   [[SHOT: description]] screenshot placeholder slots
function renderLessonBody(text) {
    const lines = String(text || '').split('\n');
    let html = '', listType = null, inQuote = false, quoteBuf = [];
    let inCode = false, codeLabel = '', codeBuf = [];
    const closeList = () => { if (listType) { html += '</' + listType + '>'; listType = null; } };
    const closeQuote = () => { if (inQuote) { html += '<blockquote class="callout"><i class="fas fa-lightbulb"></i><div>' + quoteBuf.join('<br>') + '</div></blockquote>'; inQuote = false; quoteBuf = []; } };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], line = raw.trim();

        if (line.startsWith('```')) {
            if (!inCode) { closeList(); closeQuote(); inCode = true; codeLabel = line.slice(3).trim(); codeBuf = []; }
            else {
                const lbl = codeLabel ? '<div class="code-label"><i class="fas fa-' + (/prompt/i.test(codeLabel) ? 'comment-dots' : 'terminal') + '"></i> ' + esc(codeLabel) + '</div>' : '';
                html += '<div class="code-wrap">' + lbl + '<pre class="code"><code>' + esc(codeBuf.join('\n')) + '</code></pre></div>';
                inCode = false; codeLabel = '';
            }
            continue;
        }
        if (inCode) { codeBuf.push(raw); continue; }

        if (!line) { closeList(); closeQuote(); continue; }

        const shot = line.match(/^\[\[SHOT:\s*(.+?)\]\]$/i);
        if (shot) { closeList(); closeQuote(); html += '<figure class="shot"><i class="fas fa-image"></i><span>Screenshot: ' + esc(shot[1]) + '</span></figure>'; continue; }

        const img = line.match(/^!\[(.*?)\]\((.+?)\)$/);
        if (img) { closeList(); closeQuote(); html += '<figure class="lz-img"><img src="' + esc(img[2]) + '" alt="' + esc(img[1]) + '" loading="lazy">' + (img[1] ? '<figcaption>' + esc(img[1]) + '</figcaption>' : '') + '</figure>'; continue; }

        if (line.startsWith('### ')) { closeList(); closeQuote(); html += '<h3>' + inlineFmt(line.slice(4)) + '</h3>'; continue; }
        if (line.startsWith('## ')) { closeList(); closeQuote(); html += '<h2>' + inlineFmt(line.slice(3)) + '</h2>'; continue; }

        if (line.startsWith('> ')) { closeList(); inQuote = true; quoteBuf.push(inlineFmt(line.slice(2))); continue; }
        closeQuote();

        const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
        if (ol) { if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; } html += '<li>' + inlineFmt(ol[2]) + '</li>'; continue; }
        if (line.startsWith('- ') || line.startsWith('* ')) { if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; } html += '<li>' + inlineFmt(line.slice(2)) + '</li>'; continue; }

        closeList();
        html += '<p>' + inlineFmt(line) + '</p>';
    }
    closeList(); closeQuote();
    if (inCode) html += '<div class="code-wrap"><pre class="code"><code>' + esc(codeBuf.join('\n')) + '</code></pre></div>';
    return html;
}

/* ================================================================
   DATA STORE — Firestore or localStorage
   ================================================================ */
const enrollDocId = (uid, courseId) => uid + '_' + courseId;

const Store = {
    async createEnrollment(course, payRef) {
        const uid = currentUser.uid;
        const data = {
            userId: uid, courseId: course.id, courseTitle: course.title,
            level: course.level || '', priceZmw: course.priceZmw || 0,
            paidRef: payRef || '', completedLessons: [], status: 'active',
            createdAt: new Date().toISOString()
        };
        if (MODE === 'firebase') {
            await db.collection('enrollments').doc(enrollDocId(uid, course.id)).set(data, { merge: true });
        } else {
            localStorage.setItem('oa_enroll_' + uid + '_' + course.id, JSON.stringify(data));
        }
        enrolledMap[course.id] = data;
        return data;
    },
    async getEnrollment(courseId) {
        if (!currentUser) return null;
        if (enrolledMap[courseId]) return enrolledMap[courseId];
        const uid = currentUser.uid;
        if (MODE === 'firebase') {
            const snap = await db.collection('enrollments').doc(enrollDocId(uid, courseId)).get();
            const data = snap.exists ? snap.data() : null;
            if (data) enrolledMap[courseId] = data;
            return data;
        }
        const raw = localStorage.getItem('oa_enroll_' + uid + '_' + courseId);
        const data = raw ? JSON.parse(raw) : null;
        if (data) enrolledMap[courseId] = data;
        return data;
    },
    async setLessonComplete(courseId, key) {
        const e = await this.getEnrollment(courseId);
        if (!e) return null;
        if (!e.completedLessons.includes(key)) e.completedLessons.push(key);
        const uid = currentUser.uid;
        if (MODE === 'firebase') {
            await db.collection('enrollments').doc(enrollDocId(uid, courseId)).update({ completedLessons: e.completedLessons });
        } else {
            localStorage.setItem('oa_enroll_' + uid + '_' + courseId, JSON.stringify(e));
        }
        enrolledMap[courseId] = e;
        return e;
    },
    async completeCourse(courseId, scorePercent, certId, extra) {
        const e = await this.getEnrollment(courseId);
        if (!e) return null;
        e.status = 'completed'; e.scorePercent = scorePercent; e.certId = certId;
        const fields = { status: 'completed', scorePercent, certId };
        if (extra && extra.submissionUrl) { e.submissionUrl = extra.submissionUrl; fields.submissionUrl = extra.submissionUrl; }
        if (extra && extra.reflections) { e.reflections = extra.reflections; fields.reflections = extra.reflections; }
        const uid = currentUser.uid;
        if (MODE === 'firebase') {
            await db.collection('enrollments').doc(enrollDocId(uid, courseId)).update(fields);
        } else {
            localStorage.setItem('oa_enroll_' + uid + '_' + courseId, JSON.stringify(e));
        }
        enrolledMap[courseId] = e;
        return e;
    },
    async listEnrollments() {
        if (!currentUser) return [];
        const uid = currentUser.uid;
        if (MODE === 'firebase') {
            const q = await db.collection('enrollments').where('userId', '==', uid).get();
            return q.docs.map(d => d.data());
        }
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('oa_enroll_' + uid + '_')) out.push(JSON.parse(localStorage.getItem(k)));
        }
        return out;
    },
    async createCertificate(cert) {
        if (MODE === 'firebase') {
            await db.collection('certificates').doc(cert.certId).set(cert);
        } else {
            localStorage.setItem('oa_cert_' + cert.certId, JSON.stringify(cert));
        }
        return cert;
    }
};

/* ================================================================
   VIEW SWITCHING
   ================================================================ */
const VIEWS = ['catalogView', 'courseView', 'learnView', 'quizView', 'certView', 'myLearningView'];
const HOME_SECTIONS = ['heroSection', 'how-it-works', 'builder', 'about', 'faq', 'support'];
function showView(view) {
    VIEWS.forEach(v => $(v).classList.toggle('hidden', v !== view));
    const home = view === 'catalogView';
    HOME_SECTIONS.forEach(s => { const el = $(s); if (el) el.classList.toggle('hidden', !home); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================================
   CATALOG
   ================================================================ */
let activeField = 'all';
let searchTerm = '';

function buildCatNav() {
    const present = [...new Set(COURSES.map(c => c.field))];
    const nav = $('catNav');
    let html = `<button class="cat-chip ${activeField === 'all' ? 'active' : ''}" onclick="OA.filterField('all')"><i class="fas fa-layer-group"></i> All courses</button>`;
    present.forEach(f => {
        const meta = FIELDS[f] || FIELDS._default;
        html += `<button class="cat-chip ${activeField === f ? 'active' : ''}" onclick="OA.filterField('${f}')"><i class="fas ${meta.icon}"></i> ${esc(meta.label)}</button>`;
    });
    nav.innerHTML = html;
}

function courseCard(c) {
    const f = fieldOf(c);
    const e = enrolledMap[c.id];
    const badge = e ? (e.status === 'completed'
        ? `<span class="absolute top-2 right-2 bg-zam-green text-white text-[10px] font-bold px-2 py-0.5 rounded-full"><i class="fas fa-award"></i> Completed</span>`
        : `<span class="absolute top-2 right-2 bg-white/90 text-ink-700 text-[10px] font-bold px-2 py-0.5 rounded-full"><i class="fas fa-play"></i> Enrolled</span>`)
        : `<span class="absolute top-2 right-2 bg-white/90 text-ink-700 text-[10px] font-bold px-2 py-0.5 rounded-full"><i class="fas fa-clock"></i> ~${c.hours || 1}h</span>`;
    return `
    <div class="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition cursor-pointer group fade-in" onclick="OA.openCourse('${c.id}')">
        <div class="h-32 bg-gradient-to-br ${f.grad} relative flex items-center justify-center">
            <i class="fas ${f.icon} text-white/90 text-5xl"></i>
            <span class="absolute top-2 left-2 bg-black/25 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">${esc(c.level || 'Course')}</span>
            ${badge}
        </div>
        <div class="p-4">
            <div class="text-[11px] font-bold text-ink-500 uppercase tracking-wide">${esc(f.label)}</div>
            <h4 class="font-bold mt-1 leading-snug line-clamp-2 h-11">${esc(c.title)}</h4>
            <p class="text-xs text-slate-500 mt-1 line-clamp-2 h-8">${esc(c.summary || '')}</p>
            <div class="mt-3 flex items-center justify-between">
                <span class="font-extrabold text-ink-700 text-lg">${fmtK(c.priceZmw)}</span>
                <span class="text-ink-600 text-sm font-bold group-hover:underline">View <i class="fas fa-arrow-right text-xs"></i></span>
            </div>
        </div>
    </div>`;
}

function renderCatalog() {
    buildCatNav();
    let list = COURSES.slice();
    if (activeField !== 'all') list = list.filter(c => c.field === activeField);
    if (searchTerm) {
        const t = searchTerm.toLowerCase();
        list = list.filter(c =>
            (c.title || '').toLowerCase().includes(t) ||
            (c.summary || '').toLowerCase().includes(t) ||
            (fieldOf(c).label || '').toLowerCase().includes(t));
    }
    $('resultsTitle').textContent = activeField === 'all' && !searchTerm ? 'All courses'
        : (searchTerm ? `Results for "${searchTerm}"` : fieldOf({ field: activeField }).label);
    $('resultsCount').textContent = list.length + (list.length === 1 ? ' course' : ' courses');
    $('courseGrid').innerHTML = list.map(courseCard).join('');
    $('emptyState').classList.toggle('hidden', list.length > 0);
}

/* ================================================================
   COURSE DETAIL
   ================================================================ */
async function openCourse(id) {
    const c = courseById(id);
    if (!c) return;
    const f = fieldOf(c);
    const e = currentUser ? await Store.getEnrollment(id) : null;
    const lessons = flatLessons(c);
    const done = e ? e.completedLessons.length : 0;

    let cta;
    if (!e) {
        cta = `<button onclick="OA.enroll('${c.id}')" class="w-full sm:w-auto bg-zam-green hover:bg-green-800 text-white font-bold px-8 py-3.5 rounded-xl transition"><i class="fas fa-mobile-screen mr-2"></i>Enrol — ${fmtK(c.priceZmw)}</button>`;
    } else if (e.status === 'completed') {
        cta = `<div class="flex flex-wrap gap-3">
            <button onclick="OA.viewCertificateById('${e.certId}','${c.id}')" class="bg-gold text-ink-900 font-extrabold px-6 py-3.5 rounded-xl hover:brightness-105 transition"><i class="fas fa-award mr-2"></i>View certificate</button>
            <button onclick="OA.openLearn('${c.id}')" class="bg-ink-100 text-ink-700 font-bold px-6 py-3.5 rounded-xl hover:bg-ink-200 transition"><i class="fas fa-rotate-right mr-2"></i>Review lessons</button>
        </div>`;
    } else {
        cta = `<button onclick="OA.openLearn('${c.id}')" class="w-full sm:w-auto bg-ink-600 hover:bg-ink-700 text-white font-bold px-8 py-3.5 rounded-xl transition"><i class="fas fa-play mr-2"></i>Continue learning (${done}/${lessons.length})</button>`;
    }

    const modulesHtml = (c.modules || []).map(m => `
        <div class="bg-white rounded-xl border border-ink-100 overflow-hidden">
            <div class="px-4 py-3 bg-ink-50 font-bold text-ink-800 text-sm">${esc(m.title)}</div>
            <ul class="divide-y divide-slate-100">
                ${(m.lessons || []).map(l => `<li class="px-4 py-2.5 text-sm text-slate-600 flex items-center gap-2"><i class="fas fa-circle-play text-ink-400"></i> ${esc(l.title)} <span class="ml-auto text-xs text-slate-400">${l.minutes || 0} min</span></li>`).join('')}
            </ul>
        </div>`).join('');

    $('courseView').innerHTML = `
        <button onclick="OA.goHome()" class="text-sm font-bold text-ink-600 hover:underline mb-4"><i class="fas fa-arrow-left mr-1"></i>All courses</button>
        <div class="grid lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2">
                <div class="h-44 rounded-2xl bg-gradient-to-br ${f.grad} flex items-center justify-center relative overflow-hidden">
                    <i class="fas ${f.icon} text-white/90 text-7xl"></i>
                    <span class="absolute top-3 left-3 bg-black/25 text-white text-xs font-bold px-3 py-1 rounded-full">${esc(c.level || 'Course')}</span>
                </div>
                <div class="text-[11px] font-bold text-ink-500 uppercase tracking-wide mt-4">${esc(f.label)}</div>
                <h2 class="text-2xl sm:text-3xl font-display font-extrabold mt-1">${esc(c.title)}</h2>
                <p class="text-slate-600 mt-3 leading-relaxed">${esc(c.summary || '')}</p>

                <h3 class="font-bold text-lg mt-6 mb-2">What you'll learn</h3>
                <div class="grid sm:grid-cols-2 gap-2">
                    ${(c.outcomes || []).map(o => `<div class="flex items-start gap-2 text-sm text-slate-600"><i class="fas fa-circle-check text-zam-green mt-0.5"></i><span>${esc(o)}</span></div>`).join('')}
                </div>

                <h3 class="font-bold text-lg mt-6 mb-3">Course content <span class="text-sm font-normal text-slate-400">· ${lessons.length} lessons · about ${c.hours || 1} hour</span></h3>
                <div class="space-y-3">${modulesHtml}</div>
            </div>

            <div class="lg:col-span-1">
                <div class="bg-white rounded-2xl border border-ink-100 shadow-sm p-5 lg:sticky lg:top-24">
                    <div class="text-3xl font-extrabold text-ink-700">${fmtK(c.priceZmw)}</div>
                    <p class="text-xs text-slate-400 mt-1">One-time payment · lifetime access</p>
                    <div class="mt-4">${cta}</div>
                    <ul class="mt-5 space-y-2 text-sm text-slate-600">
                        <li><i class="fas fa-mobile-screen text-ink-500 w-5"></i> Pay with Mobile Money</li>
                        <li><i class="fas fa-clock text-ink-500 w-5"></i> ~${c.hours || 1} hour, learn at your pace</li>
                        <li><i class="fas fa-file-circle-check text-ink-500 w-5"></i> Short exam (70% to pass)</li>
                        <li><i class="fas fa-award text-ink-500 w-5"></i> Verifiable Certificate of Completion</li>
                    </ul>
                    <p class="mt-4 text-[11px] text-slate-400 leading-relaxed">Certificate of Completion — not a government- or TEVETA-accredited qualification.</p>
                </div>
            </div>
        </div>`;
    showView('courseView');
}

/* ================================================================
   ENROL / CHECKOUT
   ================================================================ */
function enroll(courseId) {
    const c = courseById(courseId);
    if (!c) return;
    if (!currentUser) { pendingEnrollCourse = courseId; openAuth('signup', 'Create an account to enrol'); return; }
    openCheckout(c);
}

function openCheckout(course) {
    payCourse = course;
    selectedProvider = null;
    document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('selected'));
    $('payError').classList.add('hidden');
    $('payPhone').value = '';
    $('payCourseTitle').textContent = course.title;
    $('payTotal').textContent = fmtK(course.priceZmw);
    $('payStep1').classList.remove('hidden');
    $('payStep2').classList.add('hidden');
    $('payStep3').classList.add('hidden');
    setPayMethod('momo');
    configureCheckoutMethods();
    $('checkoutModal').classList.remove('hidden');
    $('checkoutModal').classList.add('flex');
}

/* ---------- VeriPoints checkout integration (no-op when plugin off) ---------- */
function vpOn() { return window.VP && window.VP.isOn(); }

function configureCheckoutMethods() {
    const on = vpOn();
    $('methodSelector').classList.toggle('hidden', !on); // MoMo-only look when off
    if (!on) { setPayMethod('momo'); return; }
    renderVpPanel();
}

function setPayMethod(m) {
    payMethod = (m === 'vp' && vpOn()) ? 'vp' : 'momo';
    $('momoPanel').classList.toggle('hidden', payMethod !== 'momo');
    $('vpPanel').classList.toggle('hidden', payMethod !== 'vp');
    const sel = 'border-ink-600 bg-ink-50 text-ink-800', un = 'border-slate-200 text-slate-500';
    const mb = $('methodMomoBtn'), vb = $('methodVpBtn');
    if (mb && vb) {
        mb.className = 'border-2 rounded-xl p-3 text-center transition text-sm font-bold ' + (payMethod === 'momo' ? sel : un);
        vb.className = 'border-2 rounded-xl p-3 text-center transition text-sm font-bold ' + (payMethod === 'vp' ? sel : un);
    }
    if (payMethod === 'vp') renderVpPanel();
}

function renderVpPanel() {
    if (!vpOn() || !payCourse) return;
    const st = window.VP.state();
    $('vpBalance').textContent = st.points;
    const need = window.VP.pointsFor(payCourse.priceZmw);
    $('vpCost').textContent = 'This course costs ' + need + ' pts';
    $('vpConnectWrap').classList.toggle('hidden', st.connected);
    $('vpPayBtn').classList.toggle('hidden', !st.connected);
    $('vpError').classList.add('hidden');
}

async function vpConnect() {
    const ok = await window.VP.connect();
    if (ok) renderVpPanel();
}

async function submitPointsPayment() {
    const err = $('vpError');
    err.classList.add('hidden');
    const btn = $('vpPayBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner inline-block !w-4 !h-4 !border-2 align-middle mr-2"></span> Paying…';
    try {
        const ref = 'OAENR-' + Math.floor(100000 + Math.random() * 900000);
        const r = await window.VP.payPoints({ priceZmw: payCourse.priceZmw, reference: ref });
        await Store.createEnrollment(payCourse, 'VP:' + (r.ref || ref));
        window.VP.earn({ priceZmw: payCourse.priceZmw, reference: ref }); // best-effort loyalty
        $('payDoneCourse').textContent = payCourse.title;
        $('payStep1').classList.add('hidden');
        $('payStep3').classList.remove('hidden');
    } catch (e) {
        err.textContent = e.message || 'Payment with points failed.';
        err.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-coins mr-1"></i> Pay with points';
    }
}

function onVpChipClick() {
    if (!vpOn()) return;
    showToast('You have ' + window.VP.points() + ' VeriPoints — use them at checkout.');
}

function refreshVpChip() {
    const chip = $('vpChip');
    if (!chip) return;
    const show = vpOn() && window.VP.isConnected();
    chip.classList.toggle('hidden', !show);
    if (show) $('vpChipVal').textContent = window.VP.points();
    // keep the open checkout panel in sync
    if (!$('checkoutModal').classList.contains('hidden') && payMethod === 'vp') renderVpPanel();
}
function closeCheckout() {
    $('checkoutModal').classList.add('hidden');
    $('checkoutModal').classList.remove('flex');
}
function selectProvider(p, btn) {
    selectedProvider = p;
    document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

// Attempts a real Mobile Money charge via the backend (pawaPay).
// true = paid, 'failed' = declined/timeout, null = simulated/unreachable.
async function tryRealPayment(order) {
    if (!CONFIG.API_BASE_URL) return null;
    const base = CONFIG.API_BASE_URL.replace(/\/$/, '');
    try {
        const res = await fetch(base + '/api/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: order.phone, network: order.provider, amount: order.total, course: order.courseTitle }),
            signal: AbortSignal.timeout(30000)
        });
        const data = await res.json();
        if (!res.ok || data.simulated || !data.tx_ref) return null;
        for (let i = 0; i < 24; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const s = await fetch(base + '/api/pay/status?tx_ref=' + encodeURIComponent(data.tx_ref),
                    { signal: AbortSignal.timeout(15000) }).then(r => r.json());
                if (s.status === 'successful') return { ok: true, ref: data.tx_ref };
                if (s.status === 'failed' || s.status === 'cancelled') return 'failed';
            } catch (e) { /* transient, keep waiting */ }
        }
        return 'failed';
    } catch (e) {
        console.warn('Real payment unavailable, simulating:', e);
        return null;
    }
}

async function submitPayment() {
    const phone = $('payPhone').value.trim();
    const err = $('payError');
    if (!selectedProvider) { err.textContent = 'Please choose your mobile network.'; err.classList.remove('hidden'); return; }
    if (!/^(9|7)\d{8}$/.test(phone)) { err.textContent = 'Enter a valid Zambian number, e.g. 971234567.'; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');

    const order = { provider: selectedProvider, phone, total: payCourse.priceZmw, courseTitle: payCourse.title };
    $('pay2Total').textContent = fmtK(order.total);
    $('pay2Phone').textContent = '+260 ' + phone;
    $('payStep1').classList.add('hidden');
    $('payStep2').classList.remove('hidden');

    const outcome = await tryRealPayment(order);
    if (outcome === 'failed') {
        $('payStep2').classList.add('hidden');
        $('payStep1').classList.remove('hidden');
        err.textContent = 'The payment was not completed. Please check your phone and try again.';
        err.classList.remove('hidden');
        return;
    }
    if (outcome !== true && !(outcome && outcome.ok)) await new Promise(r => setTimeout(r, 4000));

    const ref = (outcome && outcome.ref) ? outcome.ref : 'SIM-' + Math.floor(100000 + Math.random() * 900000);
    try {
        await Store.createEnrollment(payCourse, ref);
    } catch (e) {
        console.error(e);
        $('payStep2').classList.add('hidden');
        $('payStep1').classList.remove('hidden');
        err.textContent = 'Could not save your enrolment. Please try again.';
        err.classList.remove('hidden');
        return;
    }
    if (window.VP && window.VP.isOn()) window.VP.earn({ priceZmw: payCourse.priceZmw, reference: ref }); // loyalty, best-effort
    $('payDoneCourse').textContent = payCourse.title;
    $('payStep2').classList.add('hidden');
    $('payStep3').classList.remove('hidden');
}

function afterEnrol() {
    const id = payCourse.id;
    closeCheckout();
    openLearn(id);
}

/* ================================================================
   LEARN VIEW
   ================================================================ */
async function openLearn(courseId) {
    const c = courseById(courseId);
    const e = await Store.getEnrollment(courseId);
    if (!c || !e) { openCourse(courseId); return; }
    learnCourse = c;
    const lessons = flatLessons(c);
    // Resume at first incomplete lesson
    const firstIncomplete = lessons.find(l => !e.completedLessons.includes(l.key));
    learnKey = (firstIncomplete || lessons[0]).key;
    renderLearn();
}

function renderLearn() {
    const c = learnCourse;
    const lessons = flatLessons(c);
    const e = enrolledMap[c.id];
    const doneSet = new Set(e.completedLessons);
    const cur = lessons.find(l => l.key === learnKey) || lessons[0];
    const idx = lessons.findIndex(l => l.key === cur.key);
    const pct = Math.round((doneSet.size / lessons.length) * 100);
    const allDone = doneSet.size >= lessons.length;

    // Sidebar grouped by module
    let side = '';
    (c.modules || []).forEach((m, mi) => {
        side += `<div class="mb-3"><div class="text-[11px] font-bold text-slate-400 uppercase px-2 mb-1">${esc(m.title)}</div>`;
        (m.lessons || []).forEach((l, li) => {
            const key = mi + '.' + li;
            const active = key === cur.key;
            const done = doneSet.has(key);
            side += `<button onclick="OA.gotoLesson('${key}')" class="w-full text-left px-2 py-2 rounded-lg text-sm flex items-center gap-2 ${active ? 'bg-ink-100 text-ink-800 font-semibold' : 'hover:bg-slate-50 text-slate-600'}">
                <i class="fas ${done ? 'fa-circle-check text-zam-green' : 'fa-circle text-slate-300'}"></i>
                <span class="flex-1 leading-snug">${esc(l.title)}</span></button>`;
        });
        side += `</div>`;
    });

    const isCapstone = !!c.capstone;
    const finalLabel = isCapstone ? 'Submit your final project' : 'Take the final exam';
    const finalIcon = isCapstone ? 'fa-laptop-code' : 'fa-file-pen';
    const examBtn = allDone
        ? `<button onclick="OA.startExam()" class="w-full mt-2 bg-gold text-ink-900 font-extrabold py-3 rounded-xl hover:brightness-105 transition"><i class="fas ${finalIcon} mr-2"></i>${finalLabel}</button>`
        : `<button disabled class="w-full mt-2 bg-slate-100 text-slate-400 font-bold py-3 rounded-xl cursor-not-allowed"><i class="fas fa-lock mr-2"></i>Finish all lessons to unlock the ${isCapstone ? 'project' : 'exam'}</button>`;

    const curDone = doneSet.has(cur.key);
    $('learnView').innerHTML = `
        <button onclick="OA.openCourse('${c.id}')" class="text-sm font-bold text-ink-600 hover:underline mb-3"><i class="fas fa-arrow-left mr-1"></i>Course overview</button>
        <div class="grid lg:grid-cols-3 gap-6">
            <aside class="lg:col-span-1 order-2 lg:order-1">
                <div class="bg-white rounded-2xl border border-ink-100 p-4 lg:sticky lg:top-24">
                    <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-1"><span>Your progress</span><span>${pct}%</span></div>
                    <div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-4"><div class="h-full bg-ink-600 rounded-full transition-all" style="width:${pct}%"></div></div>
                    <div class="max-h-[50vh] overflow-y-auto no-scrollbar">${side}</div>
                    ${examBtn}
                </div>
            </aside>
            <section class="lg:col-span-2 order-1 lg:order-2">
                <div class="bg-white rounded-2xl border border-ink-100 p-6">
                    <div class="text-xs font-bold text-ink-500 uppercase tracking-wide">${esc(cur.moduleTitle)} · Lesson ${idx + 1} of ${lessons.length}</div>
                    <h2 class="text-2xl font-display font-extrabold mt-1">${esc(cur.title)}</h2>
                    <div class="lesson-body mt-4">${renderLessonBody(cur.content)}</div>
                    <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <button onclick="OA.prevLesson()" class="text-slate-500 font-bold text-sm hover:text-ink-600 ${idx === 0 ? 'invisible' : ''}"><i class="fas fa-arrow-left mr-1"></i>Previous</button>
                        <button onclick="OA.completeCurrent()" class="bg-ink-600 hover:bg-ink-700 text-white font-bold px-6 py-3 rounded-xl transition">
                            ${curDone ? (idx < lessons.length - 1 ? 'Next lesson <i class="fas fa-arrow-right ml-1"></i>' : '<i class="fas fa-check mr-1"></i>All lessons done') : 'Mark complete &amp; continue <i class="fas fa-check ml-1"></i>'}
                        </button>
                    </div>
                </div>
            </section>
        </div>`;
    showView('learnView');
}

function gotoLesson(key) { learnKey = key; renderLearn(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function prevLesson() {
    const lessons = flatLessons(learnCourse);
    const idx = lessons.findIndex(l => l.key === learnKey);
    if (idx > 0) gotoLesson(lessons[idx - 1].key);
}
async function completeCurrent() {
    const lessons = flatLessons(learnCourse);
    const idx = lessons.findIndex(l => l.key === learnKey);
    await Store.setLessonComplete(learnCourse.id, learnKey);
    if (idx < lessons.length - 1) { learnKey = lessons[idx + 1].key; renderLearn(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else { renderLearn(); showToast('🎉 All lessons complete — take the exam!'); }
}

/* ================================================================
   EXAM
   ================================================================ */
function startExam() {
    const c = learnCourse;
    if (c.capstone) { return startCapstone(); }
    const quiz = c.quiz || [];
    if (!quiz.length) { showToast('This course has no exam yet.'); return; }
    $('quizView').innerHTML = `
        <button onclick="OA.openLearn('${c.id}')" class="text-sm font-bold text-ink-600 hover:underline mb-3"><i class="fas fa-arrow-left mr-1"></i>Back to lessons</button>
        <div class="bg-white rounded-2xl border border-ink-100 p-6">
            <h2 class="text-2xl font-display font-extrabold">Final Exam</h2>
            <p class="text-slate-500 text-sm mt-1">${esc(c.title)} · ${quiz.length} questions · pass mark 70%</p>
            <form id="quizForm" class="mt-6 space-y-6">
                ${quiz.map((q, qi) => `
                    <div class="border-b border-slate-100 pb-5">
                        <p class="font-semibold">${qi + 1}. ${esc(q.q)}</p>
                        <div class="mt-3 space-y-2">
                            ${(q.options || []).map((opt, oi) => `
                                <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-ink-400 cursor-pointer text-sm">
                                    <input type="radio" name="q${qi}" value="${oi}" class="accent-ink-600">
                                    <span>${esc(opt)}</span>
                                </label>`).join('')}
                        </div>
                    </div>`).join('')}
            </form>
            <p id="quizError" class="text-zam-red text-sm font-semibold hidden mt-3"></p>
            <button onclick="OA.submitExam()" class="mt-4 w-full sm:w-auto bg-zam-green hover:bg-green-800 text-white font-bold px-8 py-3.5 rounded-xl transition"><i class="fas fa-paper-plane mr-2"></i>Submit exam</button>
        </div>`;
    showView('quizView');
}

async function submitExam() {
    const c = learnCourse;
    const quiz = c.quiz || [];
    const form = $('quizForm');
    let answered = 0, correct = 0;
    quiz.forEach((q, qi) => {
        const sel = form.querySelector(`input[name="q${qi}"]:checked`);
        if (sel) { answered++; if (parseInt(sel.value) === q.answer) correct++; }
    });
    if (answered < quiz.length) {
        const err = $('quizError');
        err.textContent = `Please answer all questions (${answered}/${quiz.length} answered).`;
        err.classList.remove('hidden');
        return;
    }
    const pct = Math.round((correct / quiz.length) * 100);
    if (pct >= 70) {
        await issueCertificate(c, pct);
    } else {
        $('quizView').innerHTML = `
            <div class="bg-white rounded-2xl border border-ink-100 p-8 text-center">
                <div class="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center"><i class="fas fa-rotate-right text-amber-500 text-3xl"></i></div>
                <h2 class="text-2xl font-display font-extrabold mt-5">Almost there!</h2>
                <p class="text-slate-500 mt-2">You scored <b>${pct}%</b>. You need 70% to pass.<br>Review the lessons and try again — you've got this.</p>
                <div class="mt-6 flex flex-wrap gap-3 justify-center">
                    <button onclick="OA.openLearn('${c.id}')" class="bg-ink-100 text-ink-700 font-bold px-6 py-3 rounded-xl hover:bg-ink-200"><i class="fas fa-book-open mr-2"></i>Review lessons</button>
                    <button onclick="OA.startExam()" class="bg-ink-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-ink-700"><i class="fas fa-file-pen mr-2"></i>Try the exam again</button>
                </div>
            </div>`;
        showView('quizView');
    }
}

/* ================================================================
   CAPSTONE — "present your website to the virtual mentor"
   ================================================================ */
function startCapstone() {
    const c = learnCourse;
    const cap = c.capstone || {};
    const checklist = cap.checklist || [];
    const reflect = cap.reflect || [];
    const knowledge = cap.knowledge || [];
    $('quizView').innerHTML = `
        <button onclick="OA.openLearn('${c.id}')" class="text-sm font-bold text-ink-600 hover:underline mb-3"><i class="fas fa-arrow-left mr-1"></i>Back to lessons</button>
        <div class="bg-white rounded-2xl border border-ink-100 p-6">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center text-ink-700 text-xl"><i class="fas fa-user-tie"></i></div>
                <div><h2 class="text-2xl font-display font-extrabold leading-none">Final Project</h2>
                <p class="text-slate-500 text-sm mt-1">Present your website to the virtual mentor</p></div>
            </div>
            ${cap.intro ? `<div class="lesson-body mt-4">${renderLessonBody(cap.intro)}</div>` : ''}

            <label class="text-sm font-semibold text-slate-700 block mt-6 mb-2"><i class="fas fa-globe text-ink-500 mr-1"></i> ${esc(cap.urlLabel || 'Your live website address (URL)')}</label>
            <input id="capUrl" type="url" inputmode="url" placeholder="https://your-site.example.com"
                class="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500">

            ${checklist.length ? `<h3 class="font-bold mt-6 mb-2">Before you submit, confirm:</h3>
            <div class="space-y-2">
                ${checklist.map((item, i) => `<label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-ink-400 cursor-pointer text-sm">
                    <input type="checkbox" id="cap_chk_${i}" class="accent-ink-600 mt-0.5"><span>${esc(item)}</span></label>`).join('')}
            </div>` : ''}

            ${reflect.length ? `<h3 class="font-bold mt-6 mb-2">The mentor asks:</h3>
            <div class="space-y-4">
                ${reflect.map((q, i) => `<div><label class="text-sm font-semibold text-slate-600 block mb-1">${i + 1}. ${esc(q)}</label>
                    <textarea id="cap_ref_${i}" rows="2" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500"></textarea></div>`).join('')}
            </div>` : ''}

            ${knowledge.length ? `<h3 class="font-bold mt-6 mb-2">Quick knowledge check:</h3>
            <form id="capKnow" class="space-y-5">
                ${knowledge.map((q, qi) => `<div><p class="font-semibold text-sm">${qi + 1}. ${esc(q.q)}</p>
                    <div class="mt-2 space-y-2">${(q.options || []).map((opt, oi) => `<label class="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-ink-400 cursor-pointer text-sm">
                        <input type="radio" name="k${qi}" value="${oi}" class="accent-ink-600"><span>${esc(opt)}</span></label>`).join('')}</div></div>`).join('')}
            </form>` : ''}

            <p id="capError" class="text-zam-red text-sm font-semibold hidden mt-4"></p>
            <button onclick="OA.submitCapstone()" class="mt-5 w-full sm:w-auto bg-zam-green hover:bg-green-800 text-white font-bold px-8 py-3.5 rounded-xl transition"><i class="fas fa-paper-plane mr-2"></i>Present to the mentor</button>
        </div>`;
    showView('quizView');
}

async function submitCapstone() {
    const c = learnCourse;
    const cap = c.capstone || {};
    const err = $('capError');
    err.classList.add('hidden');

    const url = $('capUrl').value.trim();
    if (!/^https?:\/\/[^\s.]+\.[^\s]+/i.test(url)) { err.textContent = 'Please enter a valid public website address, starting with https://'; err.classList.remove('hidden'); return; }

    const checklist = cap.checklist || [];
    if (!checklist.every((_, i) => $('cap_chk_' + i) && $('cap_chk_' + i).checked)) { err.textContent = 'Please confirm every item in the checklist before submitting.'; err.classList.remove('hidden'); return; }

    const reflect = cap.reflect || [];
    const reflections = reflect.map((_, i) => ($('cap_ref_' + i) ? $('cap_ref_' + i).value.trim() : ''));
    if (reflections.some(r => r.length < 3)) { err.textContent = "Please answer all of the mentor's questions."; err.classList.remove('hidden'); return; }

    const knowledge = cap.knowledge || [];
    let answered = 0, correct = 0;
    knowledge.forEach((q, qi) => {
        const sel = document.querySelector(`input[name="k${qi}"]:checked`);
        if (sel) { answered++; if (parseInt(sel.value) === q.answer) correct++; }
    });
    if (answered < knowledge.length) { err.textContent = 'Please answer all the knowledge-check questions.'; err.classList.remove('hidden'); return; }

    const pct = knowledge.length ? Math.round((correct / knowledge.length) * 100) : 100;
    if (pct < 70) {
        $('quizView').innerHTML = `
            <div class="bg-white rounded-2xl border border-ink-100 p-8 text-center">
                <div class="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center"><i class="fas fa-rotate-right text-amber-500 text-3xl"></i></div>
                <h2 class="text-2xl font-display font-extrabold mt-5">Nearly there!</h2>
                <p class="text-slate-500 mt-2">Your knowledge check scored <b>${pct}%</b> (70% needed). Your website looks submitted — just review the lessons and re-check your answers.</p>
                <button onclick="OA.startExam()" class="mt-6 bg-ink-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-ink-700"><i class="fas fa-rotate-right mr-2"></i>Try again</button>
            </div>`;
        return;
    }

    const mentor = `Your website is live at <a href="${esc(url)}" target="_blank" rel="noopener" class="text-ink-600 font-bold underline break-all">${esc(url)}</a>. You took a real site from an idea to the internet — exactly what paying clients need. Keep this in your portfolio, and when you're ready, apply to the ORIZIS Builder Network.`;
    await issueCertificate(c, pct, { submissionUrl: url, reflections }, mentor);
}

/* ================================================================
   CERTIFICATE
   ================================================================ */
function newCertId() {
    const t = Date.now().toString(36).toUpperCase().slice(-5);
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'OA-' + t + '-' + r;
}
function verifyUrl(certId) {
    return new URL('verify.html', location.href).href + '?id=' + encodeURIComponent(certId);
}

async function issueCertificate(course, scorePercent, extra, mentorMsg) {
    const certId = newCertId();
    const cert = {
        certId, userId: currentUser.uid, userName: currentUser.name || 'Learner',
        courseId: course.id, courseTitle: course.title, level: course.level || '',
        scorePercent, issuedAt: new Date().toISOString(), issuer: 'ORIZIS Academy'
    };
    if (extra && extra.submissionUrl) cert.projectUrl = extra.submissionUrl;
    try {
        await Store.completeCourse(course.id, scorePercent, certId, extra); // must be 'completed' before cert (Firestore rule)
        await Store.createCertificate(cert);
    } catch (e) {
        console.error('Certificate save failed:', e);
        showToast('Could not save certificate. Please try again.');
        return;
    }
    renderCertificate(cert, mentorMsg);
}

function renderCertificate(cert, mentorMsg) {
    showView('certView');
    const mentorCard = mentorMsg ? `
        <div class="max-w-2xl mx-auto mb-6 bg-ink-50 border border-ink-100 rounded-2xl p-5 flex gap-4">
            <div class="w-11 h-11 shrink-0 rounded-full bg-ink-700 text-white flex items-center justify-center text-lg"><i class="fas fa-user-tie"></i></div>
            <div><div class="font-bold text-ink-800 text-sm mb-1">Virtual mentor review</div>
            <p class="text-sm text-slate-600 leading-relaxed">${mentorMsg}</p></div>
        </div>` : '';
    $('certView').innerHTML = `
        <div class="text-center mb-6">
            <div class="w-16 h-16 mx-auto rounded-full bg-zam-green flex items-center justify-center"><i class="fas fa-check text-white text-2xl"></i></div>
            <h2 class="text-2xl font-display font-extrabold mt-3">Congratulations, ${esc(cert.userName)}! 🎉</h2>
            <p class="text-slate-500 mt-1">You passed with ${cert.scorePercent}% and earned your Certificate of Completion.</p>
        </div>
        ${mentorCard}
        <div id="certPreview" class="mx-auto max-w-2xl bg-white rounded-2xl shadow-lg overflow-hidden border-4 border-ink-800">
            <div class="p-6 sm:p-10 text-center relative">
                <div class="absolute inset-3 border-2 border-gold rounded-xl pointer-events-none"></div>
                <div class="relative">
                    <div class="text-ink-700 text-3xl"><i class="fas fa-graduation-cap"></i></div>
                    <div class="font-display font-extrabold text-xl mt-1 tracking-wide">ORIZIS ACADEMY</div>
                    <div class="text-[11px] tracking-[0.3em] text-slate-400 uppercase">Certificate of Completion</div>
                    <p class="text-slate-500 text-sm mt-6">This certifies that</p>
                    <p class="font-display font-extrabold text-2xl sm:text-3xl text-ink-800 mt-1">${esc(cert.userName)}</p>
                    <p class="text-slate-500 text-sm mt-4">has successfully completed the online course</p>
                    <p class="font-bold text-lg mt-1">${esc(cert.courseTitle)}</p>
                    <p class="text-slate-500 text-sm mt-1">${esc(cert.level)} · Score: ${cert.scorePercent}%</p>
                    <div class="flex items-center justify-between mt-8 text-left text-xs text-slate-500">
                        <div>
                            <div class="font-bold text-slate-700">${fmtDate(cert.issuedAt)}</div>
                            <div>Date of issue</div>
                            <div class="font-bold text-slate-700 mt-2">${esc(cert.certId)}</div>
                            <div>Verification code</div>
                        </div>
                        <div id="certQr" class="shrink-0"></div>
                    </div>
                    <p class="text-[9px] text-slate-400 mt-6 leading-snug">ORIZIS Academy Certificate of Completion. This is not a government- or TEVETA-accredited qualification. Verify at ${esc(new URL('verify.html', location.href).href)}</p>
                </div>
            </div>
        </div>
        <div class="max-w-2xl mx-auto mt-5 flex flex-wrap gap-3 justify-center">
            <button onclick="OA.downloadCert('${cert.certId}')" class="bg-ink-600 hover:bg-ink-700 text-white font-bold px-6 py-3 rounded-xl transition"><i class="fas fa-download mr-2"></i>Download PDF</button>
            <a href="${verifyUrl(cert.certId)}" target="_blank" rel="noopener" class="bg-ink-100 text-ink-700 font-bold px-6 py-3 rounded-xl hover:bg-ink-200 transition"><i class="fas fa-shield-halved mr-2"></i>Verify online</a>
            <button onclick="OA.goHome()" class="bg-white border border-slate-200 text-slate-600 font-bold px-6 py-3 rounded-xl hover:bg-slate-50 transition">More courses</button>
        </div>
        <p class="text-center text-xs text-slate-400 mt-4">Verification link: <span class="font-mono">${esc(verifyUrl(cert.certId))}</span></p>`;

    // Render on-screen QR
    makeQr($('certQr'), verifyUrl(cert.certId), 84);
    // Stash for PDF
    window._lastCert = cert;
}

// Renders a QR into an element and returns nothing; used for on-screen preview.
function makeQr(el, text, size) {
    if (!el || typeof QRCode === 'undefined') return;
    el.innerHTML = '';
    try { new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
}
// Produces a PNG dataURL for a QR (for embedding in the PDF).
function qrDataUrl(text) {
    return new Promise(resolve => {
        if (typeof QRCode === 'undefined') return resolve(null);
        const holder = document.createElement('div');
        holder.style.position = 'fixed'; holder.style.left = '-9999px'; holder.style.top = '0';
        document.body.appendChild(holder);
        try { new QRCode(holder, { text, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); }
        catch (e) { document.body.removeChild(holder); return resolve(null); }
        setTimeout(() => {
            let url = null;
            const cv = holder.querySelector('canvas');
            if (cv) { try { url = cv.toDataURL('image/png'); } catch (e) {} }
            if (!url) { const img = holder.querySelector('img'); if (img) url = img.src; }
            document.body.removeChild(holder);
            resolve(url);
        }, 150);
    });
}

async function downloadCert(certId) {
    const cert = window._lastCert;
    if (!cert || cert.certId !== certId) { showToast('Certificate not ready.'); return; }
    if (!window.jspdf) { showToast('PDF library not loaded.'); return; }
    showToast('Preparing your certificate…');
    const qr = await qrDataUrl(verifyUrl(cert.certId));
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); // 842 x 595
    const W = 842, H = 595;

    // Background + borders
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(49, 46, 129); doc.setLineWidth(6); doc.rect(22, 22, W - 44, H - 44);   // ink-900
    doc.setDrawColor(227, 174, 78); doc.setLineWidth(1.5); doc.rect(34, 34, W - 68, H - 68); // gold

    // Header
    doc.setTextColor(67, 56, 202);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
    doc.text('ORIZIS ACADEMY', W / 2, 96, { align: 'center' });
    doc.setTextColor(120, 120, 120); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
    doc.text('C E R T I F I C A T E   O F   C O M P L E T I O N', W / 2, 120, { align: 'center' });
    doc.setDrawColor(227, 174, 78); doc.setLineWidth(1); doc.line(W / 2 - 120, 132, W / 2 + 120, 132);

    // Body
    doc.setTextColor(90, 90, 90); doc.setFontSize(13);
    doc.text('This certifies that', W / 2, 176, { align: 'center' });
    doc.setTextColor(49, 46, 129); doc.setFont('helvetica', 'bold'); doc.setFontSize(34);
    doc.text(cert.userName, W / 2, 214, { align: 'center' });
    doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
    doc.text('has successfully completed the online course', W / 2, 246, { align: 'center' });
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
    doc.text(doc.splitTextToSize(cert.courseTitle, W - 220), W / 2, 278, { align: 'center' });
    doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text((cert.level ? cert.level + '  ·  ' : '') + 'Score: ' + cert.scorePercent + '%', W / 2, 306, { align: 'center' });

    // Footer left: date + code + signature
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(fmtDate(cert.issuedAt), 90, 470);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text('Date of issue', 90, 484);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 30, 30);
    doc.text(cert.certId, 90, 512);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text('Verification code', 90, 526);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(67, 56, 202);
    doc.text('ORIZIS Academy', W - 90, 470, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text('an ORIZIS TECHNOLOGY brand', W - 90, 484, { align: 'right' });

    // QR centre-bottom
    if (qr) {
        doc.addImage(qr, 'PNG', W / 2 - 42, 430, 84, 84);
        doc.setFontSize(8); doc.setTextColor(120, 120, 120);
        doc.text('Scan to verify', W / 2, 524, { align: 'center' });
    }

    // Disclaimer
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text('ORIZIS Academy Certificate of Completion. This is not a government- or TEVETA-accredited qualification. Verify online at ' + new URL('verify.html', location.href).href,
        W / 2, 556, { align: 'center' });

    doc.save('ORIZIS-Academy-Certificate-' + cert.certId + '.pdf');
}

// View an already-earned certificate (from My Learning / course page)
async function viewCertificateById(certId, courseId) {
    let cert = null;
    if (MODE === 'firebase') {
        try { const s = await db.collection('certificates').doc(certId).get(); if (s.exists) cert = s.data(); } catch (e) {}
    } else {
        const raw = localStorage.getItem('oa_cert_' + certId);
        if (raw) cert = JSON.parse(raw);
    }
    if (!cert) {
        // Fallback: rebuild a display cert from the enrollment
        const e = await Store.getEnrollment(courseId);
        const c = courseById(courseId);
        if (!e || !c) { showToast('Certificate not found.'); return; }
        cert = { certId, userName: currentUser.name || 'Learner', courseTitle: c.title, level: c.level, scorePercent: e.scorePercent || 100, issuedAt: e.createdAt };
    }
    renderCertificate(cert);
}

/* ================================================================
   MY LEARNING
   ================================================================ */
async function showMyLearning() {
    toggleAccountMenu(false);
    if (!currentUser) { openAuth('login', 'Log in to see your learning'); return; }
    showView('myLearningView');
    $('myLearningView').innerHTML = `<div class="text-center py-16"><div class="spinner mx-auto"></div></div>`;
    const enrolls = await Store.listEnrollments();
    enrolls.forEach(e => { enrolledMap[e.courseId] = e; });

    if (!enrolls.length) {
        $('myLearningView').innerHTML = `
            <h2 class="text-2xl font-display font-extrabold mb-2">My Learning</h2>
            <div class="text-center py-16 text-slate-400">
                <i class="fas fa-book-open-reader text-4xl mb-3"></i>
                <p>You haven't enrolled in any courses yet.</p>
                <button onclick="OA.goHome()" class="mt-4 bg-ink-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-ink-700">Browse courses</button>
            </div>`;
        return;
    }

    const cards = enrolls.map(e => {
        const c = courseById(e.courseId);
        const title = e.courseTitle || (c ? c.title : e.courseId);
        const total = c ? totalLessons(c) : (e.completedLessons.length || 1);
        const pct = Math.round((e.completedLessons.length / total) * 100);
        const f = fieldOf(c || {});
        const action = e.status === 'completed'
            ? `<button onclick="OA.viewCertificateById('${e.certId}','${e.courseId}')" class="bg-gold text-ink-900 font-extrabold px-5 py-2.5 rounded-xl hover:brightness-105"><i class="fas fa-award mr-1"></i>Certificate</button>`
            : `<button onclick="OA.openLearn('${e.courseId}')" class="bg-ink-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-ink-700"><i class="fas fa-play mr-1"></i>Continue</button>`;
        return `
        <div class="bg-white rounded-2xl border border-ink-100 p-4 flex gap-4 items-center">
            <div class="w-16 h-16 rounded-xl bg-gradient-to-br ${f.grad} flex items-center justify-center shrink-0"><i class="fas ${f.icon} text-white text-2xl"></i></div>
            <div class="flex-1 min-w-0">
                <h4 class="font-bold leading-snug">${esc(title)}</h4>
                <div class="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${e.status === 'completed' ? 'bg-zam-green' : 'bg-ink-600'} rounded-full" style="width:${pct}%"></div></div>
                <p class="text-xs text-slate-400 mt-1">${e.status === 'completed' ? 'Completed · ' + (e.scorePercent || '') + '%' : pct + '% complete'}</p>
            </div>
            <div class="shrink-0">${action}</div>
        </div>`;
    }).join('');

    $('myLearningView').innerHTML = `
        <button onclick="OA.goHome()" class="text-sm font-bold text-ink-600 hover:underline mb-3"><i class="fas fa-arrow-left mr-1"></i>All courses</button>
        <h2 class="text-2xl font-display font-extrabold mb-4">My Learning</h2>
        <div class="space-y-3">${cards}</div>`;
}

/* ================================================================
   AUTH
   ================================================================ */
function openAuth(mode, subtitle) {
    authMode = mode || 'login';
    $('authError').classList.add('hidden');
    $('authName').value = ''; $('authEmail').value = ''; $('authPass').value = '';
    applyAuthMode();
    if (subtitle) $('authSubtitle').textContent = subtitle;
    $('authDemoNote').classList.toggle('hidden', MODE !== 'local');
    $('authPassWrap').classList.toggle('hidden', MODE === 'local'); // no password needed in demo
    $('authModal').classList.remove('hidden');
    $('authModal').classList.add('flex');
}
function closeAuth() { $('authModal').classList.add('hidden'); $('authModal').classList.remove('flex'); }
function applyAuthMode() {
    const signup = authMode === 'signup';
    $('authTitle').textContent = signup ? 'Create your Academy account' : 'Log in to ORIZIS Academy';
    $('authNameWrap').classList.toggle('hidden', !signup);
    $('authToggleText').textContent = signup ? 'Already have an account?' : 'New here?';
    $('authToggleBtn').textContent = signup ? 'Log in' : 'Create an account';
    $('authSubmit').textContent = signup ? 'Create account' : 'Log in';
}
function toggleAuthMode() { authMode = authMode === 'signup' ? 'login' : 'signup'; applyAuthMode(); $('authError').classList.add('hidden'); }

async function submitAuth() {
    const name = $('authName').value.trim();
    const email = $('authEmail').value.trim();
    const pass = $('authPass').value;
    const err = $('authError');
    const signup = authMode === 'signup';
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Please enter a valid email.'; err.classList.remove('hidden'); return; }
    if (signup && MODE !== 'local' && name.length < 2) { err.textContent = 'Please enter your full name.'; err.classList.remove('hidden'); return; }

    if (MODE === 'local') {
        // Demo mode: lightweight local account (no password)
        const displayName = name || (email.split('@')[0]);
        const user = { uid: 'local', name: displayName, email };
        localStorage.setItem('oa_local_user', JSON.stringify(user));
        onSignedIn(user);
        return;
    }

    if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.classList.remove('hidden'); return; }
    $('authSubmit').disabled = true; $('authSubmit').textContent = 'Please wait…';
    try {
        if (signup) {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            await cred.user.updateProfile({ displayName: name });
        } else {
            await auth.signInWithEmailAndPassword(email, pass);
        }
        // onAuthStateChanged handles the rest
    } catch (e) {
        err.textContent = friendlyAuthError(e);
        err.classList.remove('hidden');
    } finally {
        $('authSubmit').disabled = false; applyAuthMode();
    }
}

async function googleAuth() {
    const err = $('authError');
    if (MODE !== 'firebase') { err.textContent = 'Google sign-in needs the live site.'; err.classList.remove('hidden'); return; }
    try { const p = new firebase.auth.GoogleAuthProvider(); await auth.signInWithPopup(p); /* onAuthStateChanged handles the rest */ }
    catch (e) { err.textContent = friendlyAuthError(e); err.classList.remove('hidden'); }
}

function friendlyAuthError(e) {
    const c = (e && e.code) || '';
    if (c.includes('email-already-in-use')) return 'That email already has an account — try logging in.';
    if (c.includes('wrong-password') || c.includes('invalid-credential')) return 'Wrong email or password.';
    if (c.includes('user-not-found')) return 'No account with that email — create one.';
    if (c.includes('weak-password')) return 'Password is too weak (use 6+ characters).';
    if (c.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
    return 'Something went wrong. Please try again.';
}

async function onSignedIn(user) {
    currentUser = user;
    enrolledMap = {};
    updateAccountUi();
    closeAuth();
    // Preload enrolments for badges
    try { (await Store.listEnrollments()).forEach(e => { enrolledMap[e.courseId] = e; }); } catch (e) {}
    renderCatalog();
    showToast('Welcome, ' + (user.name || 'learner') + '! 👋');
    if (pendingEnrollCourse) {
        const id = pendingEnrollCourse; pendingEnrollCourse = null;
        const c = courseById(id); if (c) openCheckout(c);
    }
}

function doSignOut() {
    toggleAccountMenu(false);
    if (MODE === 'firebase') { auth.signOut(); }
    else { localStorage.removeItem('oa_local_user'); currentUser = null; enrolledMap = {}; updateAccountUi(); renderCatalog(); }
    showToast('Logged out.');
    goHome();
}

function updateAccountUi() {
    if (currentUser) {
        $('accountLabel').textContent = (currentUser.name || 'Account').split(' ')[0];
        $('accountMenuName').textContent = currentUser.email || currentUser.name;
    } else {
        $('accountLabel').textContent = 'Log in';
    }
}
function onAccountClick() {
    if (currentUser) toggleAccountMenu();
    else openAuth('login');
}
function toggleAccountMenu(force) {
    const m = $('accountMenu');
    const show = force === undefined ? m.classList.contains('hidden') : force;
    m.classList.toggle('hidden', !show);
}
document.addEventListener('click', e => {
    if (!e.target.closest('#accountBtn') && !e.target.closest('#accountMenu')) toggleAccountMenu(false);
});

/* ================================================================
   NAV / SEARCH / MISC
   ================================================================ */
function goHome() { activeField = 'all'; searchTerm = ''; $('searchInput').value = ''; renderCatalog(); showView('catalogView'); }
function doSearch() { searchTerm = $('searchInput').value.trim(); activeField = 'all'; renderCatalog(); showView('catalogView'); }
function filterField(f) { activeField = f; searchTerm = ''; $('searchInput').value = ''; renderCatalog(); showView('catalogView'); }
function scrollToCatalog() { showView('catalogView'); $('catalogView').scrollIntoView({ behavior: 'smooth' }); }

/* ---------- PWA install ---------- */
let deferredInstallPrompt = null;
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const IS_MOBILE = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
const IS_INSTALLED = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const INSTALL_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt = e; showInstallBanner(); });
function showInstallBanner() {
    if (IS_INSTALLED || !IS_MOBILE) return;
    const s = parseInt(localStorage.getItem('oa_install_snooze') || '0');
    if (Date.now() - s < INSTALL_SNOOZE_MS) return;
    $('installBanner').classList.remove('hidden');
}
function hideInstallBanner() { $('installBanner').classList.add('hidden'); }
function dismissInstall() { localStorage.setItem('oa_install_snooze', String(Date.now())); hideInstallBanner(); }
async function installApp() {
    if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; hideInstallBanner(); return; }
    $('guideIos').classList.toggle('hidden', !IS_IOS);
    $('guideAndroid').classList.toggle('hidden', IS_IOS);
    $('installGuide').classList.remove('hidden');
}
function closeInstallGuide() { $('installGuide').classList.add('hidden'); }
if (IS_MOBILE && !IS_INSTALLED) setTimeout(showInstallBanner, 3500);

/* ---------- Support / builder links ---------- */
(function initLinks() {
    const wa = 'https://wa.me/' + (CONFIG.WHATSAPP_SUPPORT || '') + '?text=' + encodeURIComponent('Hello ORIZIS Academy 👋 I have a question about a course.');
    if ($('waSupportBtn')) $('waSupportBtn').href = wa;
    if ($('emailSupportBtn')) $('emailSupportBtn').href = 'mailto:' + (CONFIG.SUPPORT_EMAIL || '');
    if ($('builderApplyBtn')) $('builderApplyBtn').href = CONFIG.BUILDER_NETWORK_URL || '#';
})();

/* ================================================================
   INIT
   ================================================================ */
function boot() {
    renderCatalog();
    showView('catalogView');
    // VeriPoints plugin — safe no-op unless enabled & configured
    if (window.VP) {
        window.VP.onState(refreshVpChip);
        window.VP.init().catch(() => {});
    }
    if (MODE === 'firebase') {
        auth.onAuthStateChanged(u => {
            if (u) onSignedIn({ uid: u.uid, name: u.displayName || (u.email ? u.email.split('@')[0] : 'Learner'), email: u.email });
            else { currentUser = null; enrolledMap = {}; updateAccountUi(); }
        });
    } else {
        const gw = document.getElementById('googleWrap'); if (gw) gw.style.display = 'none'; // demo mode: no Google popup
        const raw = localStorage.getItem('oa_local_user');
        if (raw) { const u = JSON.parse(raw); currentUser = u; updateAccountUi(); Store.listEnrollments().then(list => list.forEach(e => enrolledMap[e.courseId] = e)).then(renderCatalog); }
    }
}

// Public API (referenced by inline onclick handlers)
window.OA = {
    openCourse, enroll, openLearn, gotoLesson, prevLesson, completeCurrent,
    startExam, submitExam, submitCapstone, downloadCert, viewCertificateById, showMyLearning,
    filterField, goHome
};
// A few handlers used directly in HTML attributes:
window.goHome = goHome; window.doSearch = doSearch; window.scrollToCatalog = scrollToCatalog;
window.onAccountClick = onAccountClick; window.toggleAccountMenu = toggleAccountMenu;
window.openAuth = openAuth; window.closeAuth = closeAuth; window.toggleAuthMode = toggleAuthMode; window.submitAuth = submitAuth; window.googleAuth = googleAuth; window.doSignOut = doSignOut;
window.selectProvider = selectProvider; window.submitPayment = submitPayment; window.closeCheckout = closeCheckout; window.afterEnrol = afterEnrol;
window.showMyLearning = showMyLearning;
window.setPayMethod = setPayMethod; window.vpConnect = vpConnect; window.submitPointsPayment = submitPointsPayment; window.onVpChipClick = onVpChipClick;
window.installApp = installApp; window.dismissInstall = dismissInstall; window.closeInstallGuide = closeInstallGuide;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
