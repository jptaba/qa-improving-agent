import { test, expect } from '@playwright/test';
import { newShopper, placeOrder } from './support';

// REQ-190 Only the buyer can see an order.

test.describe('REQ-190', () => {
  test('AC1: the buyer can open their own confirmation page', { tag: ['@REQ-190'] }, async ({ browser }) => {
    const { context, page } = await newShopper(browser, 'buyer');
    const id = await placeOrder(page);
    const res = await page.goto(`/confirmation?id=${id}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText('Order confirmed')).toBeVisible();
    await expect(page.getByText(id)).toBeVisible();
    await context.close();
  });

  test('AC2: another shopper gets 404 "Order not found" for the order', { tag: ['@REQ-190'] }, async ({ browser }) => {
    const buyer = await newShopper(browser, 'buyer');
    const id = await placeOrder(buyer.page);
    const other = await newShopper(browser, 'other');
    const res = await other.page.goto(`/confirmation?id=${id}`);
    expect(res?.status()).toBe(404);
    await expect(other.page.getByText('Order not found')).toBeVisible();
    await expect(other.page.getByText(id)).toHaveCount(0);
    await expect(other.page.getByText('Order confirmed')).toHaveCount(0);
    await buyer.context.close();
    await other.context.close();
  });

  test('AC3: an unknown order id gives 404 "Order not found"', { tag: ['@REQ-190'] }, async ({ browser }) => {
    const { context, page } = await newShopper(browser, 'buyer');
    const res = await page.goto('/confirmation?id=ord_doesnotexist');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Order not found')).toBeVisible();
    await context.close();
  });
});
