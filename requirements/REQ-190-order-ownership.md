---
id: REQ-190
title: Only the buyer can see an order
status: in-scope
journey: Checkout → Confirmation
---

## Acceptance criteria (EARS)
- **AC1:** WHEN a shopper opens the confirmation page of an order they placed THE SYSTEM SHALL show it.
- **AC2:** WHEN a shopper opens the confirmation page of an order another shopper placed THE SYSTEM SHALL respond 404 and show "Order not found".
- **AC3:** WHEN the confirmation page is opened with an order id that does not exist THE SYSTEM SHALL respond 404 and show "Order not found".

## Reference data
| Account | Password |
| --- | --- |
| demo@example.com | correct-horse |
| other@example.com | battery-staple |
