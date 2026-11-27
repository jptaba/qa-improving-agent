// Demo application under test (AUT): sign-in → checkout → confirmation, plus a small orders API.
// Zero dependencies. Start with `npm run aut` (port 4173, override with PORT).
//
// Planted bugs for the canary/scorecard are switched on with FAULT (comma-separated):
//   expired-card-accepted  REQ-142  expired cards are accepted (client + server)
//   login-error-missing    REQ-101  no error message on a wrong password
//   total-wrong            REQ-150  totals are off by $1.00
//   a11y-missing-label     REQ-170  the email field loses its label
//   api-contract-drift     REQ-160  POST /api/orders returns {orderId, amount} instead of {id, total, …}
//   double-submit          REQ-180  Pay now has no in-flight guard; repeat clicks create extra orders
//   foreign-order-visible  REQ-190  any signed-in shopper can open another shopper's confirmation page
//   expiry-month-early     REQ-142  a card counts as expired during its own expiry month (AC3)
//   layout-overflow        REQ-200  the checkout page overflows horizontally at 1280x720
//   impossible             (canary) every page returns HTTP 500; health stays up
// The fault list is never exposed by the app itself, so evaluators can't read it.

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 4173);
const FAULTS = new Set((process.env.FAULT || '').split(',').map((s) => s.trim()).filter(Boolean));
const has = (f) => FAULTS.has(f);

// Second account exists so per-shopper order ownership can be tested.
const USERS = { 'demo@example.com': 'correct-horse', 'other@example.com': 'battery-staple' };
const sessions = new Map(); // session token -> email of the signed-in shopper
const orderOwners = new Map(); // order id -> email of the shopper who placed it
const orders = new Map();

const CARDS = [
  { id: 'card_visa', label: 'Visa •••• 4242', expMonth: 12, expYear: 2030 },
  { id: 'card_mc', label: 'Mastercard •••• 4444', expMonth: 1, expYear: 2025 },
];
const CART = [
  { sku: 'WID-1', name: 'Widget', qty: 2, unitPrice: 10 },
  { sku: 'GAD-7', name: 'Gadget', qty: 1, unitPrice: 15.5 },
];

const cartTotal = () => {
  const t = CART.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  return has('total-wrong') ? t + 1 : t;
};
const money = (n) => `$${n.toFixed(2)}`;
// A card is valid through the last day of its expiry month.
const isExpired = (card, now = new Date()) => now >= new Date(card.expYear, has('expiry-month-early') ? card.expMonth - 1 : card.expMonth, 1);
const pad = (n) => String(n).padStart(2, '0');

