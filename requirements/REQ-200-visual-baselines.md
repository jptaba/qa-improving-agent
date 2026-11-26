---
id: REQ-200
title: Pages look as approved
status: in-scope
journey: Sign in, Checkout, Confirmation, Not found
---

## Acceptance criteria (EARS)
- **AC1:** THE SYSTEM SHALL render the sign-in, checkout, order confirmation and "page not found" pages so that each matches its approved screenshot at a 1280×720 viewport, ignoring the order id.
- **AC2:** WHEN the look of a page changes THE SYSTEM SHALL NOT have its approved screenshot replaced unless the change is approved by the project owner (the `visual-approved` label on the pull request).

## Notes
- "Match" means within Playwright's default screenshot tolerance, with animations disabled and the clock fixed.
- Approved screenshots are taken in the Linux CI container, so fonts and rendering match the run that checks them. Visual checks run only there.
- Written by Claude on the owner's instruction (2026-11-26), from the draft in `proposals/requirement-draft-REQ-200-visual-baselines.md`.
