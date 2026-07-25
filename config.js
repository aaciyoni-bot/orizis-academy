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
    BUILDER_NETWORK_URL: "mailto:academy@orizis.com?subject=ORIZIS%20Builder%20Network%20application"
};
