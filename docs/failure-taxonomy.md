# Failure taxonomy

Every failing test gets exactly one class. The triage agent records it in `memory/failures.jsonl`. The weekly improver turns recurring classes into a guide (playbook bullet, skill fix) or a sensor (lint rule, hook, check).

| Class | Meaning | Correct response |
| --- | --- | --- |
| `aut_bug` | The app does not meet the requirement | Escalate with evidence. **Do not touch the test.** |
| `environment` | Preview down, seed data missing, network to a dependency failed | Retry once after a health check; escalate if it persists |
| `flake` | Passes and fails on the same build | Record it; fix the cause (waits, data isolation). Never add sleeps |
| `locator_drift` | UI changed in an intended way; the test can't find the element | Heal the locator via PR (allowed) |
| `test_data` | Fixture or factory data is wrong or stale | Fix the fixture via PR |
| `wrong_assertion` | The test checks something the requirement doesn't say | **Human only.** Escalate as `needs_human` |
| `requirement_unclear` | The requirement is ambiguous or contradicts the app | Escalate as `unclear_requirement` |

## failures.jsonl line format
```json
{"ts":"2026-11-22T10:00:00Z","run":"run-…","test":"tests/checkout/expired-card.spec.ts › blocks payment…","requirement_id":"REQ-142","class":"aut_bug","error":"first line of the error","action":"escalated","guide_or_sensor":null}
```
