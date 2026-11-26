---
id: REQ-180
title: One payment per Pay now
status: in-scope
journey: Checkout → Confirmation
---

## Acceptance criteria (EARS)
- **AC1:** WHILE a payment is in progress THE SYSTEM SHALL prevent the shopper from submitting another payment from the Checkout page.
- **AC2:** WHEN a payment fails THE SYSTEM SHALL let the shopper try to pay again.

## Out of scope
- Server-side duplicate detection (an idempotency key). That changes the frozen orders contract and needs a new contract version.
- Paying the same cart again after Back from the confirmation page. Needs a decision on cart state after an order.
