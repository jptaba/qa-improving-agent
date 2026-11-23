// PRIVATE acceptance tests, derived only from requirements/. Builder agents must never see this file.
// Deliberately written independently of the builder suite: own helpers, own data, often a different
// angle (API-level checks, accessible-name checks) so builder blind spots don't carry over.
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const ACCOUNT = { email: 'demo@example.com', password: 'correct-horse' }; // from REQ-101 "In scope"
const TODAY = new Date('2026-03-01T12:00:00Z'); // evaluator's own fixed date (differs from builders')

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(ACCOUNT.email);
  await page.getByLabel('Password').fill(ACCOUNT.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
}

async function apiLogin(request: APIRequestContext) {
  const res = await request.post('/api/login', { data: ACCOUNT });
  expect(res.status(), 'login should succeed for the documented demo account').toBe(200);
}

// ---------- REQ-101 Sign in ----------
test('REQ-101 AC1: valid credentials lead to Checkout', { tag: ['@REQ-101'] }, async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/checkout$/);
});

test('REQ-101 AC2: wrong password keeps shopper on sign-in with the documented message', { tag: ['@REQ-101'] }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(ACCOUNT.email);
  await page.getByLabel('Password').fill('wrong-password-123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

// ---------- REQ-142 Expired card ----------
test('REQ-142 AC1: expired card blocks payment with the documented message', { tag: ['@REQ-142'] }, async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await login(page);
  const expired = page.getByRole('radio', { name: /expires 01\/2025/ });
  await expired.check();
  await page.getByRole('button', { name: /pay now/i }).click();
  await expect(page.getByText('This card has expired. Update card to continue.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
});

test('REQ-142 AC1 (server side): expired card is rejected by the API too', { tag: ['@REQ-142'] }, async ({ request }) => {
  await apiLogin(request);
  const res = await request.post('/api/orders', { data: { cardId: 'card_mc', items: [{ sku: 'WID-1', qty: 1 }] } });
  expect(res.status()).toBe(422);
});

test('REQ-142 AC2: non-expired card completes the order', { tag: ['@REQ-142'] }, async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await login(page);
  await page.getByRole('radio', { name: /expires 12\/2030/ }).check();
  await page.getByRole('button', { name: /pay now/i }).click();
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
});

// ---------- REQ-150 Order total ----------
test('REQ-150 AC1+AC2: total equals Σ qty × price on checkout and confirmation', { tag: ['@REQ-150'] }, async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await login(page);
  // Compute the expected total from the cart the page shows, rather than trusting a constant.
  const rows = page.getByRole('table', { name: 'Cart' }).locator('tbody tr');
  let expected = 0;
  for (const row of await rows.all()) {
    const cells = await row.getByRole('cell').allTextContents();
    expected += Number(cells[1]) * Number(cells[2].replace(/[^0-9.]/g, ''));
  }
  const want = `$${expected.toFixed(2)}`;
  expect(want, 'requirement reference data').toBe('$35.50');
  await expect(page.getByText(/^Total:/)).toContainText(want);
  await page.getByRole('radio', { name: /expires 12\/2030/ }).check();
  await page.getByRole('button', { name: /pay now/i }).click();
  await expect(page.getByText(/^Total:/)).toContainText(want);
});

// ---------- REQ-160 Orders API contract ----------
test('REQ-160 AC1: authenticated order returns 201 with the contracted body', { tag: ['@REQ-160'] }, async ({ request }) => {
  await apiLogin(request);
  const res = await request.post('/api/orders', { data: { cardId: 'card_visa', items: [{ sku: 'WID-1', qty: 2 }, { sku: 'GAD-7', qty: 1 }] } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(typeof body.id).toBe('string');
  expect(typeof body.total).toBe('number');
  expect(body.currency).toBe('USD');
  expect(body.status).toBe('confirmed');
});

test('REQ-160 AC2: unauthenticated order returns 401', { tag: ['@REQ-160'] }, async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  const res = await anon.post('/api/orders', { data: { cardId: 'card_visa', items: [{ sku: 'WID-1', qty: 1 }] } });
  expect(res.status()).toBe(401);
  await anon.dispose();
});

test('REQ-160 AC3: expired card returns 422 card_expired', { tag: ['@REQ-160'] }, async ({ request }) => {
  await apiLogin(request);
  const res = await request.post('/api/orders', { data: { cardId: 'card_mc', items: [{ sku: 'WID-1', qty: 1 }] } });
  expect(res.status()).toBe(422);
  expect(await res.json()).toEqual({ error: 'card_expired' });
});

// ---------- REQ-170 Accessibility ----------
test('REQ-170 AC2: every sign-in form field has an accessible name', { tag: ['@REQ-170'] }, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  const unnamed = await page.locator('input:not([type=hidden])').evaluateAll((els) =>
    els.filter((el) => !(el as HTMLInputElement).labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length,
  );
  expect(unnamed, 'inputs without an accessible name').toBe(0);
});
