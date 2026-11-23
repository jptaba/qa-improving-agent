---
id: REQ-160
title: Orders API contract
status: in-scope
journey: API — create order
contract: requirements/openapi/orders.yaml
---

## Acceptance criteria (EARS)
- **AC1:** WHEN an authenticated client POSTs a valid order to `/api/orders` THE SYSTEM SHALL respond `201` with a JSON body containing `id` (string), `total` (number), `currency` ("USD") and `status` ("confirmed").
- **AC2:** WHEN an unauthenticated client POSTs to `/api/orders` THE SYSTEM SHALL respond `401`.
- **AC3:** WHEN the order uses an expired card THE SYSTEM SHALL respond `422` with `{"error":"card_expired"}`.

## Notes
- The contract in `openapi/orders.yaml` is **frozen at requirement sign-off**. A change needs a new requirement version.
- No builder test exists yet. This requirement is in the orchestrator's authoring queue (see `inventory/tests.json`).
