const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { randomUUID } = require('crypto');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

/* =====================================================================
   ORIZIS Academy — payment backend (Mobile Money via pawaPay, Zambia)

   Environment variables (Vercel -> Project Settings -> Environment Variables):
     PAWAPAY_TOKEN  - pawaPay API token. When absent, /api/pay reports
                      simulated mode and the site falls back to its built-in
                      enrolment simulation (so the Academy still works in demo).
     PAWAPAY_ENV    - 'sandbox' (default) or 'production'.

   NOTE: there is no RapidAPI / catalog proxy here — the course catalog lives
   in the front-end (courses-data.js) and in Firestore. This server only
   charges Mobile Money for a course enrolment.
   ===================================================================== */

const PAWAPAY_TOKEN = process.env.PAWAPAY_TOKEN;
const PAWAPAY_BASE = process.env.PAWAPAY_ENV === 'production'
    ? 'https://api.pawapay.io'
    : 'https://api.sandbox.pawapay.io';

const PAWAPAY_PROVIDERS = {
    mtn: 'MTN_MOMO_ZMB',
    airtel: 'AIRTEL_OAPI_ZMB',
    zamtel: 'ZAMTEL_ZMB'
};

const pawapayHeaders = () => ({
    Authorization: `Bearer ${PAWAPAY_TOKEN}`,
    'Content-Type': 'application/json'
});

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: 'orizis-academy-backend',
        paymentsConfigured: Boolean(PAWAPAY_TOKEN),
        paymentsEnv: process.env.PAWAPAY_ENV === 'production' ? 'production' : 'sandbox',
        veripointsConfigured: vpConfigured()
    });
});

// Starts a Mobile Money deposit for a course enrolment. The learner then gets
// a PIN prompt on their phone; the site polls /api/pay/status until it resolves.
app.post('/api/pay', async (req, res) => {
    if (!PAWAPAY_TOKEN) return res.json({ simulated: true });

    const { phone, network, amount, course } = req.body || {};
    const provider = PAWAPAY_PROVIDERS[String(network || '').toLowerCase()];
    if (!/^(9|7)\d{8}$/.test(String(phone)) || !(amount > 0) || !provider) {
        return res.status(400).json({ error: 'INVALID_INPUT' });
    }

    const depositId = randomUUID();
    try {
        const r = await axios.post(`${PAWAPAY_BASE}/v2/deposits`, {
            depositId,
            amount: String(Math.round(amount * 100) / 100),
            currency: 'ZMW',
            payer: {
                type: 'MMO',
                accountDetails: { phoneNumber: '260' + phone, provider }
            },
            customerMessage: ('ORIZIS Academy: ' + (course || 'course')).slice(0, 22)
        }, { headers: pawapayHeaders(), timeout: 25000 });

        res.json({ tx_ref: depositId, status: r.data && r.data.status });
    } catch (error) {
        res.status(502).json({
            error: 'PAYMENT_ERROR',
            message: error.message,
            response: error.response ? error.response.data : null
        });
    }
});

// Maps pawaPay deposit statuses onto the simple states the site understands.
app.get('/api/pay/status', async (req, res) => {
    if (!PAWAPAY_TOKEN) return res.json({ simulated: true, status: 'successful' });

    try {
        const r = await axios.get(`${PAWAPAY_BASE}/v2/deposits/${encodeURIComponent(req.query.tx_ref || '')}`, {
            headers: pawapayHeaders(),
            timeout: 20000
        });
        const d = r.data && (r.data.data || (Array.isArray(r.data) ? r.data[0] : r.data));
        const s = String((d && d.status) || 'pending').toUpperCase();
        const status = s === 'COMPLETED' ? 'successful'
            : (s === 'FAILED' || s === 'REJECTED' || s === 'CANCELLED') ? 'failed'
            : 'pending';
        res.json({ status });
    } catch (error) {
        // Status often 404s for a moment right after initiation - treat as pending
        res.json({ status: 'pending' });
    }
});

/* =====================================================================
   VERIPOINTS (optional) — server-side wallet operations
   ---------------------------------------------------------------------
   The client may only READ its balance and HOLD its own points. Actually
   moving points (capture on payment, reward on loyalty) MUST happen here
   with the secret serverKey — never trusting the client.

   Env (all required to enable; otherwise these endpoints report disabled):
     VERIPOINTS_FUNCTIONS_BASE  e.g. https://europe-west1-<central>.cloudfunctions.net
     VERIPOINTS_SERVER_KEY      secret key issued to this site by VeriPoints
     VERIPOINTS_PLATFORM_UID    wallet uid that receives captured points
     VERIPOINTS_REWARD_FN       reward function name (default 'walletReward')
   ===================================================================== */
const VP_BASE = (process.env.VERIPOINTS_FUNCTIONS_BASE || '').replace(/\/$/, '');
const VP_KEY = process.env.VERIPOINTS_SERVER_KEY;
const VP_PLATFORM_UID = process.env.VERIPOINTS_PLATFORM_UID;
const VP_REWARD_FN = process.env.VERIPOINTS_REWARD_FN || 'walletReward';
const vpConfigured = () => Boolean(VP_BASE && VP_KEY && VP_PLATFORM_UID);

// Calls a central VeriPoints callable Cloud Function over REST.
async function vpCall(fnName, data) {
    const r = await axios.post(`${VP_BASE}/${fnName}`, { data }, {
        headers: { 'Content-Type': 'application/json' }, timeout: 25000
    });
    // Callable functions wrap the payload in { result: ... }
    return (r.data && r.data.result) || r.data;
}

// Capture points the client already reserved (hold) — authoritative deduction.
app.post('/api/vp/capture', async (req, res) => {
    if (!vpConfigured()) return res.json({ ok: false, enabled: false });
    const { holdId, points, reference, siteId } = req.body || {};
    if (!holdId || !(points > 0)) return res.status(400).json({ ok: false, message: 'INVALID_INPUT' });
    try {
        await vpCall('walletCapture', {
            holdId,
            serverKey: VP_KEY,
            siteId: siteId || 'orizis-academy',
            reference: reference || null,
            splits: [{ toUid: VP_PLATFORM_UID, amount: points, role: 'platform' }]
        });
        res.json({ ok: true });
    } catch (error) {
        // Release the hold so the learner's points are not stuck.
        try { await vpCall('walletRelease', { holdId, serverKey: VP_KEY, siteId: siteId || 'orizis-academy', reason: 'capture failed' }); } catch (e) {}
        res.status(502).json({
            ok: false,
            message: 'Payment with points failed. Your points were not taken.',
            detail: error.response ? error.response.data : error.message
        });
    }
});

// Credit loyalty points after a successful purchase (best-effort).
// NOTE: this needs a central reward/credit function (VERIPOINTS_REWARD_FN).
// The base VeriPoints contract only defines hold/capture/release/balance, so
// a small server-side "reward" function must be added centrally — see
// VERIPOINTS.md. Until then this safely returns { ok:false }.
app.post('/api/vp/reward', async (req, res) => {
    if (!vpConfigured()) return res.json({ ok: false, enabled: false });
    const { uid, points, reference, siteId } = req.body || {};
    if (!uid || !(points > 0)) return res.status(400).json({ ok: false, message: 'INVALID_INPUT' });
    try {
        await vpCall(VP_REWARD_FN, {
            uid, amount: points, serverKey: VP_KEY,
            siteId: siteId || 'orizis-academy', reference: reference || null
        });
        res.json({ ok: true, points });
    } catch (error) {
        res.json({ ok: false, detail: error.response ? error.response.data : error.message });
    }
});

module.exports = app;
