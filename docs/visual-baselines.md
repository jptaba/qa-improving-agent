# Visual baselines (REQ-200)

`tests/visual/pages.spec.ts` compares four pages (sign-in, checkout, order confirmation, page not found) with approved screenshots at 1280×720. The order id line is masked, animations are off and the clock is fixed.

## Where they run
Only in the Linux CI container (`mcr.microsoft.com/playwright:v1.65.1-noble`), where the screenshots were taken. `playwright.config.ts` adds the `visual` project only when `PW_VISUAL=1`, which the `e2e`, `canary-gate` and nightly `canary` jobs set. Locally the project is left out (not skipped), because fonts on Windows and macOS render differently.

## Taking or changing a baseline
1. Push a branch named `visual/<something>` with the test or page change. The `visual-baselines` workflow takes the screenshots in the container and uploads them as the `visual-baselines` artifact. You can also start it by hand from the Actions tab on any branch.
2. Download the artifact (`gh run download <run id> -n visual-baselines -D tests/visual`), commit the `pages.spec.ts-snapshots/` files on the branch and open a PR.
3. The PR cannot merge until the owner adds the **`visual-approved`** label. `heal-diff-check` fails any PR that changes a `-snapshots/` file without it (REQ-200 AC2). Adding the label re-runs the checks.

Agents may do steps 1 and 2, but only the owner adds the label. Look at the new screenshots in the PR's "Files changed" view before adding it.
