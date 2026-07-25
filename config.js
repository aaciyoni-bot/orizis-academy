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
    firebase: {
        apiKey: "",
        authDomain: "",
        projectId: "",
        storageBucket: "",
        messagingSenderId: "",
        appId: ""
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