function page(title, body, script = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Demo Shop</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1c2133}
  label{display:block;margin:14px 0 4px;font-weight:600}
  input[type=email],input[type=password]{width:100%;padding:10px;border:1px solid #8a8f9e;border-radius:8px;font-size:16px;box-sizing:border-box}
  button{margin-top:18px;padding:10px 18px;border:0;border-radius:8px;background:#1c4ed8;color:#fff;font-size:16px;cursor:pointer}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{text-align:left;padding:8px;border-bottom:1px solid #dde}
  fieldset{border:1px solid #dde;border-radius:8px;margin-top:16px}
  .opt{display:flex;gap:8px;align-items:center;margin:8px 0;font-weight:400}
  ${has('layout-overflow') ? 'table{min-width:1500px}' : ''}
  [role=alert]{margin-top:14px;padding:10px;border-radius:8px;background:#fde8e8;color:#8a1111}
</style>
</head>
<body>
<header><p><strong>Demo Shop</strong></p></header>
<main>
${body}
</main>
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

function loginPage() {
  const emailField = has('a11y-missing-label')
    ? `<input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="username">`
    : `<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username">`;
  const body = `
<h1>Sign in</h1>
<form id="login" novalidate>
  ${emailField}
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password">
  <button type="submit">Sign in</button>
  <p id="msg" role="alert" hidden></p>
</form>`;
  const showError = has('login-error-missing') ? '' : `msg.textContent = 'Invalid email or password'; msg.hidden = false;`;
  const script = `
const form = document.getElementById('login'); const msg = document.getElementById('msg');
form.addEventListener('submit', async (e) => {
  e.preventDefault(); msg.hidden = true;
  const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
  if (res.ok) { location.href = '/checkout'; return; }
  ${showError}
});`;
  return page('Sign in', body, script);
}

function checkoutPage() {
  const rows = CART.map((i) => `<tr><td>${i.name}</td><td>${i.qty}</td><td>${money(i.unitPrice)}</td></tr>`).join('');
  const cards = CARDS.map(
    (c, k) => `<label class="opt"><input type="radio" name="card" value="${c.id}" ${k === 0 ? 'checked' : ''}> ${c.label} (expires ${pad(c.expMonth)}/${c.expYear})</label>`,
  ).join('');
  const body = `
<h1>Checkout</h1>
<table aria-label="Cart">
  <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Unit price</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p id="total">Total: <strong>${money(cartTotal())}</strong></p>
<form id="pay" novalidate>
  <fieldset><legend>Payment method</legend>${cards}</fieldset>
  <button type="submit">Pay now</button>
  <p id="msg" role="alert" hidden></p>
</form>`;
  const cardsJson = JSON.stringify(CARDS.map(({ id, expMonth, expYear }) => ({ id, expMonth, expYear })));
  const clientCheck = has('expired-card-accepted')
    ? ''
    : `if (new Date() >= new Date(card.expYear, ${has('expiry-month-early') ? 'card.expMonth - 1' : 'card.expMonth'}, 1)) { msg.textContent = 'This card has expired. Update card to continue.'; msg.hidden = false; return; }`;
  // Planted fault double-submit (REQ-180 AC1): no in-flight guard, so repeat clicks each create an order.
  const singlePayment = !has('double-submit');
  const script = `
const CARDS = ${cardsJson};
const form = document.getElementById('pay'); const msg = document.getElementById('msg');
const payBtn = form.querySelector('button[type=submit]');
let paying = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  ${singlePayment ? 'if (paying) return; // one payment at a time: ignore repeat clicks while a request is in flight' : ''}
  msg.hidden = true;
  const card = CARDS.find((c) => c.id === form.card.value);
  ${clientCheck}
  ${singlePayment ? 'paying = true; payBtn.disabled = true;' : ''}
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cardId: card.id, items: ${JSON.stringify(CART.map(({ sku, qty }) => ({ sku, qty })))} }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 201 && data.id) { location.href = '/confirmation?id=' + encodeURIComponent(data.id); return; }
    msg.textContent = data.error === 'card_expired' ? 'This card has expired. Update card to continue.' : 'Payment failed. Please try again.';
  } catch {
    msg.textContent = 'Payment failed. Please try again.';
  }
  msg.hidden = false;
  paying = false; payBtn.disabled = false;
});`;
  return page('Checkout', body, script);
}

function confirmationPage(order) {
  return page(
    'Order confirmed',
    `<h1>Order confirmed</h1><p>Order <strong id="order-id">${order.id}</strong></p><p id="total">Total: <strong>${money(order.total)}</strong></p>`,
  );
}

const cookies = (req) =>
  Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));
const signedIn = (req) => sessions.has(cookies(req).session);
const currentUser = (req) => sessions.get(cookies(req).session);

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, obj, headers) => send(res, status, JSON.stringify(obj), 'application/json', headers);

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = `${req.method} ${url.pathname}`;

  // HEAD is answered like GET (Node drops the body). pid lets a harness confirm it reached the process it started.
  if (route === 'GET /api/health' || route === 'HEAD /api/health') return json(res, 200, { status: 'ok', pid: process.pid });
  if (has('impossible')) return send(res, 500, 'Internal Server Error', 'text/plain');

  switch (route) {
    case 'GET /':
      return send(res, 200, loginPage());

    case 'POST /api/login': {
      const body = await readJson(req);
      const known = body && typeof body.email === 'string' && typeof body.password === 'string' && Object.hasOwn(USERS, body.email);
      if (!known || USERS[body.email] !== body.password) return json(res, 401, { error: 'invalid_credentials' });
      const token = randomUUID();
      sessions.set(token, body.email);
      return json(res, 200, { ok: true }, { 'set-cookie': `session=${token}; HttpOnly; Path=/; SameSite=Lax` });
    }

    case 'GET /checkout':
      if (!signedIn(req)) return send(res, 302, '', 'text/plain', { location: '/' });
      return send(res, 200, checkoutPage());

    case 'POST /api/orders': {
      if (!signedIn(req)) return json(res, 401, { error: 'unauthenticated' });
      const body = await readJson(req);
      const validItem = (i) => i !== null && typeof i === 'object' && typeof i.sku === 'string' && Number.isInteger(i.qty) && i.qty >= 1;
      if (!body || typeof body.cardId !== 'string' || !Array.isArray(body.items) || body.items.length === 0 || !body.items.every(validItem)) {
        return json(res, 400, { error: 'invalid_request' });
      }
      const card = CARDS.find((c) => c.id === body.cardId);
      if (!card) return json(res, 422, { error: 'unknown_card' });
      if (!has('expired-card-accepted') && isExpired(card)) return json(res, 422, { error: 'card_expired' });
      const order = { id: `ord_${randomUUID().slice(0, 8)}`, total: cartTotal(), currency: 'USD', status: 'confirmed' };
      orders.set(order.id, order);
      orderOwners.set(order.id, currentUser(req));
      if (has('api-contract-drift')) return json(res, 201, { orderId: order.id, amount: order.total });
      return json(res, 201, order);
    }

    case 'GET /confirmation':
      if (!signedIn(req)) return send(res, 302, '', 'text/plain', { location: '/' });
    {
      // Only the shopper who placed an order may see it. Unknown and foreign ids look the same (404).
      const id = url.searchParams.get('id');
      const order = orders.get(id);
      // Planted fault foreign-order-visible (REQ-190 AC2): any signed-in shopper can see any order.
      const ownerOk = has('foreign-order-visible') || orderOwners.get(id) === currentUser(req);
      if (!order || !ownerOk) return send(res, 404, page('Order not found', '<h1>Order not found</h1>'));
      return send(res, 200, confirmationPage(order));
    }

    default: {
      // Known API path, unsupported method: 405 with the methods that are allowed.
      const allowed = { '/api/login': 'POST', '/api/orders': 'POST', '/api/health': 'GET, HEAD' }[url.pathname];
      if (allowed) return json(res, 405, { error: 'method_not_allowed' }, { allow: allowed });
      return send(res, 404, page('Not found', '<h1>Page not found</h1>'));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Demo AUT listening on http://localhost:${PORT}${FAULTS.size ? ' (planted faults active)' : ''}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
