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
        paymentsEnv: process.env.PAWAPAY_ENV === 'production' ? 'production' : 'sandbox'
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

module.exports = app;
