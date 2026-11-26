# Requirement draft: REQ-180 (for a person to copy into `requirements/`)

Source: `escalations/2026-11-24T1400-double-submit-creates-duplicate-orders.yml`.
Agents may not write to `requirements/`, so this draft waits here. To accept it, save the block
below as `requirements/REQ-180-single-payment.md` (edit freely), then add the inventory entry at the end.

```markdown
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
```

Already done (commit on `windows-verification-req160`):
- App: `demo-aut/server.mjs` disables Pay now while the request is in flight and re-enables it on failure.
- Tests: `tests/checkout/single-payment.spec.ts` (tagged `@REQ-180`). The AC1 test failed on the old code.

Inventory entry to add to `inventory/tests.json`:
```json
{ "id": "T-0180-01", "requirement_id": "REQ-180", "criterion": "AC1+AC2: one payment at a time; retry after failure", "test": "tests/checkout/single-payment.spec.ts", "status": "passing" }
```
