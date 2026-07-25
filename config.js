/* ================================================================
   ORIZIS ACADEMY — shared configuration
   Loaded by index.html (the app) and verify.html (certificate check).
   ================================================================ */
window.OA_CONFIG = {

    // Payment backend (Vercel server.js that charges Mobile Money via pawaPay).
    // Leave "" to force simulated enrolment.
    API_BASE_URL: "https://orizis-academy.vercel.app",

    // Firebase project (Auth + Firestore). Fill these in AFTER you create the
    // project in the Firebase console (see SETUP.md). While every value is
    // empty the Academy runs in DEMO mode using the browser's localStorage:
    // you can browse, enrol, learn, take the exam and generate a certificate,
    // but accounts and public certificate verification need Firebase.
    // Shared "Zed Zambia" Firebase (project zedmall-4301c) — one backend for
    // the whole ORIZIS Zambia family. Academy uses its own collections
    // (enrollments, certificates). Rules are in zedtickets-site/firestore.rules.
    firebase: {
        apiKey: "AIzaSyAqkEfNwKZzofId0XCGcs17sVFh5NYryrM",
        authDomain: "zedmall-4301c.firebaseapp.com",
        projectId: "zedmall-4301c",
        storageBucket: "zedmall-4301c.firebasestorage.app",
        messagingSenderId: "24400915808",
        appId: "1:24400915808:web:cd5675e846250c4e808205"
    },

    // Support (shown only in the Support section — no floating button).
    // Use a BUSINESS number, not a private one.
    WHATSAPP_SUPPORT: "260970000000",
    SUPPORT_EMAIL: "academy@orizis.com",

    // Where "Join the ORIZIS Builder Network" points (form / page / email link).
    BUILDER_NETWORK_URL: "mailto:academy@orizis.com?subject=ORIZIS%20Builder%20Network%20application",

    /* ============================================================
       VeriPoints — shared ORIZIS wallet & loyalty (OPTIONAL PLUGIN)
       ------------------------------------------------------------
       Master switch. While false (default) the site is 100% MoMo-only:
       no VeriPoints UI, no SDK load, no behaviour change at all.
       Flip to true ONLY after the central VeriPoints project is live
       and the values below are filled in (see VERIPOINTS.md).
       ============================================================ */
    VERIPOINTS_ENABLED: false,

    // URL of the shared SDK on the CENTRAL VeriPoints project
    // e.g. "https://<central>.web.app/sdk/veripoints-sdk.js"
    VERIPOINTS_SDK_URL: "",

    // Central VeriPoints Firebase project config (the SDK signs the user in
    // HERE, so the wallet/points are the SAME across every ORIZIS site).
    VERIPOINTS_CONFIG: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
    VERIPOINTS_ORIGIN: "",   // central store origin (for top-up redirects)
    VERIPOINTS_REGION: "europe-west1",

    // Loyalty economics (points mode — NOT real e-money).
    EARN_PERCENT: 3,         // % of each purchase credited back as points
    REDEEM_RATE: 1           // 1 point = this many ZMW when paying with points
};
