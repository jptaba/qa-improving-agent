# Requirement draft: REQ-190 (for a person to copy into `requirements/`)

Source: `escalations/2026-11-24T1401-confirmation-page-access.yml`.
Agents may not write to `requirements/`, so this draft waits here. To accept it, save the block
below as `requirements/REQ-190-order-ownership.md` (edit freely), then add the inventory entry at the end.

```markdown
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
```

Already done (commit on `windows-verification-req160`):
- App: `demo-aut/server.mjs` records who placed each order and returns 404 "Order not found" for
  unknown or other shoppers' orders. Adds the second demo account `other@example.com`.
- Helpers: `OTHER_USER` in `skills/fixtures.ts`.
- Tests: `tests/checkout/order-ownership.spec.ts` (tagged `@REQ-190`). Both tests failed on the old code.

Inventory entry to add to `inventory/tests.json`:
```json
{ "id": "T-0190-01", "requirement_id": "REQ-190", "criterion": "AC1–AC3: confirmation visible to its buyer only; 404 otherwise", "test": "tests/checkout/order-ownership.spec.ts", "status": "passing" }
```
