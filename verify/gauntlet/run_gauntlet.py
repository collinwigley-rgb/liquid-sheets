#!/usr/bin/env python3
"""v1.0 acceptance gauntlet, browser half.

Drives real headless Chromium against the running dev server
(http://localhost:8013/app/) and exercises the app's own ES modules
(storage.js) rather than mocks, so the persistence and recovery checks
test the genuine code path.

Covers, of the M5 gauntlet:
  - AI-absent proof (hosted build ships zero AI)
  - Offline / airplane mode (service worker serves the shell with no network)
  - Tab-kill persistence (IndexedDB survives a document teardown)
  - Delete-site-data + import-file recovery (real importDocFile path)

Not covered here (left for a human): building two differently-shaped
leagues end-to-end through the wizard UI. Engine correctness across shapes
is already golden-master-verified in verify/run_golden.mjs.

Run with the interpreter that owns the local Playwright install:
  /Library/Developer/CommandLineTools/usr/bin/python3 verify/gauntlet/run_gauntlet.py

Requires the dev server up (./dev.sh) and Playwright chromium installed.
Exits nonzero if any check fails.
"""

import os
import re
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright


def has_version(text):
    """True if the masthead text carries a V<number> tag (any version). Kept
    version-agnostic so a routine version bump never fails the gauntlet."""
    return bool(text) and re.search(r"\bV\d+", text) is not None

# Target the local dev server by default; set GAUNTLET_BASE to smoke-test a
# deployed URL (for example https://liquid-sheets.pages.dev/app/). ORIGIN is
# derived so the same-origin and cross-origin checks follow the target.
BASE = os.environ.get("GAUNTLET_BASE", "http://localhost:8013/app/")
_split = urlsplit(BASE)
ORIGIN = f"{_split.scheme}://{_split.netloc}"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    tag = "PASS" if ok else "FAIL"
    line = f"[{tag}] {name}"
    if detail:
        line += f"  ::  {detail}"
    print(line)


# A representative doc: not a full league board, but the exact structure the
# persistence and recovery layer must preserve losslessly. This is what "board
# identical after reopen" reduces to: the doc that drives the board survives
# byte-for-byte. Built on the app's real newDoc() inside the browser.
SEED_AND_ROUNDTRIP = r"""
async () => {
  const s = await import('/app/storage.js');
  const doc = s.newDoc();
  // a complete league, the shape finishWizard() produces, so the reloaded
  // board actually renders (slotOrder reads roster_slots).
  doc.league = { name: 'Gauntlet League', platform: 'sleeper', season: 2026,
    teams: 12, budget: 200, weeks: 17,
    roster_slots: { QB:1, RB:2, WR:2, TE:1, FLEX:1 },
    full_roster: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 },
    scoring: { pass:{yd:0.04,td:4,int:-2}, rush:{yd:0.1,td:6},
      rec:{yd:0.1,td:6,ppr_by_pos:{QB:0.5,RB:0.5,WR:0.5,TE:0.5}},
      misc:{fumble_lost:-2,two_pt:2} },
    model_params: { baseline_bench_share:0.15, vols_blend_alpha:0,
      tier_gap_theta:0.2, dollar_slots_per_team:14 },
    team_names: ['Me','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'],
    me: 0 };
  doc.names = { p1: 'Player One', p2: 'Player Two' };
  doc.runs = [{ run_id: 1, created_at: '2026-08-27T00:00:00.000Z',
    source_label: 'blend', as_of: 'test',
    meta: { baselines: { QB:14, RB:31, WR:37, TE:15 }, premium: 2244 },
    players: [
      { player_id:'p1', pos:'RB', team:'DET', proj_pts:250, vbd:80, dollar:51, tier:1, spread:null },
      { player_id:'p2', pos:'WR', team:'DAL', proj_pts:210, vbd:60, dollar:34, tier:1, spread:null } ] }];
  doc.journal = [{ type:'sale', seq:1, ts:'2026-08-27T00:00:00.000Z',
    pid:'p1', name:'Player One', pos:'RB', owner:3, price:48 }];
  doc.favorites = ['p2'];
  doc.calls = [{ pid: 'p1', delta: 3 }];
  doc.ui.theme = 'light'; doc.ui.themeChosen = true;
  await s.saveDoc(doc);
  return { seeded: true };
}
"""

