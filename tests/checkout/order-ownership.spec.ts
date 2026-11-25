import { test, expect, DEMO_USER, OTHER_USER, signIn } from '../../skills/fixtures';
import { orderRequest } from '../../skills/data';

// REQ-190 is a DRAFT (proposals/requirement-draft-REQ-190-order-ownership.md) until a person adds it to requirements/.
test.describe('REQ-190 Order confirmation access', () => {
  test('shows an order only to the shopper who placed it', { tag: ['@REQ-190'] }, async ({ request, page }) => {
    // Shopper A places an order through the API.
    expect((await request.post('/api/login', { data: DEMO_USER })).status()).toBe(200);
    const orderRes = await request.post('/api/orders', { data: orderRequest() });
    expect(orderRes.status()).toBe(201);
    const { id } = await orderRes.json();

    // AC1: shopper A can open their own confirmation page.
    const own = await request.get(`/confirmation?id=${encodeURIComponent(id)}`);
    expect(own.status()).toBe(200);
    expect(await own.text()).toContain(id);

    // AC2: shopper B, signed in separately, gets "Order not found" with 404.
    await signIn(page, OTHER_USER);
    const foreign = await page.goto(`/confirmation?id=${encodeURIComponent(id)}`);
    expect(foreign?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Order not found' })).toBeVisible();
    await expect(page.getByText(id)).toHaveCount(0);
  });

  test('responds 404 for an order id that does not exist', { tag: ['@REQ-190'] }, async ({ signedInPage: page }) => {
    // AC3
    const res = await page.goto('/confirmation?id=ord_doesnotexist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Order not found' })).toBeVisible();
  });
});
