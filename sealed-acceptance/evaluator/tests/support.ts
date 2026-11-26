// Evaluator-private helpers. Imports nothing from the builder side (skills/, tests/).
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const ACCOUNTS = {
  buyer: { email: 'demo@example.com', password: 'correct-horse' },
  other: { email: 'other@example.com', password: 'battery-staple' },
};

export async function signIn(page: Page, who: keyof typeof ACCOUNTS) {
  await page.goto('/');
  await page.getByLabel('Email').fill(ACCOUNTS[who].email);
  await page.getByLabel('Password').fill(ACCOUNTS[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

export async function newShopper(browser: Browser, who: keyof typeof ACCOUNTS): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  return { context, page };
}

/** Places an order through the UI and returns the order id from the confirmation page URL. */
export async function placeOrder(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page).toHaveURL(/\/confirmation\?id=/);
  return new URL(page.url()).searchParams.get('id')!;
}