AFTER_RELOAD_LOAD = r"""
async () => {
  const s = await import('/app/storage.js');
  const d = await s.loadDoc();
  if (!d) return { loaded: false };
  const fp = JSON.stringify({
    league: d.league, names: d.names, runs: d.runs, journal: d.journal,
    favorites: d.favorites, calls: d.calls,
    theme: d.ui.theme, themeChosen: d.ui.themeChosen });
  return { loaded: true, fp, exportJson: JSON.stringify(d, null, 1) };
}
"""

# Recovery: wipe the store, prove it is empty, then restore through the REAL
# importDocFile path (constructing a File the same way a user's upload would),
# and confirm the fingerprint returns.
RECOVERY = r"""
async (exportJson) => {
  const s = await import('/app/storage.js');
  await s.wipeDoc();
  const empty = await s.loadDoc();
  if (empty !== null) return { wiped: false };
  const file = new File([exportJson], 'liquid-sheets-backup.json',
    { type: 'application/json' });
  const restored = await s.importDocFile(file);
  const d = await s.loadDoc();
  const fp = JSON.stringify({
    league: d.league, names: d.names, runs: d.runs, journal: d.journal,
    favorites: d.favorites, calls: d.calls,
    theme: d.ui.theme, themeChosen: d.ui.themeChosen });
  return { wiped: true, restoredOk: !!restored, fp };
}
"""


# Multi-league: add a second league through the real storage API, confirm
# both are listed, the shared sources/names are visible from the new one,
# switching back returns the first league byte-for-byte, and deleting works
# down to an empty app.
MULTI = r"""
async () => {
  const s = await import('/app/storage.js');
  const a = await s.loadDoc();
  const fpA = JSON.stringify({ league: a.league, runs: a.runs, journal: a.journal,
    favorites: a.favorites, calls: a.calls });
  const b = s.newDoc();
  b.league = { name: 'Second', teams: 10, budget: 300 };
  b.ui.theme = a.ui.theme; b.ui.themeChosen = a.ui.themeChosen;
  b.sources = a.sources; b.names = a.names; b.player_meta = a.player_meta;
  await s.saveDoc(b);
  const list = await s.listLeagues();
  const cur = await s.loadDoc();
  const sharedNames = Object.keys(cur.names).length === Object.keys(a.names).length;
  await s.setActive(a.id);
  const back = await s.loadDoc();
  const okA = JSON.stringify({ league: back.league, runs: back.runs, journal: back.journal,
    favorites: back.favorites, calls: back.calls }) === fpA;
  await s.deleteLeague(b.id);
  const after = await s.listLeagues();
  await s.deleteLeague(a.id);
  const none = await s.loadDoc();
  return { two: list.length === 2, curIsB: cur.league.name === 'Second', sharedNames,
    okA, oneLeft: after.length === 1, none: none === null };
}
"""


