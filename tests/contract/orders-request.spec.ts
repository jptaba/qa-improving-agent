import { test, expect, DEMO_USER } from '../../skills/fixtures';
import { CARDS, DEMO_CART_ITEMS } from '../../skills/data';

// Contract tests derived from requirements/openapi/orders.yaml (frozen with REQ-160).
// `POST /api/orders` declares `400: Invalid request body` for bodies that break `OrderRequest`:
//   required: [cardId, items]; cardId: string; items: array, minItems 1.
// Each case breaks exactly one rule, so a failure names the rule the server stopped enforcing.
// Item-level rules (sku/qty) are NOT covered here: the server does not enforce them today.
// See escalations/ for that open question.

const INVALID_BODIES: { rule: string; body: unknown }[] = [
  { rule: 'cardId is required', body: { items: DEMO_CART_ITEMS } },
  { rule: 'cardId must be a string', body: { cardId: 42, items: DEMO_CART_ITEMS } },
  { rule: 'items is required', body: { cardId: CARDS.valid.id } },
  { rule: 'items must be an array', body: { cardId: CARDS.valid.id, items: { sku: 'WID-1', qty: 1 } } },
  { rule: 'items needs at least one entry', body: { cardId: CARDS.valid.id, items: [] } },
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
