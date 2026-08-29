# Phase 0 Execution Plan: Charter and repo setup

Status: COMPLETE (2026-08-18). All steps done. Originally published to the personal LeviZ account; transferred to the liquid-workflows org 2026-08-29, now at https://github.com/liquid-workflows/liquid-sheets.
Parent: [MASTER-PLAN.md](../MASTER-PLAN.md)

## Inputs already decided by Levi (2026-08-18)

- liquidsheets.com is available (checked by Levi). Preference is NOT to buy it yet; the leading option is a subdomain of his existing Liquid Workflows domain, which fits the portfolio framing better.
- No monetization, ever. This is a portfolio piece that would be fun to show off if it gains traction.

## Steps

1. **Name risk check**: search for existing products, apps, or trademarks named "Liquid Sheets" / "LiquidSheets" that would make the name a liability. Record findings. (The name is otherwise settled: the app keeps the Liquid Sheets name.)
2. **License decision**: pick and commit a license. Working call: MIT. Rationale: never-monetize plus portfolio visibility means maximum-permissive is all upside; there is no business model to protect.
3. **Charter**: write CHARTER.md with the success definition, name decision record, license rationale, and hosting posture (subdomain of Liquid Workflows; exact subdomain deferred to Phase 5).
4. **Repo skeleton**: `git init` the `liquid-sheets-public/` directory itself as the repo. Add LICENSE, README.md, .gitignore, docs/adr/ (empty, ready for Phase 1), phase-plans/. Initial commit. The planning docs stay IN the public repo deliberately: the visible process is part of the portfolio value.
5. **GitHub**: publishing to GitHub requires the account decision (github-personal vs github-wck per Levi's global rule). Clearly personal, but pushing a new public repo is outward-facing, so this step is: prepare everything, then confirm with Levi before the actual push.
6. **Close out**: append LEARNINGS to MASTER-PLAN.md, mark Phase 0 complete there.

## Exit gate (from master plan)

Name chosen, repo exists, success definition written.
