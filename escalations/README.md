# escalations/

Agents write one YAML file here whenever they believe the app is wrong, a requirement is unclear, or they need a person. **Reporting a real bug is a successful outcome.**

File name: `escalations/<timestamp>-<short-name>.yml`

```yaml
type: aut_bug            # aut_bug | needs_human | unclear_requirement
requirement_id: REQ-142
status: open             # open | answered | done
raised: 2026-11-22
test: tests/checkout/expired-card.spec.ts › blocks payment with an expired card

summary: |
  Plain-language description. Use a `|` block and wrap lines at ~75 characters
  so it reads without word wrap. First line = the one-sentence headline.

evidence: |
  evidence/run-…/artifacts/…/trace.zip

# ---- Your reply. Fill in, set status to "answered", and ask Claude to act on it. ----
answer:
  decision:              # the options are listed in each file
  notes: |
```

## How a person answers
1. Read `summary`. The first line is the headline.
2. Fill in `answer.decision` with one of the options in the comment, and add anything useful under `notes`.
3. Set `status: answered`.
4. Ask Claude to act on answered escalations. It fixes, tests, or files what was decided, then sets `status: done`.
5. Delete files marked `done` when you no longer need them (git history keeps them).

Changes to protected paths that an answer requires (`requirements/`, `inventory/`, `.github/`, …) are still made by a person.
