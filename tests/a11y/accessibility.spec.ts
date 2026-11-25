import AxeBuilder from '@axe-core/playwright';
import { test, expect, DEMO_USER } from '../../skills/fixtures';
import { CARDS } from '../../skills/data';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('REQ-170 Accessibility', () => {
  test('sign-in page has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('checkout page has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ signedInPage: page }) => {
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('checkout page showing the expired-card error has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ signedInPage: page }) => {
    // The error alert is part of the checkout page; scan it in the state where it is visible.
    await page.getByRole('radio', { name: CARDS.expired.name }).check();
    await page.getByRole('button', { name: 'Pay now' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('order confirmation page has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ signedInPage: page }) => {
    await page.getByRole('radio', { name: CARDS.valid.name }).check();
    await page.getByRole('button', { name: 'Pay now' }).click();
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('page-not-found page has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('order-not-found page has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ signedInPage: page }) => {
    const res = await page.goto('/confirmation?id=ord_doesnotexist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Order not found' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('sign-in page showing the invalid-credentials error has no detectable WCAG A/AA violations', { tag: ['@REQ-170'] }, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(DEMO_USER.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
