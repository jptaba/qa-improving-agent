import { test, expect } from '../../skills/fixtures';
import { CARDS } from '../../skills/data';

// REQ-180 is a DRAFT (proposals/requirement-draft-REQ-180-single-payment.md) until a person adds it to requirements/.
test.describe('REQ-180 Single payment per checkout', () => {
  test('ignores repeat clicks on Pay now while a payment is in progress', { tag: ['@REQ-180'] }, async ({ signedInPage: page }) => {
    // Hold the first order request open so the "in progress" window is deterministic.
    let orderRequests = 0;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/orders', async (route) => {
      orderRequests++;
      await held;
      await route.continue();
    });

    await page.getByRole('radio', { name: CARDS.valid.name }).check();
    const payNow = page.getByRole('button', { name: 'Pay now' });
    await payNow.click();

    // AC1: while the payment is in flight, Pay now cannot be used again.
    await expect(payNow).toBeDisabled();
    await payNow.dispatchEvent('click');
    await payNow.dispatchEvent('click');

    release();
    await expect(page).toHaveURL(/\/confirmation\?id=/);
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
    expect(orderRequests).toBe(1);
  });

  test('lets the shopper pay again after a failed payment', { tag: ['@REQ-180'] }, async ({ signedInPage: page }) => {
    // AC2: a rejected payment must not leave Pay now stuck.
    await page.route('**/api/orders', (route) => route.fulfill({ status: 422, json: { error: 'unknown_card' } }));

    await page.getByRole('radio', { name: CARDS.valid.name }).check();
    const payNow = page.getByRole('button', { name: 'Pay now' });
    await payNow.click();

    await expect(page.getByRole('alert')).toHaveText('Payment failed. Please try again.');
    await expect(payNow).toBeEnabled();
  });
});
