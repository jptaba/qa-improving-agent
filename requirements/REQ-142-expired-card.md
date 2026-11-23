---
id: REQ-142
title: Block checkout with an expired saved card
status: in-scope
journey: Checkout → Pay
---

## Acceptance criteria (EARS)
- **AC1:** WHEN the shopper selects a saved card whose expiry month has passed AND selects "Pay now" THE SYSTEM SHALL keep the shopper on the Checkout page AND show "This card has expired. Update card to continue."
- **AC2:** WHEN the shopper selects a saved card that has not expired AND selects "Pay now" THE SYSTEM SHALL create the order AND show the "Order confirmed" page.
- **AC3:** A card is valid through the last day of its expiry month.

## In scope
- Saved cards shown on the Checkout page.

## Out of scope
- Adding or updating cards.
