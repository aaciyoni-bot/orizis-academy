/* One landscape certificate design for the browser, printing and PDF export. */
(() => {
  'use strict';
  const W = 842, H = 595;
  let sequence = 0, measureContext;
  const xml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  const serif = 'Georgia, Times New Roman, serif';
  const sans = 'Arial, Helvetica, sans-serif';
  function width(text, size, family, weight = 400) {
    try {
      if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
      if (measureContext) { measureContext.font = `${weight} ${size}px ${family}`; return measureContext.measureText(text).width; }
    } catch (_) {}
    return [...text].reduce((n, char) => n + (/\s/.test(char) ? .28 : /[MW@]/.test(char) ? .87 : /[ilI.,'!]/.test(char) ? .29 : .56), 0) * size;
  }
  function wrap(text, size, maxWidth, family, weight) {
    const words = clean(text).split(/\s+/), lines = [];
    let line = '';
    for (const word of words) {
      if (width(word, size, family, weight) > maxWidth) {
        if (line) { lines.push(line); line = ''; }
        for (const char of [...word]) {
          if (line && width(line + char, size, family, weight) > maxWidth) { lines.push(line); line = ''; }
          line += char;
        }
      } else if (line && width(line + ' ' + word, size, family, weight) > maxWidth) { lines.push(line); line = word; }
      else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function fitted(text, {size, min, width:maxWidth, lines:maxLines, family = sans, weight = 400}) {
    let lines = [];
    for (let current = size; current >= min; current -= .5) {
      lines = wrap(text, current, maxWidth, family, weight);
      if (lines.length <= maxLines) return {lines, size:current, compressed:false};
    }
    // Keep every character even in unusually long stored names/titles.
    const characters = [...clean(text)], perLine = Math.ceil(characters.length / maxLines);
    lines = Array.from({length:maxLines}, (_, index) => characters.slice(index * perLine, (index + 1) * perLine).join('')).filter(Boolean);
    return {lines, size:min, compressed:true};
  }
  function textBlock(text, {x = 421, y, size, min = size, maxWidth, maxLines = 1, lineHeight, family = sans, weight = 400, fill = '#263744', anchor = 'middle'}) {
    const fit = fitted(text, {size, min, width:maxWidth, lines:maxLines, family, weight});
    const leading = lineHeight || fit.size * 1.16;
    const first = y - (fit.lines.length - 1) * leading / 2;
    return fit.lines.map((line, index) => `<text x="${x}" y="${(first + index * leading).toFixed(2)}" text-anchor="${anchor}" font-family="${family}" font-size="${fit.size}" font-weight="${weight}" fill="${fill}"${fit.compressed ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : ''}>${xml(line)}</text>`).join('');
  }
  function date(value) {
    if (value === undefined || value === null || value === '') return '';
    try {
      const parsed = typeof value.toDate === 'function' ? value.toDate() : new Date(typeof value === 'object' && Number.isFinite(value.seconds) ? value.seconds * 1000 : value);
      return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
    } catch (_) { return ''; }
  }
  function score(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? `${Number(value)}%` : ''; }
  function logo(prefix) {
    // Inline geometry and gradients from Lernoto's existing icon.svg.
    return `<svg x="391" y="42" width="60" height="60" viewBox="0 0 1024 1024" aria-hidden="true"><defs>
      <radialGradient id="${prefix}-badge" cx="0.3" cy="0.22" r="0.95"><stop offset="0" stop-color="#6f7ce8"/><stop offset="0.36" stop-color="#3c46c4"/><stop offset="0.72" stop-color="#242a8e"/><stop offset="1" stop-color="#111544"/></radialGradient>
      <linearGradient id="${prefix}-logo-gold" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#fff4cd"/><stop offset="0.34" stop-color="#f3cd68"/><stop offset="0.7" stop-color="#c9992c"/><stop offset="1" stop-color="#8e6714"/></linearGradient>
      <linearGradient id="${prefix}-logo-gold2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8c25c"/><stop offset="0.5" stop-color="#b7871d"/><stop offset="1" stop-color="#7d5a10"/></linearGradient>
      </defs><circle cx="512" cy="512" r="450" fill="url(#${prefix}-badge)"/><circle cx="512" cy="512" r="450" fill="none" stroke="url(#${prefix}-logo-gold)" stroke-width="24"/><circle cx="512" cy="512" r="410" fill="none" stroke="url(#${prefix}-logo-gold2)" stroke-width="14" stroke-dasharray="6 22" opacity="0.85"/><path d="M118 448 A450 450 0 0 1 542 62 A450 450 0 0 0 140 548 Z" fill="#fff" opacity="0.16"/><path d="M362 528 H662 V636 C662 700 592 730 512 730 C432 730 362 700 362 636 Z" fill="url(#${prefix}-logo-gold2)"/><path d="M362 528 H430 V690 C398 676 362 660 362 636 Z" fill="#fff" opacity="0.2"/><path d="M512 320 L836 448 L512 576 L188 448 Z" fill="url(#${prefix}-logo-gold)"/><path d="M512 320 L836 448 L512 576 Z" fill="#8e6714" opacity="0.25"/><path d="M836 448 V680 C836 706 812 720 800 748" fill="none" stroke="url(#${prefix}-logo-gold2)" stroke-width="16" stroke-linecap="round"/><circle cx="836" cy="452" r="22" fill="url(#${prefix}-logo-gold)"/><path d="M772 748 H830 L818 838 C816 856 786 856 784 838 Z" fill="url(#${prefix}-logo-gold)"/></svg>`;
  }
  function rosette(cx, cy, outer, inner) {
    return Array.from({length:64}, (_, index) => { const angle = index / 64 * Math.PI * 2 - Math.PI / 2, r = index % 2 ? inner : outer; return `${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`; }).join(' ');
  }
  function sealLettering(text, {cx, cy, radius, size, spacing, bottom = false}) {
    // Arial Bold advances keep this small brand mark stable across SVG renderers.
    // Each glyph follows the original circular baseline without textPath support.
    const advances = {' ': .27783, '·': .27783, A: .72217, E: .66699, G: .77783, L: .61084, N: .72217, O: .77783, P: .66699, R: .72217, T: .61084, V: .66699, W: .94385};
    const letters = [...text], widths = letters.map(letter => (advances[letter] || .66699) * size);
    const total = widths.reduce((sum, value) => sum + value, 0) + spacing * (letters.length - 1);
    let offset = -total / 2;
    const glyphs = letters.map((letter, index) => {
      const distance = offset + widths[index] / 2;
      offset += widths[index] + spacing;
      if (letter === ' ') return '';
      const angle = bottom ? Math.PI / 2 - distance / radius : Math.PI * 1.5 + distance / radius;
      const x = (cx + radius * Math.cos(angle)).toFixed(3), y = (cy + radius * Math.sin(angle)).toFixed(3);
      const rotation = ((bottom ? angle - Math.PI / 2 : angle - Math.PI * 1.5) * 180 / Math.PI).toFixed(3);
      return `<text x="${x}" y="${y}" text-anchor="middle" transform="rotate(${rotation} ${x} ${y})" aria-hidden="true">${xml(letter)}</text>`;
    }).join('');
    return `<g role="img" aria-label="${xml(text)}" font-family="${sans}" font-size="${size}" font-weight="700" fill="#76501c">${glyphs}</g>`;
  }
  function svg(cert = {}, options = {}) {
    const sample = !!options.sample, prefix = `lnc-${++sequence}`;
    const name = sample ? 'Your Name' : clean(cert.userName) || 'Name not recorded';
    const course = clean(cert.courseTitle) || 'Course title not recorded';
    const issued = sample ? '' : date(cert.issuedAt), result = sample ? '' : score(cert.scorePercent), id = sample ? '' : clean(cert.certId);
    const level = clean(cert.level);
    const url = !sample && /^https?:\/\//i.test(options.verifyUrl || '') ? clean(options.verifyUrl) : '';
    const qr = !sample && id && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(options.qrDataUrl || '') ? options.qrDataUrl : '';
    const subtitle = [level, result ? `Result: ${result}` : ''].filter(Boolean).join('  ·  ');
    const sampleDescription = sample ? 'Sample certificate only. No qualification or certificate has been issued.' : `Certificate of Completion for ${name}, ${course}.${issued ? ` Issued ${issued}.` : ''}${id ? ` Certificate ID ${id}.` : ''}`;
    const corner = '<path d="M0 43V0H43 M8 30V8H30 M0 16C12 16 16 12 16 0 M24 0C24 14 14 24 0 24" fill="none" stroke="#af8232" stroke-width="1.15"/><path d="M7 43V34C24 33 33 24 34 7H43" fill="none" stroke="#d6b76b" stroke-width=".65"/><circle cx="8" cy="8" r="2" fill="#a97c2d"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="842" height="595" viewBox="0 0 842 595" role="img" aria-labelledby="${prefix}-title ${prefix}-description">
      <title id="${prefix}-title">${sample ? 'Sample — ' : ''}Lernoto Certificate of Completion</title><desc id="${prefix}-description">${xml(sampleDescription)}</desc>
      <defs>
        <linearGradient id="${prefix}-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffefa"/><stop offset=".55" stop-color="#fffdf7"/><stop offset="1" stop-color="#f6f0e3"/></linearGradient>
        <linearGradient id="${prefix}-gold" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#9c6d20"/><stop offset=".2" stop-color="#e4c77f"/><stop offset=".42" stop-color="#b88b36"/><stop offset=".66" stop-color="#f5df9e"/><stop offset="1" stop-color="#ab7a28"/></linearGradient>
        <radialGradient id="${prefix}-seal-gold" cx=".35" cy=".25" r=".85"><stop offset="0" stop-color="#fff1b6"/><stop offset=".4" stop-color="#e4bf65"/><stop offset=".76" stop-color="#c49235"/><stop offset="1" stop-color="#e9c975"/></radialGradient>
      </defs>
      <rect width="842" height="595" fill="url(#${prefix}-paper)"/>
      <path d="M0 0H100L0 100Z M842 595H742L842 495Z" fill="#781e32"/>
      <path d="M0 73L73 0M769 595L842 522" stroke="#dab45e" stroke-width="2"/>
      <rect x="19" y="19" width="804" height="557" fill="none" stroke="url(#${prefix}-gold)" stroke-width="3"/>
      <rect x="25" y="25" width="792" height="545" fill="none" stroke="#c5a264" stroke-width=".7"/>
      <rect x="37" y="37" width="768" height="521" fill="none" stroke="#e1d3b4" stroke-width=".65"/>
      <g transform="translate(38 38)">${corner}</g><g transform="translate(804 38) scale(-1 1)">${corner}</g><g transform="translate(38 557) scale(1 -1)">${corner}</g><g transform="translate(804 557) scale(-1 -1)">${corner}</g>
      <path d="M98 43H342 M500 43H744" stroke="#c5a15a" stroke-width=".6"/><path d="M108 47H329 M513 47H734" stroke="#e1d1a8" stroke-width=".4"/>
      ${logo(prefix)}
      <text x="421" y="122" text-anchor="middle" font-family="${sans}" font-size="17" font-weight="700" letter-spacing="5" fill="#273448">LERNOTO</text>
      <text x="421" y="173" text-anchor="middle" font-family="${serif}" font-size="39" fill="#283445">Certificate of Completion</text>
      <text x="421" y="196" text-anchor="middle" font-family="${sans}" font-size="8.5" letter-spacing="3.2" fill="#875d24">LEARN IT. PROVE IT.</text>
      <path d="M288 215H393 M449 215H554" stroke="#b28a42" stroke-width=".8"/><path d="M405 215l16-4 16 4-16 4z" fill="none" stroke="#b28a42" stroke-width=".8"/><circle cx="421" cy="215" r="1.8" fill="#9e7130"/>
      ${sample ? '<text x="421" y="362" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="102" font-weight="700" letter-spacing="12" fill="#f8f3e8" transform="rotate(-14 421 335)">SAMPLE</text>' : ''}
      <text x="421" y="245" text-anchor="middle" font-family="${serif}" font-size="13" font-style="italic" fill="#68706e">This certifies that</text>
      ${textBlock(name,{y:284,size:32,min:18,maxWidth:650,maxLines:2,family:serif,weight:700,fill:'#253548'})}
      <path d="M222 314H620" stroke="#ddcba8" stroke-width=".7"/>
      <text x="421" y="337" text-anchor="middle" font-family="${sans}" font-size="11" fill="#66716c">has successfully completed the online course</text>
      ${textBlock(course,{y:371,size:20,min:13,maxWidth:660,maxLines:3,lineHeight:21,family:serif,weight:700,fill:'#253548'})}
      ${subtitle ? textBlock(subtitle,{y:414,size:10.5,min:8,maxWidth:600,maxLines:1,fill:'#696d61'}) : ''}
      ${sample ? '<text x="421" y="435" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8.5" font-weight="700" letter-spacing="1.1" fill="#8c2d3d">SAMPLE — FOR PREVIEW ONLY · NOT ISSUED</text>' : '<path d="M80 438H333 M509 438H762" stroke="#ddcda8" stroke-width=".6"/>'}
      ${sample ? `<text x="79" y="477" font-family="${sans}" font-size="9.5" fill="#59645e">Personalised after successful completion</text><text x="79" y="495" font-family="${sans}" font-size="8" fill="#7b7d6f">Your real issue date, result and verification</text><text x="79" y="508" font-family="${sans}" font-size="8" fill="#7b7d6f">details will appear on the issued certificate.</text>` : `<text x="78" y="464" font-family="${sans}" font-size="7.5" letter-spacing="1.2" fill="#8a794e">DATE OF ISSUE</text>${textBlock(issued || 'Not recorded',{x:78,y:480,size:10.5,min:8,maxWidth:250,anchor:'start',weight:700,fill:'#334438'})}<text x="78" y="501" font-family="${sans}" font-size="7.5" letter-spacing="1.2" fill="#8a794e">CERTIFICATE ID</text>${textBlock(id || 'Not recorded',{x:78,y:517,size:9,min:7,maxWidth:245,maxLines:2,lineHeight:10,anchor:'start',weight:700,fill:'#334438'})}`}
      <path d="M400 505L391 541l17-7 10 11 9-40M425 505l8 40 10-11 17 7-12-37" fill="#862338"/>
      <path d="M403 509l-6 23M438 509l6 23" stroke="#cda04e" stroke-width="1.1"/>
      <polygon points="${rosette(421,484,43,39)}" fill="url(#${prefix}-gold)" stroke="#a97828" stroke-width=".7"/>
      <circle cx="421" cy="484" r="36" fill="url(#${prefix}-seal-gold)" stroke="#b68b37" stroke-width=".8"/>
      <circle cx="421" cy="484" r="31.5" fill="none" stroke="#fce7a2" stroke-width="1"/><circle cx="421" cy="484" r="27" fill="none" stroke="#ad8232" stroke-width=".6"/>
      ${sealLettering('LERNOTO',{cx:421,cy:484,radius:30,size:6.2,spacing:1.45})}
      ${sealLettering('LEARN · PROVE · GROW',{cx:421,cy:486,radius:28,size:5.2,spacing:.8,bottom:true})}
      <path d="M402 480l19-8 19 8-19 8z M410 486v8c6 4 16 4 22 0v-8 M440 481v13" fill="none" stroke="#80591f" stroke-width="1.5" stroke-linejoin="round"/>
      <g transform="translate(${qr ? 592 : 671} 484) rotate(-10)"><circle r="32" fill="none" stroke="#8e3041" stroke-width="1.4"/><circle r="27.5" fill="none" stroke="#a44855" stroke-width=".6"/><path d="M-21-10H21M-21 10H21" stroke="#a44855" stroke-width=".6"/><text y="3" text-anchor="middle" font-family="${serif}" font-size="10.2" font-weight="700" letter-spacing=".5" fill="#8b2d3e">LERNOTO</text><text y="-16" text-anchor="middle" font-family="${sans}" font-size="4.9" letter-spacing=".6" fill="#8b2d3e">LEARN IT.</text><text y="20" text-anchor="middle" font-family="${sans}" font-size="4.9" letter-spacing=".6" fill="#8b2d3e">PROVE IT.</text></g>
      ${qr ? `<rect x="694" y="449" width="70" height="70" rx="2" fill="#fff" stroke="#e1d5ba" stroke-width=".5"/><image x="699" y="454" width="60" height="60" href="${xml(qr)}" xlink:href="${xml(qr)}"/><text x="729" y="531" text-anchor="middle" font-family="${sans}" font-size="7" fill="#73765f">Scan to verify</text>` : !sample && url ? textBlock(url,{x:669,y:531,size:6.5,min:5.5,maxWidth:217,maxLines:2,lineHeight:8,fill:'#6d715e'}) : ''}
      <text x="421" y="552" text-anchor="middle" font-family="${sans}" font-size="6.6" fill="#76796a">Lernoto Certificate of Completion. Not a government- or TEVETA-accredited qualification.</text>
    </svg>`;
  }
  function render(cert, options = {}) { return `<div class="lnc-certificate${options.sample ? ' lnc-certificate-sample' : ''}">${svg(cert,options)}</div>`; }
  async function createPdf(cert, options = {}) {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) throw new Error('PDF export is not available yet. Please retry.');
    const source = svg(cert, options), canvas = document.createElement('canvas');
    canvas.width = W * 3; canvas.height = H * 3;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not prepare the certificate.');
    const image = new Image(), blob = new Blob([source], {type:'image/svg+xml;charset=utf-8'}), objectUrl = URL.createObjectURL(blob);
    try {
      await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The certificate image could not be prepared.')); image.src = objectUrl; });
      ctx.fillStyle = '#fffdf7'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const pdf = new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true});
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight(),undefined,'FAST');
      pdf.setProperties({title:options.sample ? 'Sample — Lernoto Certificate of Completion' : `Lernoto Certificate of Completion — ${clean(cert.courseTitle)}`,subject:'Certificate of Completion',creator:'Lernoto',author:'Lernoto'});
      return pdf;
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  async function download(cert, options = {}) {
    const pdf = await createPdf(cert,options);
    const code = options.sample ? 'Sample' : clean(cert.certId).replace(/[^A-Za-z0-9_-]/g,'').slice(0,100) || 'Completion';
    pdf.save(`Lernoto-Certificate-${code}.pdf`);
    return pdf;
  }
  window.LernotoCertificate = {render,svg,createPdf,download};
})();
