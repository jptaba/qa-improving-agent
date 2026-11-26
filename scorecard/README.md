# scorecard/

Written by `npm run canary`.

- `latest.json`: the most recent scorecard (per target: suite and evaluator)
- `history.jsonl`: one line per canary run, for trend charts
- `runs/<timestamp>/`: raw reports (git-ignored)

| Metric | Meaning | Target |
| --- | --- | --- |
| `tpr_holdout` | Planted bugs **caught on their own requirement** in the held-out split | Must not drop between harness changes |
| `tpr_all` / `tpr_optimisation` | Same, across all faults / the split agents may tune against | Informational |
| `any_failure_rate` | Planted bugs that made *something* fail, even an unrelated test | ≥ `tpr_all`; the gap is collateral-only detection |
| `flagged_not_caught` | Bugs that only broke other tests: a coverage gap for that requirement | Empty |
| `tnr` | Healthy runs that passed first time, no retries (1 − false-alarm rate) | 100% |
| `pass_k_healthy` | Every one of k healthy runs passed | `true` |
| `impossible_green` | Impossible builds reported as passing | **0, always** |

## Options
```bash
npm run canary -- --k 3              # healthy runs per target (pass^k)
npm run canary -- --parallel 2       # concurrent scenarios (default: min(4, CPU cores))
npm run canary -- --timeouts default # use normal timeouts if your AUT is slow (fast is for the demo AUT)
npm run canary -- --only evaluator   # one target only
npm run canary -- --faults total-wrong,impossible
```
Each scenario gets its own app instance, port and artifacts folder, so parallel runs can't interfere.
