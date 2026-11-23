---
id: REQ-150
title: Correct order total on checkout and confirmation
status: in-scope
journey: Checkout → Confirmation
---

## Acceptance criteria (EARS)
- **AC1:** WHILE the cart contains items THE SYSTEM SHALL show a total equal to the sum of quantity × unit price, in USD with two decimals.
- **AC2:** WHEN an order is confirmed THE SYSTEM SHALL show the same total on the confirmation page.

## Reference data (demo cart)
| Item | Qty | Unit price |
| --- | --- | --- |
| Widget | 2 | $10.00 |
| Gadget | 1 | $15.50 |
| **Total** | | **$35.50** |

## Out of scope
- Tax, shipping, discounts.
