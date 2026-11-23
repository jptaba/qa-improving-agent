import { test, expect } from '../../skills/fixtures';
import { CARDS } from '../../skills/data';

test.describe('REQ-142 Expired saved card', () => {
  test('blocks payment with an expired card', { tag: ['@REQ-142'] }, async ({ signedInPage: page }) => {
    await page.getByRole('radio', { name: CARDS.expired.name }).check();
    await page.getByRole('button', { name: 'Pay now' }).click();
    await expect(page.getByRole('alert')).toHaveText('This card has expired. Update card to continue.');
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('accepts payment with a valid card', { tag: ['@REQ-142'] }, async ({ signedInPage: page }) => {
    await page.getByRole('radio', { name: CARDS.valid.name }).check();
    await page.getByRole('button', { name: 'Pay now' }).click();
    await expect(page).toHaveURL(/\/confirmation\?id=/);
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
  });
});
