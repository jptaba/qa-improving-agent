# escalations/

Agents write one JSON file here whenever they believe the app is wrong, a requirement is unclear, or they need a person. **Reporting a real bug is a successful outcome.**

```json
{
  "type": "aut_bug | needs_human | unclear_requirement",
  "requirement_id": "REQ-142",
  "test": "tests/checkout/expired-card.spec.ts › blocks payment with an expired card",
  "summary": "Expired Mastercard was charged; requirement AC1 says payment must be blocked",
  "evidence": "evidence/run-…/artifacts/…/trace.zip"
}
```

A person triages this folder daily: file real bugs in your tracker, answer unclear requirements, then delete the escalation.
