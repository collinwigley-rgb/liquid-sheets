---
status: accepted
date: 2026-08-30
decision-makers: Levi Zortman
consulted: []
informed: []
related: "[ADR-0005](0005-plain-structures-indexeddb-storage.md), [MULTI-LEAGUE-PLAN](../../docs/plans/MULTI-LEAGUE-PLAN.md)"
---

# Multiple leagues: a league is a document, stored under its own IndexedDB key

## Decision

Each league is stored as its own IndexedDB record (`league:<id>`), alongside one shared `meta` record (active id, league order, person-level theme) and one shared record of app-wide data (projection sources, player names, player meta). The app continues to operate on a single reassembled `doc` at a time, in exactly the pre-multi-league shape; `storage.js` decomposes it on save and reassembles it on load, so the ~400 `doc.` references in `app.js` are untouched.

## Context and Problem Statement

The app started single-league: one versioned document under the key `main` held everything (ADR-0005). Users need to run several leagues (different budgets, rosters, scoring) without re-doing setup or losing one league's draft to another. How do we add multiple leagues without a risky rewrite of the code that reads and writes the document everywhere?

## Decision Drivers

* `app.js` touches `doc.` in roughly 400 places; anything that changes the doc's shape is high blast radius
* `engine/engine.js` and the golden master must stay byte-stable; leagues are a storage concern, not an engine concern
* Projection sources are raw stat lines; importing them once should serve every league (re-pulling per league is waste)
* Theme is a preference of the person, not of a league
* A backup should still be one file, and old single-league backups must keep importing

## Considered Options

* Nest leagues inside the one document (`doc.leagues[id].runs` ...), rewriting the ~400 references
* A league is a document: several per-league records plus a small shared meta/data record ("a league is a doc")
* A separate IndexedDB database per league

## Decision Outcome

Chosen option: **a league is a doc.** `loadDoc()` returns the active league with the shared parts and theme attached; `saveDoc()` strips them back out, assigns an id on first save, and marks that league active. `SCHEMA_VERSION` goes to 3 with a one-time migration moving the old `main` doc to `league:1`. `switchLeague()` flushes the current doc, activates another, reloads, resets the state derived from the old doc (current run, sales, staged player, import state), and takes the same path as boot (board if set up, else the wizard). Sources are shared app-wide; theme is per-league; a backup is a bundle of every league plus the shared data.

### Consequences

* Good, because the app code barely changed and the engine and golden master were completely untouched
* Good, because one storage module owns all multi-league logic, so the surface area of the change is small and testable
* Good, because sharing sources means one import lights up every league
* Bad, because `storage.js` is now more involved (decompose/reassemble, a migration, a shared record)
* Bad, because switching leagues must carefully reset every piece of derived module state; a missed one is a subtle bug (one such bug, re-saving a deleted league, was caught in testing)

### Confirmation

The gauntlet gained five multi-league checks (`verify/gauntlet/run_gauntlet.py`): a second league is saved and listed, becomes active, sees the shared sources, switching back returns the first league byte-for-byte, and delete works down to an empty app. A headless walk exercised add / cancel / add / switch / delete, and a legacy single-doc-to-`league:1` migration test confirmed existing users carry forward.

## Approval Checklist

- [x] Reviewed by: Levi Zortman (working session, 2026-08-30)
- [x] Approved by: Levi Zortman
- [x] Status updated to accepted
