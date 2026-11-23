import { test, expect } from '@playwright/test';
import { signIn, DEMO_USER } from '../../skills/fixtures';

test.describe('REQ-101 Sign in', () => {
  test('correct credentials take the shopper to Checkout', { tag: ['@REQ-101'] }, async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  });

  test('a wrong password shows an error and stays on sign-in', { tag: ['@REQ-101'] }, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(DEMO_USER.email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/$/);
  });
});
