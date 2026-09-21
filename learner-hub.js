/* Lernoto learner area. Reads the existing LMS snapshot; never changes enrolments or payments. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const byId = id => document.getElementById(id);
  let snapshot = null, activeTab = 'courses', requestId = 0, sampleCourse = null;
  const dateText = value => {
    if (!value) return 'Not recorded';
    const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value.seconds ? value.seconds * 1000 : value);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
  };
  const scoreText = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? `${Number(value)}%` : 'Not recorded';
  const courseFor = id => snapshot?.courses?.find(course => course.id === id);
  function certificateList(data = snapshot) {
    if (!data?.user) return [];
    const linked = new Set((data.enrollments || []).map(item => item.certId).filter(Boolean));
    const seen = new Set();
    return (data.certificates || []).filter(cert => {
      if (!cert?.certId || seen.has(cert.certId)) return false;
      if (cert.userId ? cert.userId !== data.user.uid : !linked.has(cert.certId)) return false;
      seen.add(cert.certId); return true;
    });
  }
  function progress(enrollment) {
    const course = courseFor(enrollment.courseId);
    const keys = new Set((course?.modules || []).flatMap((module, mi) => (module.lessons || []).map((_, li) => `${mi}.${li}`)));
    const done = new Set((enrollment.completedLessons || []).filter(key => keys.has(key))).size;
    return {done, total:keys.size, percent:keys.size ? Math.round(done / keys.size * 100) : null};
  }
  function statusText(enrollment) {
    if (enrollment.status === 'completed') return 'Completed';
    if (['pending','pending_payment','awaiting_payment'].includes(enrollment.status)) return 'Awaiting payment';
    if (['cancelled','canceled','failed','refunded'].includes(enrollment.status)) return enrollment.status[0].toUpperCase() + enrollment.status.slice(1);
    return progress(enrollment).done ? 'In progress' : 'Not started';
  }
  const button = (action, label, extra = '', secondary = false) => `<button type="button" class="lh-button${secondary ? ' lh-button-secondary' : ''}" data-lh-action="${action}" ${extra}>${label}</button>`;
  function intro() {
    return `<div class="lh-heading"><div><p class="lh-eyebrow">Your learner space</p><h1>My learning</h1><p>Your courses, achievements and learning record — together.</p></div><button type="button" class="lh-text-button" data-lh-action="browse">Explore courses <i class="fas fa-arrow-right" aria-hidden="true"></i></button></div>`;
  }
  function render() {
    const host = byId('myLearningView');
    if (!host || !snapshot?.user) return;
    const enrollments = snapshot.enrollments || [], certificates = certificateList();
    const completed = enrollments.filter(item => item.status === 'completed').length;
    const user = snapshot.user;
    host.innerHTML = `<div class="learner-hub">${intro()}
      <section class="lh-profile" aria-label="Learner profile"><div class="lh-avatar" aria-hidden="true">${esc((user.name || user.email || 'L').trim().slice(0,1).toUpperCase())}</div><div class="lh-profile-name"><p>Welcome back</p><h2>${esc(user.name || 'Learner')}</h2>${user.email ? `<span>${esc(user.email)}</span>` : ''}</div><div class="lh-profile-actions">${button('print-card','Print student card','',true)}${button('print-record','Print course record','',true)}</div></section>
      <div class="lh-stats"><div><strong>${enrollments.length}</strong><span>Enrolled courses</span></div><div><strong>${completed}</strong><span>Completed courses</span></div><div><strong>${certificates.length}</strong><span>Issued certificates</span></div></div>
      <div class="lh-tabs" role="tablist" aria-label="Learning area"><button type="button" role="tab" id="lh-courses-tab" aria-controls="lh-panel" aria-selected="${activeTab === 'courses'}" tabindex="${activeTab === 'courses' ? '0' : '-1'}" data-lh-action="tab-courses">My courses <span>${enrollments.length}</span></button><button type="button" role="tab" id="lh-certificates-tab" aria-controls="lh-panel" aria-selected="${activeTab === 'certificates'}" tabindex="${activeTab === 'certificates' ? '0' : '-1'}" data-lh-action="tab-certificates">Certificates <span>${certificates.length}</span></button></div>
      <section id="lh-panel" role="tabpanel" aria-labelledby="lh-${activeTab}-tab" tabindex="0">${activeTab === 'courses' ? coursesMarkup(enrollments, certificates) : certificatesMarkup(certificates)}</section>
      <p class="lh-footnote">Your student card identifies your Lernoto account. Certificates confirm completion of individual courses and are not government- or TEVETA-accredited qualifications.</p>
    </div>`;
  }
  function coursesMarkup(enrollments, certificates) {
    if (!enrollments.length) return `<div class="lh-empty"><span class="lh-empty-icon" aria-hidden="true"><i class="fas fa-book-open"></i></span><h2>Your next chapter starts with one course.</h2><p>Choose a skill to begin. Your progress will appear here once you enrol.</p>${button('browse','Find a course')}</div>`;
    return `<div class="lh-course-list">${enrollments.map(enrollment => {
      const course = courseFor(enrollment.courseId), p = progress(enrollment), status = statusText(enrollment);
      const cert = certificates.find(item => item.certId === enrollment.certId || item.courseId === enrollment.courseId);
      const available = course && !['pending','pending_payment','awaiting_payment','cancelled','canceled','failed','refunded'].includes(enrollment.status);
      return `<article class="lh-course"><div class="lh-course-content"><div class="lh-course-top"><span class="lh-status${enrollment.status === 'completed' ? ' lh-status-completed' : ''}">${esc(status)}</span><span class="lh-date">Enrolled ${esc(dateText(enrollment.createdAt))}</span></div><h2>${esc(course?.title || enrollment.courseTitle || enrollment.courseId)}</h2>${p.total ? `<div class="lh-progress" role="progressbar" aria-label="Lesson progress" aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percent}%"></span></div><p class="lh-progress-label">${p.done} of ${p.total} lessons completed <strong>${p.percent}%</strong></p>` : '<p class="lh-progress-label">Lesson details are not available for this course.</p>'}${enrollment.status === 'completed' ? `<p class="lh-result">Final result: ${esc(scoreText(enrollment.scorePercent))}${!cert ? ' · Certificate not available yet' : ''}</p>` : ''}</div><div class="lh-course-actions">${available ? button('learn',enrollment.status === 'completed' ? 'Review course' : p.done ? 'Continue learning' : 'Start learning',`data-course-id="${esc(enrollment.courseId)}"`) : ''}${cert ? button('view-certificate','View certificate',`data-cert-id="${esc(cert.certId)}"` ,true) : ''}</div></article>`;
    }).join('')}</div>`;
  }
  function certificatesMarkup(certificates) {
    if (!certificates.length) return `<div class="lh-empty"><span class="lh-empty-icon" aria-hidden="true"><i class="fas fa-award"></i></span><h2>A place for every achievement.</h2><p>Complete a course and its assessment to earn a certificate. Issued certificates will appear here.</p>${button('tab-courses','Go to my courses')}</div>`;
    return `<div class="lh-certificate-grid">${certificates.map(cert => `<article class="lh-certificate-card"><div class="lh-certificate-mark" aria-hidden="true"><i class="fas fa-award"></i></div><span class="lh-eyebrow">Certificate of Completion</span><h2>${esc(cert.courseTitle || courseFor(cert.courseId)?.title || 'Course completion')}</h2><p>${esc(cert.userName || snapshot.user.name || 'Learner')}</p><dl><div><dt>Issued</dt><dd>${esc(dateText(cert.issuedAt))}</dd></div><div><dt>Result</dt><dd>${esc(scoreText(cert.scorePercent))}</dd></div></dl><p class="lh-certificate-code">${esc(cert.certId)}</p><div class="lh-certificate-actions">${button('view-certificate','View / download',`data-cert-id="${esc(cert.certId)}"`)}${button('print-certificate','Print',`data-cert-id="${esc(cert.certId)}"`,true)}</div></article>`).join('')}</div>`;
  }
  async function openHub() {
    const id = ++requestId;
    if (window.OA?.showStudentView?.() === false) { snapshot = null; return; }
    const host = byId('myLearningView');
    if (!host) return;
    host.innerHTML = `<div class="learner-hub">${intro()}<div class="lh-empty" role="status"><span class="lh-loading" aria-hidden="true"></span><p>Loading your learning record…</p></div></div>`;
    try {
      if (!window.OA?.getStudentSnapshot) throw new Error('Student area unavailable');
      const data = await window.OA.getStudentSnapshot();
      if (id !== requestId) return;
      snapshot = data;
      if (!data?.user) {
        host.innerHTML = `<div class="learner-hub">${intro()}<div class="lh-empty"><h2>Your learning, in one place.</h2><p>Log in to see your courses, download earned certificates and print your student card.</p>${button('sign-in','Log in to my learning')}</div></div>`;
        return;
      }
      render();
    } catch (_) {
      if (id !== requestId) return;
      snapshot = null;
      host.innerHTML = `<div class="learner-hub">${intro()}<div class="lh-empty" role="alert"><h2>We could not load your learning record.</h2><p>Your courses have not been changed. Please try again.</p>${button('retry','Try again')}</div></div>`;
    }
  }
  function printDocument(markup, kind) {
    let root = byId('lernoto-print-root');
    if (!root) { root = document.createElement('div'); root.id = 'lernoto-print-root'; document.body.append(root); }
    root.className = `lh-print-${kind}`;
    root.innerHTML = markup;
    let pageStyle = byId('lernoto-print-page');
    if (!pageStyle) { pageStyle = document.createElement('style'); pageStyle.id = 'lernoto-print-page'; document.head.append(pageStyle); }
    pageStyle.textContent = kind === 'certificate' ? '@page { size: A4 landscape; margin: 0; }' : '@page { size: A4 portrait; margin: 12mm; }';
    document.body.classList.add('lh-printing');
    try { window.print(); } catch (_) { document.body.classList.remove('lh-printing'); pageStyle.remove(); }
  }
  async function refreshForPrint() {
    try {
      const data = await window.OA?.getStudentSnapshot?.();
      if (!data?.user) { snapshot = null; await openHub(); return false; }
      snapshot = data; return true;
    } catch (_) {
      const host = byId('myLearningView');
      const old = host?.querySelector('.lh-print-error'); old?.remove();
      const error = document.createElement('p'); error.className = 'lh-print-error'; error.setAttribute('role','alert'); error.textContent = 'We could not verify the latest record. Please retry printing.';
      host?.querySelector('.learner-hub')?.prepend(error);
      return false;
    }
  }
  async function printableBrand() {
    const emblem = window.LernotoBrand?.emblemDataUrl;
    try {
      if (!/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(emblem || '')) throw new Error('Emblem unavailable');
      const image = new Image();
      image.src = emblem;
      await image.decode();
      return `<img class="lh-print-emblem" src="${esc(emblem)}" width="48" height="48" alt="Lernoto academic crest">`;
    } catch (_) {
      const host = byId('myLearningView');
      host?.querySelector('.lh-print-error')?.remove();
      const error = document.createElement('p'); error.className = 'lh-print-error'; error.setAttribute('role','alert'); error.textContent = 'The Lernoto emblem could not be loaded. Refresh the page and try printing again.';
      host?.querySelector('.learner-hub')?.prepend(error);
      return null;
    }
  }
  async function printStudentCard() {
    if (!await refreshForPrint()) return;
    const brand = await printableBrand(); if (!brand) return;
    const user = snapshot.user;
    printDocument(`<section class="lh-printed-card"><header><div class="lh-print-brand">${brand}<strong>LERNOTO</strong></div><span>Student card</span></header><div class="lh-printed-card-body"><p>LEARN IT. PROVE IT.</p><h1>${esc(user.name || 'Learner')}</h1>${user.email ? `<div>${esc(user.email)}</div>` : ''}<dl><dt>Lernoto student ID</dt><dd>${esc(user.uid)}</dd></dl></div><footer>For identification within Lernoto. This is not a government-issued identity document.</footer></section>`, 'card');
  }
  async function printCourseRecord() {
    if (!await refreshForPrint()) return;
    const brand = await printableBrand(); if (!brand) return;
    const user = snapshot.user, certificates = certificateList();
    printDocument(`<section class="lh-printed-record"><div class="lh-record-brand"><div class="lh-print-brand">${brand}<strong>LERNOTO</strong></div><span>Learning record</span></div><h1>${esc(user.name || 'Learner')}</h1><p>${esc(user.email || '')}</p><p class="lh-record-id">Learner ID: ${esc(user.uid)}<br>Record prepared: ${esc(dateText(new Date()))}</p><table><thead><tr><th>Course</th><th>Status</th><th>Progress</th><th>Result</th><th>Enrolled</th><th>Certificate</th></tr></thead><tbody>${(snapshot.enrollments || []).map(enrollment => {
      const p = progress(enrollment), cert = certificates.find(item => item.certId === enrollment.certId || item.courseId === enrollment.courseId);
      return `<tr><td>${esc(courseFor(enrollment.courseId)?.title || enrollment.courseTitle || enrollment.courseId)}</td><td>${esc(statusText(enrollment))}</td><td>${p.total ? `${p.done}/${p.total} lessons` : 'Not recorded'}</td><td>${enrollment.status === 'completed' ? esc(scoreText(enrollment.scorePercent)) : '—'}</td><td>${esc(dateText(enrollment.createdAt))}</td><td>${cert ? `${esc(cert.certId)}<br>Issued ${esc(dateText(cert.issuedAt))}` : 'Not issued / unavailable'}</td></tr>`;
    }).join('') || '<tr><td colspan="6">No course enrolments recorded.</td></tr>'}</tbody></table><p class="lh-record-notice">This record reflects your Lernoto account at the time of printing. It is not a government- or TEVETA-accredited qualification.</p></section>`, 'record');
  }
  function certificateMarkup(cert, sample = false, qrDataUrl = null) {
    const record = {...cert, userName: sample ? 'Your Name' : cert.userName || snapshot?.user?.name || 'Learner'};
    const verify = sample ? '' : new URL('verify.html', location.href).href + '?id=' + encodeURIComponent(cert.certId);
    return window.LernotoCertificate.render(record, {sample, verifyUrl:verify, qrDataUrl});
  }
  function showCertificateExample(courseId) {
    const course = (window.COURSES || []).find(item => item.id === courseId) || (window.COURSES || [])[0];
    if (!course) return;
    sampleCourse = course;
    let dialog = byId('lh-certificate-example');
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'lh-certificate-example'; dialog.className = 'lh-example-dialog'; document.body.append(dialog); dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }); }
    dialog.innerHTML = `<div class="lh-example-heading"><div><p class="lh-eyebrow">See what you can earn</p><h1 id="lh-example-title">Your certificate, after completion</h1></div><button type="button" class="lh-dialog-close" aria-label="Close certificate example" data-lh-action="close-example"><i class="fas fa-xmark" aria-hidden="true"></i></button></div><p class="lh-example-copy">This sample shows the certificate design for ${esc(course.title)}. Your name, actual result, issue date and verification code are added only when you successfully complete the course.</p>${certificateMarkup({courseTitle:course.title,level:course.level},true)}<div class="lh-example-actions">${button('download-sample','Download sample PDF')}${button('close-example','Back to the course','',true)}</div><p class="lh-example-format">A4 landscape · The same design on screen, in your PDF and in print.</p>`;
    dialog.setAttribute('aria-labelledby','lh-example-title');
    if (!dialog.open) dialog.showModal();
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-lh-action]');
    if (!target) return;
    const action = target.dataset.lhAction;
    if (action === 'browse') { window.OA?.goHome?.(); return; }
    if (action === 'retry') { openHub(); return; }
    if (action === 'sign-in') { window.openAuth?.('login','Log in to view your courses, certificates and student card.'); return; }
    if (action.startsWith('tab-')) { activeTab = action === 'tab-certificates' ? 'certificates' : 'courses'; render(); byId(`lh-${activeTab}-tab`)?.focus(); return; }
    if (action === 'print-card') { printStudentCard(); return; }
    if (action === 'print-record') { printCourseRecord(); return; }
    if (action === 'download-sample') {
      if (!sampleCourse || target.disabled) return;
      target.disabled = true; const label = target.textContent; target.textContent = 'Preparing PDF…';
      try { await window.LernotoCertificate.download({courseTitle:sampleCourse.title,level:sampleCourse.level}, {sample:true}); }
      catch (_) { let error = byId('lh-sample-error'); if (!error) { error = document.createElement('p'); error.id = 'lh-sample-error'; error.setAttribute('role','alert'); error.className = 'lh-sample-download-error'; byId('lh-certificate-example')?.append(error); } error.textContent = 'The PDF could not be prepared. Please try again.'; }
      finally { target.disabled = false; target.textContent = label; }
      return;
    }
    if (action === 'close-example') { byId('lh-certificate-example')?.close(); return; }
    if (action === 'learn') { window.OA?.openLearn?.(target.dataset.courseId); return; }
    if (action === 'view-certificate' || action === 'print-certificate') {
      if (!await refreshForPrint()) return;
      const cert = certificateList().find(item => item.certId === target.dataset.certId);
      if (!cert) { render(); return; }
      if (action === 'print-certificate') {
        if (!await printableBrand()) return;
        const qr = await window.OA?.certificateQrData?.(cert.certId);
        printDocument(certificateMarkup(cert, false, qr), 'certificate');
      }
      else await window.OA?.viewCertificateById?.(cert.certId, cert.courseId);
    }
  });
  document.addEventListener('keydown', event => {
    if (!event.target.closest('.lh-tabs') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    activeTab = event.key === 'Home' ? 'courses' : event.key === 'End' ? 'certificates' : activeTab === 'courses' ? 'certificates' : 'courses';
    render(); byId(`lh-${activeTab}-tab`)?.focus();
  });
  window.addEventListener('afterprint', () => { document.body.classList.remove('lh-printing'); byId('lernoto-print-page')?.remove(); });
  window.LernotoStudent = {openHub, showCertificateExample, printStudentCard, printCourseRecord};
})();
