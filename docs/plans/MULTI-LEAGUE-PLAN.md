# Multi-league plan

Status: PROPOSED 2026-08-30, awaiting Levi's sign-off. Nothing here is built.

## What Levi asked for

- Manage more than one league in the app.
- The masthead subtitle shows the league's name (landed in V37 as a wizard
  field) and becomes a dropdown selector with an "add new" entry, like the
  values-from (source) picker.
- A plan for how switching leagues has to work across the whole app.

Also folded in, because it is the same feature: a way to delete a league or
start over from a blank app (today the only route is clearing site data).

## The one design decision that makes this small

Today the app has ONE document (`doc`) with everything in it: `league`,
`sources`, `runs`, `journal`, `calls`, `favorites`, `market`, `names`,
`player_meta`, `ui`. `app.js` touches `doc.` in roughly 400 places.

Option A, nest leagues inside the doc (`doc.leagues[id].runs` ...) means
rewriting all of those references. High blast radius, easy to miss one.

Option B (recommended): **a league IS a doc.** Keep today's per-league document
shape exactly as it is, and store several of them in IndexedDB under their own
keys instead of the single `"main"` key. A tiny shared `meta` record says which
one is active and holds the app-wide preferences (theme). `app.js` keeps
working on one `doc` at a time and barely changes; all the multi-league logic
lives in `storage.js` plus one switch routine.

Everything below assumes Option B.

## Storage (`app/storage.js`)

IndexedDB store `docs` (already exists) gains:

- `meta` key: `{ active: <id>, order: [ids], theme, themeChosen }`.
  Theme moves here because it is a preference of the person, not the league.
- One key per league: `league:<id>` -> today's doc shape, unchanged, plus
  `doc.id` and `doc.created_at`.

API stays almost identical, which is why the rest of the app barely notices:

| today | after |
|---|---|
| `loadDoc()` | `loadDoc()` returns the ACTIVE league's doc (or null if none) |
| `saveDoc(doc)` | `saveDoc(doc)` saves under `league:<doc.id>` |
| `wipeDoc()` | `deleteLeague(id)`; if it was active, activate the next in `order` |
| `newDoc()` | `newDoc()` also mints an id and registers it in `meta.order` |
| (new) | `listLeagues()` -> `[{id, name, teams, budget}]` for the dropdown, read from each doc's `league` block without loading whole docs into app state |
| (new) | `setActive(id)` |
| (new) | `loadMeta()` / `saveMeta()` |

**Migration 2 -> 3**: on first load, if a `"main"` key exists, move it to
`league:1`, write `meta = {active: 1, order: [1], theme from doc.ui}`, delete
`"main"`. Idempotent. The existing `migrate(doc)` forward-fill keeps running on
every doc. The `SCHEMA_VERSION` of a league doc stays the doc's own version;
the store-level layout change is versioned by the IndexedDB `open(..., 2)`
upgrade, which is where the key move happens.

## Switching (`app/app.js`, one routine)

`switchLeague(id)`:

1. `await saveDoc(doc)` (flush the league you are leaving).
2. `await setActive(id)`; `doc = await loadDoc()`.
3. Reset every piece of module state that was derived from the old doc. This
   is the list that matters, because a stale one is a subtle bug:
   - `curRun`, `curSales` (rebuilt by `buildModel()`)
   - staged player / sale form (`resetSale()`)
   - `importState = null`, `wizardState.editing = false`
   - the `#runsel` values-from selection (reads `doc.ui.run`, fine)
   - plan editor state (reads `doc`, fine)
   - copilot: cancel any in-flight read (self-host only; `cp?.cancel()`)
   - the `mScale` / `doc.market` derived numbers (recomputed in `refreshRoom`)
4. Take the same path as app boot: `doc.league ? renderBoardScreen() : renderWizard()`.
   Reusing boot is the whole trick; there is no second "switch" render path to
   keep in sync.
5. `applyTheme()` from meta (unchanged by a switch, but cheap).

"Add new": `doc = newDoc(); setActive(doc.id); renderWizard()`. The wizard's
League name field is step 1, so a new league is named before anything else.

Cancel on a brand-new league's wizard (no `league` yet) should delete that
empty doc and switch back to the previous league, so abandoning "add new" does
not leave a nameless ghost in the dropdown.

## The masthead picker (`app/index.html` + `app.js`)

Replace the `#spendline` subtitle with a `<select id="leaguesel">` styled like
`#runsel`:

- Options: one per league (`name`), plus a divider and `+ Add new league`.
- Current league selected. `onchange` -> `switchLeague(id)` or add-new.
- On the wizard screen (no league yet) the select still shows so you can bail
  back to an existing league.
- The old "12 TEAMS X $200" text moves into the option label as a suffix only
  when two leagues share a name (disambiguation), otherwise it is noise.
- Market scale ("X MARKET 1.02") moves to a tooltip on the select; it is
  diagnostic, not identity.

## League settings and delete

`gear > League settings` (exists) gets a **Delete this league** at the bottom of
the edit wizard, armed the same way as Reset board (click twice within 5s).
Deleting:
- removes the doc, updates `meta.order`;
- if others remain, switches to the next one;
- if it was the last, creates a fresh blank doc and opens the wizard. This is
  the "start over as a first-time user" path that is missing today.

## Export / import

- **Export backup** exports the ACTIVE league (today's behavior, file name
  gains the league name). Users who want everything use **Export all leagues**
  (new, writes `{bundle: true, leagues: [docs...]}`).
- **Import backup**:
  - a single-league file (any schema <= current) imports as a NEW league and
    switches to it; it never overwrites the active league silently. If a
    league with the same `id` exists, it gets a fresh id.
  - a bundle imports every league the same way.
  This is a behavior change from today (import replaced the one doc) and is
  the safer default once there are several.

## Things that do NOT change

- `engine/engine.js` (golden master stays zero-diff).
- The per-league doc shape, the wizard, The Call, the room, the plan layer.
- The service worker (no new shell files).
- `verify/gauntlet/run_gauntlet.py` keeps working because it only calls
  `newDoc / saveDoc / loadDoc / wipeDoc / importDocFile`; `wipeDoc` becomes a
  thin alias for deleting the active league so the harness stays green. Add
  two checks: switching leagues round-trips both docs intact, and deleting the
  last league lands on the wizard.

## Order of work (one build, about 200 lines)

1. `storage.js`: meta record, per-league keys, IndexedDB v2 upgrade with the
   `main -> league:1` move, `listLeagues / setActive / deleteLeague`, theme in
   meta. Run the gauntlet: must still be 15/15 with no app changes.
2. `app.js`: `switchLeague`, add-new, cancel-on-new, theme from meta.
3. Masthead picker replacing `#spendline`.
4. Delete in League settings; last-league -> wizard.
5. Export all / import-as-new.
6. Gauntlet: two new checks. Bump masthead + SW cache. Ship.

## Open questions for Levi

1. Should projection sources be shared across leagues? They are raw stats, so
   in principle yes, but "as of" dates and the player pool differ by fetch.
   Recommendation: per-league (simplest, matches "a league is a doc"); the
   one-click Sleeper fetch makes re-pulling cheap.
2. Import semantics: confirm "import always creates a new league" is what you
   want, versus an option to overwrite the active one.
