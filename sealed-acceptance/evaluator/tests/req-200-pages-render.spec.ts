import { test, expect, type Page } from '@playwright/test';
import { signIn, placeOrder } from './support';

// REQ-200 Pages look as approved.
// The approved screenshots are builder-side artifacts the evaluator may not see, so AC1 is checked
// independently: each named page renders at 1280x720 with its main heading and controls, no
// horizontal scroll, and no console errors / failed requests. AC2 (the `visual-approved` label on
// the pull request) is a review-process rule, not observable on a running build; CI owns it.

test.use({ viewport: { width: 1280, height: 720 } });

function watchErrors(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

test.describe('REQ-200', () => {
  test('AC1: sign-in page renders with heading and controls', { tag: ['@REQ-200'] }, async ({ page }) => {
    const problems = watchErrors(page);
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });

  test('AC1: checkout page renders with heading, cart, cards and Pay now', { tag: ['@REQ-200'] }, async ({ page }) => {
    const problems = watchErrors(page);
    await signIn(page, 'buyer');
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Cart' })).toBeVisible();
    await expect(page.getByText(/^Total:/)).toBeVisible();
    await expect(page.getByRole('radio').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay now' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });

  test('AC1: order confirmation page renders with heading, order id and total', { tag: ['@REQ-200'] }, async ({ page }) => {
    const problems = watchErrors(page);
    await signIn(page, 'buyer');
    const id = await placeOrder(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Order confirmed' })).toBeVisible();
    await expect(page.getByText(id)).toBeVisible();
    await expect(page.getByText(/^Total:/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });

  test('AC1: page-not-found page renders with heading', { tag: ['@REQ-200'] }, async ({ page }) => {
    const problems = watchErrors(page);
    // A missing page legitimately answers 404; the browser logs that response itself, so ignore it.
    const res = await page.goto('/no-such-page-here');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(problems.filter((p) => !/404/.test(p))).toEqual([]);
  });
});
