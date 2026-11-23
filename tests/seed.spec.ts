// Seed test for Playwright's planner/generator agents: it shows how to reach a signed-in,
// deterministic starting state. Agents copy this setup rather than inventing their own.
import { test, expect } from '../skills/fixtures';

test('seed: signed-in shopper starts on Checkout with a fixed clock', async ({ signedInPage: page }) => {
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
});
