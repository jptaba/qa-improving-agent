# Expert labels for calibration (human-owned)

Before the evaluator gates merges, check it against a domain expert's judgement.

1. Collect **20–50 tasks** from real failures and journeys. Include negative cases (behaviour that should *not* happen).
2. A principal domain expert labels each task **pass** or **fail** and writes a one-line critique. A second expert labels a sample to check agreement.
3. Split about **10–20% train / 40–45% dev / 40–45% test**. Tune the evaluator on train and dev only.
4. Report on the **test** split, separately:
   - **TPR**: share of truly failing builds the evaluator marked `fail`
   - **TNR**: share of truly passing builds the evaluator marked `pass`
5. Re-run on every evaluator prompt or model change.

Record labels in `calibration.csv` (template provided).
