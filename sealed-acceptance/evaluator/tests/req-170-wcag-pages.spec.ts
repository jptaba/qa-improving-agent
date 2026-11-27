import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn, placeOrder } from './support';

// REQ-170 AC1: no automatically detectable WCAG 2.2 A/AA violations on every page.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: import('@playwright/test').Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`), 'axe violations').toEqual([]);
}

test.describe('REQ-170', () => {
  test('AC1: sign-in page has no WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('AC1: checkout page has no WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    await signIn(page, 'buyer');
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('AC1: order confirmation page has no WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    await signIn(page, 'buyer');
    await placeOrder(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Order confirmed' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('AC1: page-not-found page has no WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    await page.goto('/no-such-page-here');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expectNoViolations(page);
  });
});
