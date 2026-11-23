import { test, expect, DEMO_USER } from '../../skills/fixtures';
import { CARDS, DEMO_CART_ITEMS, orderRequest } from '../../skills/data';

test.describe('REQ-160 Orders API contract', () => {
  test('creates an order and returns the confirmed order body', { tag: ['@REQ-160'] }, async ({ request }) => {
    const loginRes = await request.post('/api/login', { data: DEMO_USER });
    expect(loginRes.status()).toBe(200);

    const res = await request.post('/api/orders', { data: orderRequest(CARDS.valid.id) });
    expect(res.status()).toBe(201);
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(typeof body.id).toBe('string');
    expect(body.id).not.toBe('');
    expect(typeof body.total).toBe('number');
    expect(body.currency).toBe('USD');
    expect(body.status).toBe('confirmed');
  });

  test('rejects an order with no card id', { tag: ['@REQ-160'] }, async ({ request }) => {
    const loginRes = await request.post('/api/login', { data: DEMO_USER });
    expect(loginRes.status()).toBe(200);

    const res = await request.post('/api/orders', { data: { items: DEMO_CART_ITEMS } });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).not.toBe('');
  });

  test('rejects an order from a client that is not signed in', { tag: ['@REQ-160'] }, async ({ request }) => {
    const res = await request.post('/api/orders', { data: orderRequest(CARDS.valid.id) });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).not.toBe('');
  });

  test('rejects an order sent with a forged session cookie', { tag: ['@REQ-160'] }, async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: orderRequest(CARDS.valid.id),
      headers: { Cookie: 'session=not-a-real-session' },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects an order paid with an expired card', { tag: ['@REQ-160'] }, async ({ request }) => {
    const loginRes = await request.post('/api/login', { data: DEMO_USER });
    expect(loginRes.status()).toBe(200);

    const res = await request.post('/api/orders', { data: orderRequest(CARDS.expired.id) });
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body).toEqual({ error: 'card_expired' });
  });
});
