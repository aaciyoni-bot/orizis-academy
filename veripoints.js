/* ================================================================
   VeriPoints plugin — shared ORIZIS wallet & loyalty (OPTIONAL)
   ----------------------------------------------------------------
   A drop-in layer that adds a second payment method (VeriPoints) and
   loyalty points to any ORIZIS site, WITHOUT changing anything when it
   is off. It reuses the central VeriPoints SDK (sdk/veripoints-sdk.js)
   and its API contract — it never invents a new wallet, and it never
   changes a balance from the client (that is server-side only).

   Guarantees (see the "modular & seamless" rule):
     • CONFIG.VERIPOINTS_ENABLED = false  -> this file does nothing.
     • SDK missing / fails to load / central not configured
                                          -> stays unavailable, no UI, no errors.
   The host site checks VP.isOn() before showing any VeriPoints UI.
   ================================================================ */
(function (global) {
'use strict';

var CFG = (global.OA_CONFIG || {});
var state = {
    enabled: !!CFG.VERIPOINTS_ENABLED,
    available: false,     // SDK loaded + init succeeded
    connected: false,     // user signed in to the central wallet
    uid: null,
    balance: { available: 0, held: 0 },
    initPromise: null
};
var listeners = [];
function emit() { listeners.forEach(function (cb) { try { cb(publicState()); } catch (e) {} }); }
function publicState() {
    return { enabled: state.enabled, available: state.available, connected: state.connected,
             uid: state.uid, points: state.balance.available };
}

function loadScript(src) {
    return new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = res; s.onerror = function () { rej(new Error('vp sdk load failed')); };
        document.head.appendChild(s);
    });
}

// init() — safe to call always. Resolves to true only if VeriPoints is usable.
function init() {
    if (state.initPromise) return state.initPromise;
    state.initPromise = (async function () {
        if (!state.enabled) return false;                        // master switch off
        if (!CFG.VERIPOINTS_SDK_URL) { console.warn('[VeriPoints] enabled but no SDK URL'); return false; }
        // Central project must be configured for the SDK to sign users in.
        var c = CFG.VERIPOINTS_CONFIG || {};
        if (!c.apiKey || !c.projectId) { console.warn('[VeriPoints] enabled but central config missing'); return false; }
        try {
            if (!global.VeriPoints) await loadScript(CFG.VERIPOINTS_SDK_URL);
            if (!global.VeriPoints) throw new Error('SDK global missing after load');
            await global.VeriPoints.init({
                siteId: 'orizis-academy',
                config: c,
                origin: CFG.VERIPOINTS_ORIGIN || undefined,
                region: CFG.VERIPOINTS_REGION || undefined
            });
            global.VeriPoints.onUser(function (u) {
                state.connected = !!u;
                state.uid = u ? u.uid : null;
                if (u) watchBalance(); else { state.balance = { available: 0, held: 0 }; }
                emit();
            });
            state.available = true;
            emit();
            return true;
        } catch (e) {
            console.warn('[VeriPoints] unavailable, staying MoMo-only:', e && e.message);
            state.available = false;
            return false;
        }
    })();
    return state.initPromise;
}

var balanceUnsub = null;
function watchBalance() {
    if (!state.available || !global.VeriPoints) return;
    try {
        global.VeriPoints.onBalance(function (b) { state.balance = b || { available: 0, held: 0 }; emit(); });
    } catch (e) { /* not signed in yet */ }
}

async function connect() {
    if (!state.available) return false;
    try { await global.VeriPoints.signInWithGoogle(); return true; }
    catch (e) { console.warn('[VeriPoints] connect cancelled/failed:', e && e.message); return false; }
}
async function disconnect() { if (state.available) { try { await global.VeriPoints.signOut(); } catch (e) {} } }

// Points needed to cover a ZMW price (1 point = REDEEM_RATE ZMW).
function pointsFor(zmw) {
    var rate = Number(CFG.REDEEM_RATE) || 1;
    return Math.ceil((Number(zmw) || 0) / rate);
}
// Points earned back on a purchase of `zmw`.
function pointsEarned(zmw) {
    var rate = Number(CFG.REDEEM_RATE) || 1;
    var pct = Number(CFG.EARN_PERCENT) || 0;
    return Math.round(((Number(zmw) || 0) * pct / 100) / rate);
}

function apiBase() { return (CFG.API_BASE_URL || '').replace(/\/$/, ''); }

/* Pay for something using VeriPoints:
   1) client HOLDs the points on its own wallet (SDK, allowed from client)
   2) our BACKEND captures the hold with the secret serverKey (client can
      never capture) — this is the authoritative balance change.
   Returns { ok:true, ref } or throws with a friendly message. */
async function payPoints(opts) {
    opts = opts || {};
    if (!state.available) throw new Error('VeriPoints is not available.');
    if (!state.connected) throw new Error('Please connect your VeriPoints account first.');
    var points = pointsFor(opts.priceZmw);
    if (state.balance.available < points) {
        var e = new Error('Not enough points. You need ' + points + ' and have ' + state.balance.available + '.');
        e.code = 'INSUFFICIENT_POINTS'; throw e;
    }
    var reference = opts.reference || ('oa-' + Date.now());
    var held;
    try { held = await global.VeriPoints.hold({ amount: points, reference: reference }); }
    catch (err) { throw new Error('Could not reserve your points. Please try again.'); }
    var holdId = held && held.holdId;
    if (!holdId) throw new Error('Could not reserve your points. Please try again.');

    // Server-side capture (authoritative). Backend holds the serverKey.
    var res = await fetch(apiBase() + '/api/vp/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdId: holdId, reference: reference, points: points, siteId: 'orizis-academy' }),
        signal: AbortSignal.timeout(30000)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.ok) {
        // Backend releases the hold on failure; surface a clean error.
        throw new Error(data.message || 'Payment with points failed. Your points were not taken.');
    }
    return { ok: true, ref: holdId };
}

/* Credit loyalty points after ANY successful purchase (MoMo or points).
   Best-effort and server-authoritative: the backend credits the wallet with
   the serverKey. Requires the buyer to be connected to VeriPoints (so we
   have a wallet to credit). Never throws to the caller. */
async function earn(opts) {
    opts = opts || {};
    if (!state.available || !state.connected || !state.uid) return { ok: false, skipped: true };
    var points = pointsEarned(opts.priceZmw);
    if (points <= 0) return { ok: false, skipped: true };
    try {
        var res = await fetch(apiBase() + '/api/vp/reward', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: state.uid, points: points, reference: opts.reference || null, siteId: 'orizis-academy' }),
            signal: AbortSignal.timeout(20000)
        });
        var data = await res.json().catch(function () { return {}; });
        return { ok: !!(res.ok && data.ok), points: points };
    } catch (e) { return { ok: false, error: true }; }
}

global.VP = {
    init: init,
    isOn: function () { return state.enabled && state.available; },
    isConnected: function () { return state.connected; },
    points: function () { return state.balance.available; },
    state: publicState,
    onState: function (cb) { listeners.push(cb); cb(publicState()); },
    connect: connect,
    disconnect: disconnect,
    pointsFor: pointsFor,
    pointsEarned: pointsEarned,
    payPoints: payPoints,
    earn: earn
};

})(typeof window !== 'undefined' ? window : this);
