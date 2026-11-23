# scorecard/

Written by `npm run canary`.

- `latest.json`: the most recent scorecard (per target: suite and evaluator)
- `history.jsonl`: one line per canary run, for trend charts
- `runs/<timestamp>/`: raw reports (git-ignored)

| Metric | Meaning | Target |
| --- | --- | --- |
| `tpr_holdout` | Planted bugs caught on the **held-out** split | Must not drop between harness changes |
| `tpr_optimisation` | Planted bugs caught on the split agents may tune against | Informational |
| `tnr` | Healthy runs that passed (1 − false-alarm rate) | 100% |
| `pass_k_healthy` | Every one of k healthy runs passed | `true` |
| `impossible_green` | Impossible builds reported as passing | **0, always** |
