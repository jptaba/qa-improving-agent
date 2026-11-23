import { test, expect } from '../../skills/fixtures';
import { CARDS, DEMO_CART_TOTAL_TEXT } from '../../skills/data';

test.describe('REQ-150 Order total', () => {
  test('shows the same correct total on checkout and confirmation', { tag: ['@REQ-150'] }, async ({ signedInPage: page }) => {
    await expect(page.getByText(/^Total:/)).toHaveText(`Total: ${DEMO_CART_TOTAL_TEXT}`);

    await page.getByRole('radio', { name: CARDS.valid.name }).check();
    await page.getByRole('button', { name: 'Pay now' }).click();

    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
    await expect(page.getByText(/^Total:/)).toHaveText(`Total: ${DEMO_CART_TOTAL_TEXT}`);
  });
});
