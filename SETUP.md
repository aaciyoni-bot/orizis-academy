# ORIZIS Academy — Setup Guide

The site works **immediately in demo mode** (no setup needed) — you can browse
courses, enrol (simulated payment), learn, take the exam and generate a
certificate PDF. To make it fully live you need three one-time steps:

1. **Firebase** — real accounts + saved progress + public certificate verification
2. **pawaPay** — real Mobile Money payments
3. **Support details** — your business WhatsApp / email

Everything is configured in **`config.js`** (front-end) and **Vercel env vars**
(back-end). No secret keys are hard-coded anywhere.

---

## 1. Firebase (Auth + Firestore)

Without Firebase the Academy runs on the browser's localStorage (demo). With it,
learners get real accounts, progress syncs across devices, and certificates can
be verified by anyone.

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `orizis-academy`).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** → Production mode → pick a region.
4. **Firestore → Rules** tab → paste the contents of [`firestore.rules`](firestore.rules) → **Publish**.
   (Or with the CLI: `firebase deploy --only firestore:rules`.)
5. **Project settings (⚙️) → General → Your apps → Web app (`</>`)** → register an app.
   Copy the `firebaseConfig` values into the `firebase: { ... }` block in **`config.js`**:
   ```js
   firebase: {
     apiKey: "…",
     authDomain: "orizis-academy.firebaseapp.com",
     projectId: "orizis-academy",
     storageBucket: "orizis-academy.appspot.com",
     messagingSenderId: "…",
     appId: "…"
   }
   ```
   > These web-config values are **public by design** (safe to commit). Security
   > comes from the Firestore rules, not from hiding this config.
6. **Authentication → Settings → Authorized domains** → add your live domain(s):
   `aaciyoni-bot.github.io` (and your custom domain if you add one).

### Loading the course catalog into Firestore (optional)
The catalog also lives in `courses-data.js`, so the site works without touching
Firestore. If you later want to edit courses from the console, create a
`courses` collection and add one document per course using the same fields.

---

## 2. pawaPay (Mobile Money) — the backend

The `backend/` folder is a small Vercel service that charges MTN / Airtel /
Zamtel via pawaPay. Until you add a token it returns "simulated" and the site
fakes the payment.

**Deploy:**
```bash
cd backend
npx vercel link --yes --project orizis-academy
npx vercel --prod --yes
```
Then in **Vercel → Project → Settings → Environment Variables** add:

| Variable        | Value                                  |
|-----------------|----------------------------------------|
| `PAWAPAY_TOKEN` | your pawaPay API token                 |
| `PAWAPAY_ENV`   | `production` (or `sandbox` for testing) |

Redeploy after adding them. Check it is live: open
`https://orizis-academy.vercel.app/api/health` — you should see
`"paymentsConfigured": true`.

Finally set `API_BASE_URL` in `config.js` to your Vercel URL.

> **Note on payment security:** enrolments are currently created by the browser
> after a successful charge. For hardening, move enrolment creation to a
> pawaPay callback/webhook on the backend so an enrolment can only exist after a
> confirmed payment. The Firestore rules already lock certificates to learners
> who have a *completed* enrolment.

---

## 3. Support details

In `config.js` set:
- `WHATSAPP_SUPPORT` — a **business** number in international format (e.g. `2609xxxxxxx`). Do not use a private number.
- `SUPPORT_EMAIL` — your support inbox.
- `BUILDER_NETWORK_URL` — where "Apply to the ORIZIS Builder Network" points (a form, page or `mailto:`).

---

## Deploy the site (GitHub Pages)

```bash
git add -A && git commit -m "Update" && git push
```
Pages serves `main` at <https://aaciyoni-bot.github.io/orizis-academy/>.

### Optional custom domain
Add a `CNAME` file with your domain, then at your registrar point 4 A records
`@ → 185.199.108/109/110/111.153` and a CNAME `www → aaciyoni-bot.github.io`.
HTTPS is issued automatically by GitHub.

---

## Legal note (important)

ORIZIS Academy issues **Certificates of Completion** only. The site and
certificate must **never** claim government or **TEVETA** accreditation, a
diploma, or a recognized degree. In Zambia, TEVETA regulates accredited
vocational training — pursuing real TEVETA accreditation is a possible future
step, but until then all wording stays as "Certificate of Completion".
