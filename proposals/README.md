# proposals/

`qa-improver` and `qa-gardener` write proposed harness changes here, **one change per file**, each with:
- the failure cluster it addresses (with trace links)
- the change (a playbook bullet, a skill fix, or a sensor spec with its exact error message)
- the scorecard **before** and **after** (`npm run canary`)

A person reviews and applies or rejects each proposal. A change is accepted only if the held-out scorecard does not get worse.
