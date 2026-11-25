// Procedural memory: reusable, reviewed helpers that agents must use instead of re-implementing.
import { test as base, expect, type Page } from '@playwright/test';

export const DEMO_USER = { email: 'demo@example.com', password: 'correct-horse' } as const;
/** A second shopper, for tests that need two accounts (e.g. order ownership). */
export const OTHER_USER = { email: 'other@example.com', password: 'battery-staple' } as const;

/** Fixed "today" for anything date-dependent (card expiry). See playbook PB-001. */
export const FIXED_NOW = new Date('2026-01-15T10:00:00Z');

/** Sign in through the UI and land on Checkout. */
export async function signIn(page: Page, user: { email: string; password: string } = DEMO_USER) {
  await page.goto('/');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

type Fixtures = {
  /** A page with the clock fixed at FIXED_NOW, already signed in and on Checkout. */
  signedInPage: Page;
};

export const test = base.extend<Fixtures>({
  signedInPage: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await signIn(page);
    await use(page);
  },
});

export { expect };
