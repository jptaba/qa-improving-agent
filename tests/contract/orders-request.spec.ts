import { test, expect, DEMO_USER } from '../../skills/fixtures';
import { CARDS, DEMO_CART_ITEMS } from '../../skills/data';

// Contract tests derived from requirements/openapi/orders.yaml (frozen with REQ-160).
// `POST /api/orders` declares `400: Invalid request body` for bodies that break `OrderRequest`:
//   required: [cardId, items]; cardId: string; items: array, minItems 1;
//   each item: required [sku, qty]; sku: string; qty: integer, minimum 1.
// Each case breaks exactly one rule, so a failure names the rule the server stopped enforcing.

const INVALID_BODIES: { rule: string; body: unknown }[] = [
  { rule: 'cardId is required', body: { items: DEMO_CART_ITEMS } },
  { rule: 'cardId must be a string', body: { cardId: 42, items: DEMO_CART_ITEMS } },
  { rule: 'items is required', body: { cardId: CARDS.valid.id } },
  { rule: 'items must be an array', body: { cardId: CARDS.valid.id, items: { sku: 'WID-1', qty: 1 } } },
  { rule: 'items needs at least one entry', body: { cardId: CARDS.valid.id, items: [] } },
  { rule: 'an item must be an object', body: { cardId: CARDS.valid.id, items: ['WID-1'] } },
  { rule: 'an item needs a sku', body: { cardId: CARDS.valid.id, items: [{ qty: 1 }] } },
  { rule: 'an item sku must be a string', body: { cardId: CARDS.valid.id, items: [{ sku: 7, qty: 1 }] } },
  { rule: 'an item needs a qty', body: { cardId: CARDS.valid.id, items: [{ sku: 'WID-1' }] } },
  { rule: 'an item qty must be an integer', body: { cardId: CARDS.valid.id, items: [{ sku: 'WID-1', qty: 1.5 }] } },
  { rule: 'an item qty must be a number, not text', body: { cardId: CARDS.valid.id, items: [{ sku: 'WID-1', qty: '1' }] } },
  { rule: 'an item qty must be at least 1', body: { cardId: CARDS.valid.id, items: [{ sku: 'WID-1', qty: 0 }] } },
];

// POST /api/login: required [email, password], both strings. The contract declares 401 for bad credentials.
const INVALID_LOGINS: { rule: string; body: unknown }[] = [
  { rule: 'the body is empty', body: {} },
  { rule: 'the password is missing for an unknown email', body: { email: 'nobody@example.com' } },
  { rule: 'the password is missing for the demo email', body: { email: DEMO_USER.email } },
  { rule: 'the password is not a string', body: { email: DEMO_USER.email, password: 123 } },
];

test.describe('REQ-160 Orders API: request body contract', () => {
  for (const { rule, body } of INVALID_BODIES) {
    test(`responds 400 with an Error body when ${rule}`, { tag: ['@REQ-160'] }, async ({ request }) => {
      const loginRes = await request.post('/api/login', { data: DEMO_USER });
      expect(loginRes.status()).toBe(200);

      const res = await request.post('/api/orders', { data: body });
      expect(res.status()).toBe(400);
      expect(res.headers()['content-type']).toContain('application/json');

      // Error schema: required [error], error: string.
      const err = await res.json();
      expect(typeof err.error).toBe('string');
      expect(err.error).not.toBe('');
    });
  }

  for (const { rule, body } of INVALID_LOGINS) {
    test(`sign-in responds 401 without a session when ${rule}`, { tag: ['@REQ-160'] }, async ({ request }) => {
      const res = await request.post('/api/login', { data: body });
      expect(res.status()).toBe(401);
      expect(res.headers()['set-cookie']).toBeUndefined();

      // The session must not grant access to orders either.
      const orderRes = await request.post('/api/orders', { data: { cardId: CARDS.valid.id, items: DEMO_CART_ITEMS } });
      expect(orderRes.status()).toBe(401);
    });
  }

  test('responds 400 with an Error body when the body is not JSON', { tag: ['@REQ-160'] }, async ({ request }) => {
    const loginRes = await request.post('/api/login', { data: DEMO_USER });
    expect(loginRes.status()).toBe(200);

    const res = await request.post('/api/orders', {
      data: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);

    const err = await res.json();
    expect(typeof err.error).toBe('string');
    expect(err.error).not.toBe('');
  });

  test('responds 422 with an Error body for an unknown card', { tag: ['@REQ-160'] }, async ({ request }) => {
    const loginRes = await request.post('/api/login', { data: DEMO_USER });
    expect(loginRes.status()).toBe(200);

    // Contract: 422 "Card unknown or expired".
    const res = await request.post('/api/orders', { data: { cardId: 'card_does_not_exist', items: DEMO_CART_ITEMS } });
    expect(res.status()).toBe(422);

    const err = await res.json();
    expect(typeof err.error).toBe('string');
    expect(err.error).not.toBe('');
  });
});
