// Test data factories. Keep data here, not inline in tests, so a data change is one reviewed edit.

export const CARDS = {
  valid: { id: 'card_visa', name: /Visa/ },
  expired: { id: 'card_mc', name: /Mastercard/ },
} as const;

export const DEMO_CART_ITEMS = [
  { sku: 'WID-1', qty: 2 },
  { sku: 'GAD-7', qty: 1 },
];

/** Expected total for the demo cart (REQ-150): 2 × $10.00 + 1 × $15.50. */
export const DEMO_CART_TOTAL = 35.5;
export const DEMO_CART_TOTAL_TEXT = '$35.50';

export function orderRequest(cardId: string = CARDS.valid.id) {
  return { cardId, items: DEMO_CART_ITEMS };
}
