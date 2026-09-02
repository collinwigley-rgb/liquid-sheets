# Friday Draft attack plan (2026-09-02)

Real Money_Talks auction: **Friday 2026-09-04, 6:30 PM CT**. This document
is the build order and the reasoning behind it -- not a status tracker.
Status lives on the GitHub issues (milestone "Friday Draft (Money_Talks)");
update this doc only if the order or reasoning itself changes, not for
day-to-day progress.

## Order and why

1. **#1 Superflex + 2 IDP-flex auction math** -- first, because nothing
   downstream (dollar values, the "Call" verdict, budget math) means
   anything until the engine's replacement-level/VBD math actually
   reflects Money_Talks' real roster shape. Building on top of wrong
   baselines would mean redoing everything else.
2. **#2 + #4 together (scoring settings -> re-scored projections)** --
   `sleeper.md` already has Money_Talks' full `scoring_settings`, and
   `engine/engine.js` already re-scores raw stat lines under a supplied
   scoring config (`scoreStatLine`) rather than trusting a source's own
   point total -- this is the existing upstream design, not something to
   build from scratch. The real work is (a) shaping Money_Talks' Sleeper
   scoring settings into the engine's `cfg.scoring` shape, including the
   IDP weights the current shape doesn't have a slot for yet, and (b)
   deciding how that config gets into the app.
   **Decision: bake it in as a generated static config, not a live
   client-side fetch.** This is a one-and-done deployment for one league
   that already has its scoring settings pinned down in `sleeper.md` --
   a live fetch on every page load adds a runtime dependency and a CORS
   surface for zero real benefit here, when a checked-in config generated
   once from the same API call is simpler and can't fail live on draft
   night. Revisit only if the league's scoring config actually changes
   between now and Friday.
3. **#3 Keepers** -- straightforward once #1/#2 land: mark the 11 known
   keepers unavailable, seed each team's starting budget at
   `$200 - keeper_cost` from the real amounts already in `sleeper.md`.
   No remaining unknowns, so this is fast.
4. **#5 Live draft read + #6 Mock draft room together** -- same polling
   code path against two different draft_ids (real vs. mock), per
   `sleeper.md`. Build once, test against the live mock now, point at the
   real draft_id Friday.
5. **#7 Deploy target** -- last on purpose: no point deploying early
   copies before the real functionality exists, but it cannot be left
   until Friday afternoon either. Targeted for completion once #1-#3 are
   in, in parallel with #5/#6.

## Working agreement

- One issue owned/in-progress at a time per agent, assigned on GitHub so
  Ricky's agent can see at a glance what's already claimed.
- Close the issue (with a comment on what shipped and any follow-up) the
  moment its acceptance criteria are met, then move to the next in order
  above -- don't batch multiple issues into one uncommitted working state.
- Deviations from this order are fine if a real blocker shows up, but
  update this doc's reasoning if the order changes, not just the issues.
