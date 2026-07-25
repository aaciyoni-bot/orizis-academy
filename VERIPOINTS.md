# VeriPoints plugin — ORIZIS Academy

Adds the **shared ORIZIS wallet & loyalty points** as an optional second
payment method, on top of Mobile Money. It **reuses** the central VeriPoints
SDK and API contract (`C:\Users\aaciy\projects\VeriPoints`) — it does not
create a new wallet.

## Off by default (safe)
`config.js → VERIPOINTS_ENABLED: false`. While off (the current state), the site
is **exactly** MoMo-only: no VeriPoints button, no SDK download, no console
errors. Verified in-browser. Turning it on is a single flag once the central
project is live.

## What it does when on
- Checkout shows two methods: **Mobile Money** (default) and **VeriPoints**.
- A points balance chip appears in the header when the learner connects their wallet.
- **Pay with points:** the client `hold`s the points on its own wallet (SDK),
  then our **backend** `capture`s them with the secret `serverKey`. The client
  can never move points itself.
- **Earn:** after any successful purchase (MoMo or points), the backend credits
  loyalty points (`EARN_PERCENT`). One account = same balance on every ORIZIS site.

## Currency / regulation decision (important)
The core VeriPoints contract is `1 token = 1 ₪`. Zambia sites use it in
**loyalty-points mode**, decoupled from shekels:
- `REDEEM_RATE` — how many ZMW one point is worth when paying.
- `EARN_PERCENT` — % of a purchase credited back as points.

**Loyalty points (earn + redeem for discount) = low regulatory risk — allowed.**
A wallet that stores **real money** (top-up and hold Kwacha) is **e-money
regulated by the Bank of Zambia** and needs a licensed issuer/partner. So
real-money top-up is intentionally **not** built here — points mode only until
licensing.

## How to enable
**1) Front-end — `config.js`:**
```js
VERIPOINTS_ENABLED: true,
VERIPOINTS_SDK_URL: "https://<central>.web.app/sdk/veripoints-sdk.js",
VERIPOINTS_CONFIG: { apiKey:"…", authDomain:"…", projectId:"…", storageBucket:"…", messagingSenderId:"…", appId:"…" },
VERIPOINTS_ORIGIN: "https://<central>.web.app",
EARN_PERCENT: 3,
REDEEM_RATE: 1
```
**2) Back-end — Vercel env vars (backend/):**
| Variable | Meaning |
|----------|---------|
| `VERIPOINTS_FUNCTIONS_BASE` | `https://europe-west1-<central>.cloudfunctions.net` |
| `VERIPOINTS_SERVER_KEY` | secret serverKey issued to this site (never commit) |
| `VERIPOINTS_PLATFORM_UID` | wallet uid that receives captured points |
| `VERIPOINTS_REWARD_FN` | reward function name (default `walletReward`) |

Check `GET /api/health` → `"veripointsConfigured": true`.

## One central addition still required
The base VeriPoints contract defines `walletHold / walletCapture / walletRelease
/ walletBalance` — but **no loyalty "reward"** function. To credit earn-points
server-side, add a small central Cloud Function (e.g. `walletReward({ uid,
amount, serverKey, siteId, reference })`) that, in one atomic transaction,
increases `available` and appends a `reward`/`earning` ledger row. Per the
contract's own rule ("if a feature conflicts, update the contract first"),
update `VeriPoints/docs/API-CONTRACT.md` before deploying it. Until it exists,
`/api/vp/reward` safely returns `{ ok:false }` and payments still work.

## Prerequisites (from the central VeriPoints project)
- A dedicated central Firebase project (currently `REPLACE_ME` / temp target).
- Cloud Functions deployed (Blaze plan) or re-wrapped as Vercel serverless.
- A `serverKey` + platform wallet uid issued for `orizis-academy`.

## Reusing this plugin on other ORIZIS Zambia sites
Copy `veripoints.js`, the `config.js` VeriPoints block, the checkout
method-selector markup, and the `backend` `/api/vp/*` endpoints. Change only the
`siteId` (`'orizis-academy'` → e.g. `'zedglow'`) and each site's `serverKey`.