def main():
    with sync_playwright() as p:
        exe = os.environ.get("GAUNTLET_CHROMIUM")
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        context = browser.new_context()

        # ---- collect network + console across the AI-absent load ----
        requests = []
        context.on("request", lambda r: requests.append(r.url))
        page = context.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        page.goto(BASE, wait_until="networkidle")

        # ---- TEST: shell actually rendered (stable anchor) ----
        ver = page.eval_on_selector(".ver", "el => el.textContent") if page.query_selector(".ver") else None
        check("shell renders (masthead version present)", has_version(ver),
              f"masthead={ver!r}")

        # ---- TEST: AI-absent proof ----
        cross = [u for u in requests if not u.startswith(ORIGIN)]
        check("no cross-origin requests on load", len(cross) == 0,
              f"cross-origin={cross}")
        copilot_fetched = [u for u in requests if "copilot" in u]
        check("copilot.js never fetched", len(copilot_fetched) == 0,
              f"copilot requests={copilot_fetched}")
        liveread = page.query_selector("#liveread")
        check("#liveread element absent", liveread is None)
        keyfield = page.query_selector("input[type=password]")
        check("no password/api-key input in DOM", keyfield is None)
        # open the gear menu if present, scan for AI/key entries
        ai_word = page.evaluate(
            "() => /api key|copilot|openai|anthropic key/i.test(document.body.innerText)")
        check("no AI/key wording in rendered body", ai_word is False)

        # ---- TEST: persistence round-trip (seed via real storage.js) ----
        # Seed, then reload once so the board settles (first render attaches a
        # default plan and re-saves). Capture the settled fingerprint, reload
        # again, and require the two reopens to be byte-identical.
        page.evaluate(SEED_AND_ROUNDTRIP)
        page.reload(wait_until="networkidle")
        settled = page.evaluate(AFTER_RELOAD_LOAD)
        check("tab-kill: doc persisted across reload", settled.get("loaded") is True)
        before = settled.get("fp")
        export_json = settled.get("exportJson")
        page.reload(wait_until="networkidle")
        after = page.evaluate(AFTER_RELOAD_LOAD)
        check("tab-kill: reloaded doc byte-identical", after.get("fp") == before,
              "fingerprint match" if after.get("fp") == before else "MISMATCH")

        # ---- TEST: delete-site-data + import-file recovery ----
        rec = page.evaluate(RECOVERY, export_json)
        check("recovery: store wiped to empty", rec.get("wiped") is True)
        check("recovery: importDocFile restored the doc", rec.get("restoredOk") is True)
        check("recovery: restored doc byte-identical", rec.get("fp") == before,
              "fingerprint match" if rec.get("fp") == before else "MISMATCH")

        # ---- TEST: multi-league (a league is a doc; sources shared) ----
        multi = page.evaluate(MULTI)
        check("multi: second league saved and listed", multi.get("two") is True)
        check("multi: new league is active after save", multi.get("curIsB") is True)
        check("multi: shared sources/names visible from second league", multi.get("sharedNames") is True)
        check("multi: switching back returns first league intact", multi.get("okA") is True)
        check("multi: delete leaves one, delete last -> empty", multi.get("oneLeft") is True and multi.get("none") is True)
        page.evaluate(RECOVERY, export_json)   # restore for the offline pass

        # ---- TEST: offline / airplane mode ----
        # ensure the service worker controls the page first
        page.goto(BASE, wait_until="networkidle")
        page.evaluate("() => navigator.serviceWorker.ready")
        # reload once so the SW takes control, then cut the network
        page.reload(wait_until="networkidle")
        controlled = page.evaluate("() => !!navigator.serviceWorker.controller")
        check("service worker controls the page", controlled is True)

        failed = []
        page.on("requestfailed", lambda r: failed.append(r.url))
        context.set_offline(True)
        offline_ok = True
        offline_detail = ""
        try:
            page.reload(wait_until="domcontentloaded")
        except Exception as e:
            offline_ok = False
            offline_detail = f"reload threw: {e}"
        ver_off = page.eval_on_selector(".ver", "el => el.textContent") if page.query_selector(".ver") else None
        shell_ok = has_version(ver_off)
        shell_failed = [u for u in failed if u.startswith(ORIGIN)]
        check("offline: app shell still renders", offline_ok and shell_ok,
              offline_detail or f"masthead={ver_off!r}")
        check("offline: no same-origin shell request failed", len(shell_failed) == 0,
              f"failed={shell_failed}")
        context.set_offline(False)

        check("no uncaught console errors during run", len(console_errors) == 0,
              f"errors={console_errors[:3]}")

        browser.close()

    print()
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"=== {passed}/{total} checks passed ===")
    if passed != total:
        sys.exit(1)


if __name__ == "__main__":
    main()
