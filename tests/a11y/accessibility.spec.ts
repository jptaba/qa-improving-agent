import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../skills/fixtures';

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
});
