---
id: REQ-101
title: Sign in with email and password
status: in-scope
journey: Sign in → Checkout
---

## Acceptance criteria (EARS)
- **AC1:** WHEN a registered shopper submits a correct email and password THE SYSTEM SHALL take them to the Checkout page.
- **AC2:** WHEN a shopper submits an incorrect password THE SYSTEM SHALL keep them on the sign-in page AND show the message "Invalid email or password".

## In scope
- Email + password sign-in for the demo account `demo@example.com` / `correct-horse`.

## Out of scope
- Password reset, social login, MFA.
