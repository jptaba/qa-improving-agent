# Playbook (reflective memory)

Rules for this file:
- **Append and curate. Never rewrite the whole file.** Rewriting erodes detail over time ("context collapse").
- One bullet per lesson, with an ID, hit/miss counters and provenance (the trace or PR that taught it).
- Bullets are added by `qa-improver` through a PR and approved by a person. Bullets with many misses get retired by `qa-gardener`.

---

- [PB-001] Card expiry depends on "today". Always call `page.clock.setFixedTime(FIXED_NOW)` before navigating to checkout, or tests pass today and fail next year. hits: 0 misses: 0 provenance: seed added-by: human
- [PB-002] Sign-in sets an HttpOnly `session` cookie. For API tests, call `POST /api/login` with the `request` fixture first; it keeps the cookie for later calls. hits: 0 misses: 0 provenance: seed added-by: human
- [PB-003] The Pay now button submits a form. Assert the outcome (URL + alert or heading), never a spinner or a timing. hits: 0 misses: 0 provenance: seed added-by: human
