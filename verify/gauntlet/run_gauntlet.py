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
  doc.league = { name: 'Gauntlet League', teams: 12, budget: 200,
    roster: { QB:1, RB:2, WR:2, TE:1, FLX:1, K:1, DEF:1, BN:6 }, platform: 'sleeper' };
  doc.names = { p1: 'Player One', p2: 'Player Two' };
  doc.runs = [{ id: 'r1', kind: 'blend', rows: [
    { pid: 'p1', pos: 'RB', usd: 51, proj_pts: 250 },
    { pid: 'p2', pos: 'WR', usd: 34, proj_pts: 210 } ] }];
  doc.journal = [{ pid: 'p1', team: 3, price: 48, at: '2026-08-27T00:00:00.000Z' }];
  doc.favorites = ['p2'];
  doc.calls = [{ pid: 'p1', delta: 3 }];
  doc.ui.theme = 'light'; doc.ui.themeChosen = true;

  // canonical fingerprint of the fields that MUST survive intact
  const fp = (d) => JSON.stringify({
    league: d.league, names: d.names, runs: d.runs, journal: d.journal,
    favorites: d.favorites, calls: d.calls,
    theme: d.ui.theme, themeChosen: d.ui.themeChosen });
  const before = fp(doc);

  await s.saveDoc(doc);
  return { before, exportJson: JSON.stringify(doc, null, 1) };
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
  return { loaded: true, fp };
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
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
        seed = page.evaluate(SEED_AND_ROUNDTRIP)
        before = seed["before"]
        export_json = seed["exportJson"]

        # simulate tab-kill: full document reload; IndexedDB must survive
        page.reload(wait_until="networkidle")
        after = page.evaluate(AFTER_RELOAD_LOAD)
        check("tab-kill: doc persisted across reload", after.get("loaded") is True)
        check("tab-kill: reloaded doc byte-identical", after.get("fp") == before,
              "fingerprint match" if after.get("fp") == before else "MISMATCH")

        # ---- TEST: delete-site-data + import-file recovery ----
        rec = page.evaluate(RECOVERY, export_json)
        check("recovery: store wiped to empty", rec.get("wiped") is True)
        check("recovery: importDocFile restored the doc", rec.get("restoredOk") is True)
        check("recovery: restored doc byte-identical", rec.get("fp") == before,
              "fingerprint match" if rec.get("fp") == before else "MISMATCH")

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
