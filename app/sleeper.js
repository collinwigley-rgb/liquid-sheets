/* One-click Sleeper fetch (DATA-IN-SPEC Path A). Public unauthenticated API
 * with permissive CORS, verified 2026-08-18. Stat mapping mirrors the
 * predecessor's proven ingest; the engine scores raw stat lines under the
 * user's own rules, so Sleeper's default-scoring points are never used. */

const POSITIONS = ["QB", "RB", "WR", "TE"];
const KDEF = ["K", "DEF"];
const IDP_POSITIONS = ["DL", "LB", "DB"];

const STAT_MAP = {
  pass_yd: "pass_yds", pass_td: "pass_tds", pass_int: "ints",
  pass_cmp: "completions", pass_att: "pass_atts",
  rush_yd: "rush_yds", rush_td: "rush_tds", rush_att: "rush_atts",
  rec: "receptions", rec_yd: "rec_yds", rec_td: "rec_tds",
  fum_lost: "fumbles_lost",
};

/* Verified 2026-09-02 directly against a live projections pull (not
 * assumed from scoring_settings' naming, which sometimes differs from
 * projection stat field names -- e.g. offense's own STAT_MAP above maps
 * "pass_yd" to "pass_yds"). Only these 8 idp_* fields are ever present in
 * Sleeper's IDP projections; idp_tkl_loss, idp_qb_hit, idp_int_ret_yd,
 * idp_fum_ret_yd, idp_pass_def, and idp_def_td are never populated (not a
 * bug -- Sleeper's IDP projections simply don't forecast those
 * categories). Engine's scoreIdpStatLine defaults missing stats to 0, so
 * a league scoring those categories still gets a real but necessarily
 * incomplete IDP point total -- the same kind of gap FantasyEngine's own
 * IDP pipeline documents for its own data source (calculate_idp_smash_
 * tiers.R). */
const IDP_STAT_MAP = {
  tkl_solo: "idp_tkl_solo", tkl_ast: "idp_tkl_ast", sacks: "idp_sack",
  def_ints: "idp_int", forced_fumbles: "idp_ff", fum_rec: "idp_fum_rec",
  blocked_kicks: "idp_blk_kick", safeties: "idp_safe",
};

export function sleeperUrl(season) {
  const pos = [...POSITIONS, ...KDEF, ...IDP_POSITIONS]
    .map((p) => `position[]=${p}`).join("&");
  return `https://api.sleeper.com/projections/nfl/${season}` +
    `?season_type=regular&${pos}&order_by=adp_half_ppr`;
}

/* Returns {as_of, players, kdef, names, meta}. players (QB/RB/WR/TE and
 * DL/LB/DB stat lines) match the engine's input shape; kdef (kickers,
 * defenses) are listed separately because the model prices them at $1 by
 * design. Throws on network failure; the caller owns the offline message.
 *
 * Two things verified directly against a live pull before writing this
 * (2026-09-02), not assumed:
 * - `player.position` is the raw NFL position (e.g. DT/DE/CB/SS/NT), NOT
 *   the DL/LB/DB fantasy bucket -- that only exists in
 *   `player.fantasy_positions`. A player can appear in more than one
 *   bucket (e.g. a DB/WR-eligible player); each eligible IDP bucket gets
 *   its own row, same as Sleeper's own roster eligibility.
 * - The `pts_half_ppr` gate below (used to skip clearly-irrelevant rows
 *   for offense/K/DEF) would silently exclude ~34% of real IDP
 *   projections -- standard half-PPR scoring doesn't award IDP stats, so
 *   plenty of real IDP players carry real idp_* stats with a zero/absent
 *   pts_half_ppr. IDP inclusion is gated on having any idp_* stat
 *   instead. */
export async function fetchSleeper(season) {
  const resp = await fetch(sleeperUrl(season));
  if (!resp.ok) throw new Error(`Sleeper responded ${resp.status}`);
  const items = await resp.json();
  const players = [], kdef = [], names = {}, meta = {};
  for (const it of items) {
    const pl = it.player ?? {};
    const stats = it.stats ?? {};
    const pid = `sl:${it.player_id}`;
    const fantasyPositions = pl.fantasy_positions ?? [];

    for (const idpPos of IDP_POSITIONS) {
      if (!fantasyPositions.includes(idpPos)) continue;
      const hasIdpStat = Object.values(IDP_STAT_MAP)
        .some((k) => stats[k] !== undefined && stats[k] !== null);
      if (!hasIdpStat) continue;
      const line = {};
      for (const [ours, theirs] of Object.entries(IDP_STAT_MAP)) {
        if (stats[theirs] !== undefined && stats[theirs] !== null) {
          line[ours] = stats[theirs];
        }
      }
      players.push({ player_id: pid, pos: idpPos, team: it.team ?? null, stats: line });
      names[pid] = `${pl.first_name ?? ""} ${pl.last_name ?? ""}`.trim();
      meta[pid] = { adp: null, injury_status: pl.injury_status ?? null,
        is_rookie: pl.years_exp === 0 };
    }

    const pos = pl.position;
    if (!stats.pts_half_ppr) continue;
    if (KDEF.includes(pos)) {
      kdef.push({ player_id: pid, pos, team: it.team ?? null,
        pts: stats.pts_half_ppr });
      names[pid] = `${pl.first_name ?? ""} ${pl.last_name ?? ""}`.trim();
      continue;
    }
    if (!POSITIONS.includes(pos)) continue;
    const line = {};
    for (const [theirs, ours] of Object.entries(STAT_MAP)) {
      if (stats[theirs] !== undefined && stats[theirs] !== null) {
        line[ours] = stats[theirs];
      }
    }
    line.two_pt = (stats.pass_2pt ?? 0) + (stats.rush_2pt ?? 0) +
      (stats.rec_2pt ?? 0);
    players.push({ player_id: pid, pos, team: it.team ?? null, stats: line });
    names[pid] = `${pl.first_name ?? ""} ${pl.last_name ?? ""}`.trim();
    meta[pid] = {
      adp: stats.adp_half_ppr && stats.adp_half_ppr < 999
        ? Math.round(stats.adp_half_ppr) : null,
      injury_status: pl.injury_status ?? null,
      is_rookie: pl.years_exp === 0,
    };
  }
  kdef.sort((a, b) => b.pts - a.pts);
  return { as_of: new Date().toISOString().slice(0, 10),
    players, kdef, names, meta };
}
