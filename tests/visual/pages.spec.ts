import { test, expect, FIXED_NOW } from '../../skills/fixtures';
import { CARDS } from '../../skills/data';

// REQ-200 AC1: the four main pages match their approved screenshots at 1280×720, ignoring the order id.
// Runs only in the Linux CI container (the "visual" project, enabled by PW_VISUAL=1), where the
// baselines in pages.spec.ts-snapshots/ were taken. They are captured by .github/workflows/visual-baselines.yml
// and may change only with the owner's visual-approved label (AC2, enforced by heal-diff-check).
const shot = { animations: 'disabled', caret: 'hide', fullPage: true } as const;

test.describe('REQ-200 Pages look as approved', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('sign-in page', { tag: ['@REQ-200'] }, async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveScreenshot('sign-in.png', shot);
  });

  test('checkout page', { tag: ['@REQ-200'] }, async ({ signedInPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page).toHaveScreenshot('checkout.png', shot);
  });

  test('order confirmation page', { tag: ['@REQ-200'] }, async ({ signedInPage: page }) => {
    await page.getByRole('radio', { name: CARDS.valid.name }).check();
    await page.getByRole('button', { name: 'Pay now' }).click();
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
    // The order id is random on every run, and its width varies, so the whole "Order <id>" line is masked.
    await expect(page).toHaveScreenshot('order-confirmation.png', { ...shot, mask: [page.getByText(/^Order ord_[0-9a-f]{8}$/)] });
  });

  test('page not found', { tag: ['@REQ-200'] }, async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveScreenshot('page-not-found.png', shot);
  });
});
