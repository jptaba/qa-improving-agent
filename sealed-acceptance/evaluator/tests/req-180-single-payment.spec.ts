import { test, expect } from '@playwright/test';
import { signIn } from './support';

// REQ-180 One payment per Pay now.

test.describe('REQ-180', () => {
  test('AC1: no second payment can be submitted while one is in progress', { tag: ['@REQ-180'] }, async ({ page }) => {
    await signIn(page, 'buyer');
    let posts = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      await gate; // hold the first payment "in progress"
      await route.continue();
    });

    const pay = page.getByRole('button', { name: 'Pay now' });
    await pay.click();
    await expect.poll(() => posts).toBe(1);
    // Try every way a shopper could submit again while the first payment is pending.
    await pay.click({ force: true, noWaitAfter: true, timeout: 1000 }).catch(() => {});
    await pay.dblclick({ force: true, noWaitAfter: true, timeout: 1000 }).catch(() => {});
    await page.locator('#pay').focus().catch(() => {});
    await pay.focus().catch(() => {});
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.evaluate(() => (document.getElementById('pay') as HTMLFormElement).requestSubmit());
    // Give any (wrongly) triggered duplicate request a chance to reach the network layer.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    expect(posts, 'only one payment request may be sent while one is in progress').toBe(1);

    release();
    await expect(page).toHaveURL(/\/confirmation\?id=/);
    expect(posts).toBe(1);
  });

  test('AC2: after a failed payment the shopper can pay again', { tag: ['@REQ-180'] }, async ({ page }) => {
    await signIn(page, 'buyer');
    let posts = 0;
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      if (posts === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'server_error' }) });
      return route.continue();
    });

    const pay = page.getByRole('button', { name: 'Pay now' });
    await pay.click();
    await expect(page.getByRole('alert')).toContainText(/payment failed/i);
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(page).toHaveURL(/\/confirmation\?id=/);
    expect(posts).toBe(2);
    await expect(page.getByText('Order confirmed')).toBeVisible();
  });
});
