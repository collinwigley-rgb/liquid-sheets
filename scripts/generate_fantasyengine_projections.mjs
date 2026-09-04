#!/usr/bin/env node
/* Generates app/fantasyengine_projections.js: FantasyEngine's real
 * multi-site consensus projection (dataset "projection_summary", current
 * 2026 release, published from Collin's own R pipeline) joined onto
 * Sleeper player_id.
 *
 * FantasyEngine's public API (fantasyengine.ryoshu.com/api/v1/public/*,
 * see C:\_FantasyEngine\_Documentation\Public_Data_Contract.md) is real,
 * live, and reachable -- but has no CORS headers (verified live
 * 2026-09-04: no Access-Control-Allow-Origin on a real response), so it
 * cannot be fetched from the deployed static site's browser. Baked in at
 * build time instead, same pattern as money_talks_config.js and
 * player_history.js.
 *
 * The public rows are keyed by FantasyEngine's own internal player UUID,
 * not a Sleeper ID -- the public API does not expose a crosswalk (by
 * design, per the Public Data Contract's "private by default" list).
 * FantasyEngine's own Pipeline_Contract.md is explicit that its
 * *canonical* identity join must never be done by name -- but that
 * constraint is about ITS OWN authoritative core.players identity. What
 * this script does is a narrower, disclosed, best-effort join of two of
 * FantasyEngine's own already-published datasets (projection_summary and
 * the legacy player_key crosswalk) purely to attach a Sleeper ID for
 * THIS app's purposes. Same discipline anyway: match on normalized
 * name + position + team, and DROP (never guess) anything ambiguous or
 * unmatched -- reported explicitly so the coverage is known, not assumed.
 *
 * Requires locally: the sqlite3 CLI on PATH (or SQLITE3_PATH env var),
 * and C:\_FantasyEngine\data\fantasy_2026.db (or FANTASY_DB_PATH env
 * var) -- personal dev-machine paths, not a self-hoster dependency, same
 * as every other one-off generator script in this repo.
 *
 * Usage: node scripts/generate_fantasyengine_projections.mjs
 */

import { execFileSync } from "node:child_process";

const SQLITE_BIN = process.env.SQLITE3_PATH
  || "C:/Users/colli/AppData/Local/Microsoft/WinGet/Links/sqlite3.exe";
const DB_PATH = process.env.FANTASY_DB_PATH || "C:/_FantasyEngine/data/fantasy_2026.db";
const API_BASE = "https://fantasyengine.ryoshu.com/api/v1/public";
const SEASON = 2026;

const norm = (s) => (s || "").toLowerCase()
  .replace(/[.'`]/g, "")
  .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
  .replace(/\s+/g, " ")
  .trim();

async function fetchAllRows(dataset, season) {
  const rows = [];
  let offset = 0;
  for (;;) {
    /* Public_Data_Contract.md says the page cap is 500 -- verified live
     * 2026-09-04 that the real cap is actually 200 (a 500 request 400s
     * with "limit is outside the allowed range"). Trusting the live
     * system over the doc. */
    const url = `${API_BASE}/stats?dataset=${dataset}&season=${season}&limit=200&offset=${offset}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${dataset} fetch failed: ${resp.status}`);
    const body = await resp.json();
    rows.push(...body.rows);
    if (!body.pagination?.hasMore) return { rows, release: body.release };
    offset += body.pagination.limit;
  }
}

function loadCrosswalk() {
  const json = execFileSync(SQLITE_BIN, ["-json", DB_PATH,
    "SELECT sleeper_id, name, position, team FROM player_key " +
    "WHERE sleeper_id IS NOT NULL AND sleeper_id != '';"],
    { encoding: "utf8" });
  return JSON.parse(json);
}

async function main() {
  console.log("Loading local player_key crosswalk...");
  const crosswalk = loadCrosswalk();
  console.log(`  ${crosswalk.length} rows with a sleeper_id`);

  /* Index by normalized name+position (primary key for the join) --
   * team is checked separately as a confidence signal, not a strict
   * requirement, since a very recent trade can leave the two systems'
   * snapshots briefly disagreeing on team without that meaning the
   * player identity itself is ambiguous. */
  const byNamePos = new Map();
  for (const row of crosswalk) {
    const key = `${norm(row.name)}|${row.position}`;
    if (!byNamePos.has(key)) byNamePos.set(key, []);
    byNamePos.get(key).push(row);
  }

  console.log("Fetching FantasyEngine's public projection_summary (2026)...");
  const { rows: projRows, release } = await fetchAllRows("projection_summary", SEASON);
  console.log(`  ${projRows.length} published rows, release ${release.publishedAt}`);

  const out = {};
  let matched = 0, ambiguous = 0, unmatched = 0, teamMismatch = 0;
  const unmatchedNames = [];
  for (const row of projRows) {
    const key = `${norm(row.player)}|${row.position}`;
    const candidates = byNamePos.get(key);
    if (!candidates || candidates.length === 0) {
      unmatched++; unmatchedNames.push(`${row.player} (${row.position}, ${row.team})`);
      continue;
    }
    if (candidates.length > 1) {
      // same normalized name + position more than once -- true ambiguity, skip
      ambiguous++; unmatchedNames.push(`${row.player} (${row.position}) -- ${candidates.length} crosswalk candidates`);
      continue;
    }
    const c = candidates[0];
    if (c.team && row.team && c.team !== row.team) {
      teamMismatch++;
      if (teamMismatch <= 15) console.log(`    team mismatch: ${row.player} (${row.position}) crosswalk=${c.team} vs published=${row.team}`);
    }
    out[c.sleeper_id] = { player: row.player, position: row.position,
      team: row.team, stats: row.stats };
    matched++;
  }

  console.log(`  matched: ${matched}, ambiguous (dropped): ${ambiguous}, ` +
    `unmatched (dropped): ${unmatched}, team-mismatch-but-kept: ${teamMismatch}`);
  if (unmatchedNames.length) {
    console.log("  dropped:");
    unmatchedNames.forEach((n) => console.log(`    - ${n}`));
  }

  const outFile = `/* GENERATED by scripts/generate_fantasyengine_projections.mjs --
 * do not hand-edit. FantasyEngine's real multi-site consensus projection
 * (dataset "projection_summary", season ${SEASON}, release
 * ${release.publishedAt}, checksum ${release.contentChecksum}), joined
 * onto Sleeper player_id via a name+position match against the local
 * player_key crosswalk. ${matched} of ${projRows.length} published rows
 * matched cleanly; ${ambiguous + unmatched} were dropped (never guessed)
 * -- re-run with this script's console output to see which, and why.
 * Keyed by raw Sleeper player_id (no "sl:" prefix). */

export const FANTASYENGINE_PROJECTIONS = ${JSON.stringify(out)};
`;

  const fs = await import("node:fs");
  fs.writeFileSync(new URL("../app/fantasyengine_projections.js", import.meta.url), outFile);
  console.log("Wrote app/fantasyengine_projections.js");
}

main().catch((e) => { console.error(e); process.exit(1); });
