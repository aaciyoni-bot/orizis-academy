# Lernoto 🎓🇿🇲

Affordable online skills courses for Zambia. Learners study on their phone,
pay a small fee with **Mobile Money**, pass a short exam, and earn a
**Certificate of Completion** with a unique, verifiable code.

Part of the **ORIZIS TECHNOLOGY** family (shares the ORIZIS intro splash).

## What it does
- **24 courses** across 13 fields — web building, digital marketing, freelancing,
  commerce & Mobile Money, English, CV & interviews, farming, tailoring, beauty and more.
- Each course ≈ **1 hour**: short lessons → progress tracking → a final exam (**70% to pass**).
- **Certificate of Completion** generated as a PDF (jsPDF) with the learner's name,
  course, date, a unique code and a QR that links to public verification.
- **Verify page** (`verify.html?id=CODE`) confirms a certificate is genuine.
- **ORIZIS Builder Network** — top web-building graduates can *apply* for paid project work.
- Installable PWA, Mobile Money checkout (MTN / Airtel / Zamtel via pawaPay).

## Architecture
| File | Purpose |
|------|---------|
| `index.html` | App shell (markup, styles, library includes) |
| `app.js` | LMS engine — auth, enrolment, learning, exam, certificate/QR/PDF |
| `courses-data.js` | The catalog (`window.COURSES`) — auto-generated, editable |
| `config.js` | Firebase config, backend URL, support details |
| `verify.html` | Public certificate verification |
| `firestore.rules` | Locked database rules (public course read; owner-only enrolments; verifiable, immutable certificates) |
| `backend/` | Vercel service charging Mobile Money via pawaPay |

**Data:** Firebase Auth + Firestore when configured; otherwise a **demo mode**
runs entirely on `localStorage` so the whole flow works out of the box.

## Run locally
Open `index.html` with any static server, e.g.:
```bash
npx serve .
```

## Go live
See **[SETUP.md](SETUP.md)** — Firebase, pawaPay and support details are the
only three one-time steps. Deploy the site with `git push` (GitHub Pages) and
the backend with `npx vercel --prod` from `backend/`.

## Legal
Lernoto issues **Certificates of Completion** only — **not** government-
or TEVETA-accredited qualifications, diplomas or degrees. All wording across the
site and certificate reflects this.
