# Manual accessibility checklist (REQ-170, Phase 3)

Automated axe scans catch only part of real accessibility issues (REQ-170 notes: ~57% by volume).
A person runs this checklist on the sign-in and checkout pages before each release, and whenever
those pages change. Record the result in the release notes: date, tester, browser + assistive tech, pass/fail per row.

Run the app with `npm run aut` and open http://localhost:4173.

## Keyboard only (unplug the mouse)
| # | Check | Pages |
| --- | --- | --- |
| K1 | Tab reaches every field, radio and button, in visual order | sign-in, checkout |
| K2 | Focus is always visible (you can tell where you are on every Tab) | sign-in, checkout |
| K3 | Enter submits the sign-in form; Space/arrows change the payment card | sign-in, checkout |
| K4 | Nothing traps focus; Shift+Tab goes back the same way | sign-in, checkout |

## Screen reader (NVDA on Windows, or VoiceOver on macOS)
| # | Check | Pages |
| --- | --- | --- |
| S1 | Page title is announced and names the page ("Sign in · Demo Shop") | sign-in, checkout |
| S2 | Each field is read with its label ("Email, edit text") | sign-in |
| S3 | A wrong password announces "Invalid email or password" without moving focus manually | sign-in |
| S4 | Cart table is read as a table with column headers | checkout |
| S5 | Card radios are read as a group named "Payment method", with the expiry date | checkout |
| S6 | Paying with an expired card announces "This card has expired. Update card to continue." | checkout |

## Visual
| # | Check | Pages |
| --- | --- | --- |
| V1 | Zoom to 200%: no content cut off, no horizontal scroll at 1280px wide | sign-in, checkout |
| V2 | Reflow at 320px wide: everything usable in one column | sign-in, checkout |
| V3 | Error messages are not shown by colour alone (they have text) | sign-in, checkout |
| V4 | Windows High Contrast / forced colours: buttons, fields and focus still visible | sign-in, checkout |

A failed row is a bug: escalate it like any other (`escalations/`, type `aut_bug`, requirement `REQ-170`).
