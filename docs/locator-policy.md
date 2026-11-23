# Locator policy

Prefer locators that describe what a user perceives. In order:

1. `getByRole(role, { name })`: buttons, links, headings, radios, alerts
2. `getByLabel(text)`: form fields
3. `getByText(text)`: static content
4. `getByTestId(id)`: only when 1–3 are impossible, and add the test id to the app on purpose
5. CSS/XPath: never in new tests

Why: role and label locators survive layout changes and double as accessibility checks. If a role-based locator can't find an element, that may be an accessibility bug. Escalate it rather than switching to CSS.

## Healing rules (triage agent)
A heal may change **how an element is found**, never **what is checked**.

Allowed: a locator update for a renamed button; a wait replaced with a web-first assertion; refreshed fixture data.

Not allowed (blocked or routed to a human): removing or loosening `expect`, adding skips, raising timeouts, changing visual baselines, editing requirements.
