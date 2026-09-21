/* One subject-specific image pair per course. Presentation only; no course records are modified. */
(() => {
  'use strict';
  const descriptions = {
    "build-with-claude": "A web builder presenting a boutique website to a business owner in her shop.",
    "web-ai-foundations": "A beginner planning a first web page with paper wireframes beside HTML and a page preview.",
    "web-online-store": "An online shop product grid beside the ceramics and woven goods sold by a small business.",
    "web-integrations": "A developer testing a mobile payment beside the corresponding website order database.",
    "landing-pages": "A designer refining a single-offer landing page with a clear call to action and headline drafts.",
    "orizis-certified-builder": "A web developer presenting three portfolio projects and explaining her work to colleagues.",
    "freelancing-dollars": "Zambian freelancer presenting a completed design project to a remote client on a video call.",
    "digital-marketing": "Marketing professionals arranging search, social, email and content materials on a campaign planning board.",
    "social-media-marketing": "Business owner recording a product reel of a woven handbag using a smartphone on a tripod.",
    "content-branding": "Content creator recording an informative video with a camera and microphone in her studio.",
    "virtual-assistant": "Virtual assistant using a headset, appointment planner, email inbox and calendar to organize client work.",
    "online-store-momo": "Zambian online seller packing a ceramic order beside her digital product catalogue",
    "dropshipping-zambia": "Zambian reseller checking a batch of parcels during a handoff with a local supplier",
    "mobile-money-business": "Market merchant checking a mobile payment on her own phone while a customer waits with his phone",
    "whatsapp-business": "Seller sharing a catalogue of handmade leather sandals through a business chat on her phone",
    "bookkeeping-basics": "Entrepreneur recording transactions in a ledger with a calculator, sorted receipts and a stock sheet",
    "english-for-work": "Professional confidently presenting to attentive colleagues in a workplace meeting.",
    "cv-interviews": "Confident job candidate discussing a printed CV with an interviewer in a bright office.",
    "customer-service": "Shop assistant listening carefully and helping a customer choose a household product.",
    "digital-literacy": "Adult learner using a keyboard and mouse to organise files on a desktop computer.",
    "office-workspace": "Office professional preparing a spreadsheet and presentation alongside an organised printed business report.",
    "start-a-business": "New entrepreneur testing a wooden desk-organiser prototype with a potential customer at a local market",
    "modern-farming": "Farmer inspecting healthy vegetables beside drip irrigation lines on a productive small plot.",
    "tailoring-fashion": "Tailor sewing a colourful patterned garment in an organised workshop with measuring tools.",
    "beauty-business": "Makeup artist using a clean brush on an adult client in a hygienic salon workspace."
};
  const positions = Object.freeze({
    "digital-marketing": "50% 0%",
    "english-for-work": "50% 10%",
    "build-with-claude": "50% 20%",
    "freelancing-dollars": "50% 30%",
    "social-media-marketing": "50% 25%",
    "virtual-assistant": "50% 25%",
    "digital-literacy": "50% 20%",
    "office-workspace": "50% 10%",
    "cv-interviews": "50% 10%",
    "customer-service": "50% 20%",
    "modern-farming": "50% 20%",
    "tailoring-fashion": "50% 20%",
    "beauty-business": "50% 10%",
    "dropshipping-zambia": "50% 20%",
    "online-store-momo": "50% 20%",
    "mobile-money-business": "50% 20%",
    "start-a-business": "50% 20%"
});
  const byId = Object.freeze(Object.fromEntries(Object.entries(descriptions).map(([id, alt]) => {
    const src = `assets/courses/${id}.webp`;
    return [id, Object.freeze({src, srcset: `assets/courses/${id}-small.webp 480w, ${src} 960w`, alt, objectPosition:positions[id] || '50% 50%'})];
  })));
  const fields = Object.freeze({web:'web',computer:'web',marketing:'marketing',service:'marketing',money:'marketing',english:'english',career:'english',finance:'finance',commerce:'finance',business:'finance',agriculture:'finance',tailoring:'marketing',beauty:'marketing'});
  function get(course) {
    const id = typeof course === 'string' ? course : course?.id;
    if (Object.prototype.hasOwnProperty.call(byId, id)) return byId[id];
    // A course added later can still display its existing category artwork.
    const field = typeof course === 'object' && course ? course.field : '';
    const category = Object.prototype.hasOwnProperty.call(fields, field) ? fields[field] : 'web';
    return {src:`assets/course-${category}.webp`,srcset:'',alt:'',objectPosition:'50% 50%'};
  }
  window.LernotoCourseImages = Object.freeze({get, byId});
})();
