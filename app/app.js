/* Liquid Sheets app shell, M1: wizard -> fetch -> engine -> board -> persist.
 * Draft room features arrive in M3/M4; this milestone proves the full pipe. */

import { blendProjections, valueBoard, scoreStatLine, POSITIONS }
  from "../engine/engine.js";
import { KINDS, parsePaste, guessMapping, toEntries, matchEntries,
  rankImpliedStats, marketScale, detectKind } from "./importers.js";
import { activeSales, appendSale, appendUnsale, ownerStates,
  inflationFactor, theCall, totalRosterSpots as rosterSpots }
  from "./draft.js";
import { PRIOR, PRIOR_SEASON } from "./prior_2026.js";
import { loadDoc, saveDoc, wipeDoc, newDoc, exportDoc, importDocFile }
  from "./storage.js";
import { fetchSleeper } from "./sleeper.js";
import { myPlanState, planFit, defaultPlan } from "./plan.js";
import { AI_ENABLED, AI_ENDPOINT } from "./config.js";

let doc = null;
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/* ------------------------------------------------------------- scoring */

const PRESETS = {
  standard: 0, half: 0.5, full: 1,
};

function buildScoring(pprPerRec, knobs) {
  return {
    pass: { yd: knobs.pass_yd, td: knobs.pass_td, int: knobs.int },
    rush: { yd: knobs.rush_rec_yd, td: knobs.rush_rec_td },
    rec: {
      yd: knobs.rush_rec_yd, td: knobs.rush_rec_td,
      ppr_by_pos: { QB: pprPerRec, RB: pprPerRec, WR: pprPerRec, TE: pprPerRec },
    },
    misc: { fumble_lost: knobs.fumble_lost, two_pt: knobs.two_pt },
  };
}

const DEFAULT_KNOBS = {
  pass_yd: 0.04, pass_td: 4, int: -2,
  rush_rec_yd: 0.1, rush_rec_td: 6, fumble_lost: -2, two_pt: 2,
};

/* -------------------------------------------------------------- wizard */

const wizardState = {
  step: 0,
  editing: false,   // true when reopened from the gear to edit doc.league
  platform: "yahoo",
  teams: 12, budget: 200,
  roster: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 5 },
  preset: "half",
  knobs: { ...DEFAULT_KNOBS },
  teamNames: [],
};

/* Platform selection was removed from the wizard (V3): it had no effect at
 * setup time. The paste-import flow asks for the format at the moment it
 * actually matters. */
const STEPS = ["League", "Roster", "Scoring", "Teams", "Data"];

/* Reopen the wizard prefilled from the saved league so any setup decision
 * can be revisited. Edit mode drops the Data step (sources are kept) and ends
 * in "Save settings", which rewrites doc.league and recomputes values. */
function openLeagueEditor() {
  const L = doc.league;
  const w = wizardState;
  w.editing = true; w.step = 0;
  w.teams = L.teams; w.budget = L.budget;
  w.roster = { ...L.full_roster };
  w.teamNames = [...L.team_names];
  const ppr = L.scoring.rec.ppr_by_pos.RB;
  w.preset = Object.keys(PRESETS).find((k) => PRESETS[k] === ppr) ?? "half";
  w.knobs = {
    pass_yd: L.scoring.pass.yd, pass_td: L.scoring.pass.td,
    int: L.scoring.pass.int, rush_rec_yd: L.scoring.rush.yd,
    rush_rec_td: L.scoring.rush.td, fumble_lost: L.scoring.misc.fumble_lost,
    two_pt: L.scoring.misc.two_pt,
  };
  renderWizard();
}

function wizardSteps() {
  return wizardState.editing ? STEPS.slice(0, 4) : STEPS;
}

function renderWizard() {
  const root = $("#main");
  root.innerHTML = "";
  ["#hleft", "#hcenter", "#flow"].forEach((s) => {   // header is board-only
    const n = $(s); if (n) n.innerHTML = "";
  });
  const box = el("div", "wizard");
  /* Stepper: sets the expectation up front (how many steps, where you are)
   * so setup reads as a short, finite procedure rather than a form. */
  const cur = wizardState.step;
  const S = wizardSteps();
  const stepper = el("div", "stepper");
  const meta = el("div", "stepmeta");
  meta.innerHTML = `<b>Step ${cur + 1} of ${S.length}</b>` +
    `<span>${S[cur]}</span>`;
  stepper.appendChild(meta);
  const bar = el("div", "stepbar");
  const fill = el("div", "stepfill");
  fill.style.width = `${((cur + 1) / S.length) * 100}%`;
  bar.appendChild(fill);
  stepper.appendChild(bar);
  const labels = el("div", "steps");
  S.forEach((s, i) => {
    const cls = i < cur ? "step done" : i === cur ? "step on" : "step";
    labels.appendChild(el("span", cls, s));
  });
  stepper.appendChild(labels);
  box.appendChild(stepper);
  if (cur === 0) {
    box.appendChild(el("p", "wizintro", wizardState.editing
      ? "Editing league settings. Your sources, sales, calls and favorites " +
        "are kept; values are recomputed when you save."
      : "Five quick steps to a board built for your league. Defaults are " +
        "filled in; change only what differs from your league."));
  }
  const body = el("div", "wizbody");
  box.appendChild(body);
  const nav = el("div", "wiznav");
  box.appendChild(nav);
  root.appendChild(box);

  const steps = [stepLeague, stepRoster, stepScoring, stepTeams, stepData];
  steps[wizardState.step](body, nav);
}

function navButtons(nav, { back = true, next = "Next", onNext }) {
  const left = el("div", "wizleft");
  if (back && wizardState.step > 0) {
    const b = el("button", "ghost", "Back");
    b.onclick = () => { wizardState.step--; renderWizard(); };
    left.appendChild(b);
  }
  if (wizardState.editing) {
    const c = el("button", "ghost", "Cancel");
    c.onclick = () => { wizardState.editing = false; renderBoardScreen(); };
    left.appendChild(c);
  }
  nav.appendChild(left);
  const n = el("button", "primary", next);
  n.onclick = onNext;
  nav.appendChild(n);
}

function numInput(labelText, value, min, max, onchange, { locked = "" } = {}) {
  const wrap = el("label", "field");
  wrap.appendChild(el("span", null, labelText));
  const inp = el("input");
  inp.type = "number"; inp.value = value; inp.min = min; inp.max = max;
  inp.onchange = () => onchange(Number(inp.value));
  if (locked) { inp.disabled = true; inp.title = locked; }
  wrap.appendChild(inp);
  if (locked) wrap.appendChild(el("small", "locknote", locked));
  return wrap;
}

function stepLeague(body, nav) {
  body.appendChild(el("h2", null, "League shape"));
  /* Team count is locked once sales exist: sales reference team slots, so
   * shrinking the league would orphan them. Everything else stays editable. */
  const salesExist = wizardState.editing && doc
    && activeSales(doc.journal).length > 0;
  body.appendChild(numInput("Teams", wizardState.teams, 4, 20,
    (v) => { wizardState.teams = v; }, {
      locked: salesExist
        ? "Locked while sales exist (reset the board to change it)" : "" }));
  body.appendChild(numInput("Auction budget per team ($)", wizardState.budget,
    50, 1000, (v) => { wizardState.budget = v; }));
  navButtons(nav, { onNext: () => { wizardState.step++; renderWizard(); } });
}

function stepRoster(body, nav) {
  body.appendChild(el("h2", null, "Roster"));
  body.appendChild(el("p", "hint",
    "Starting slots per position, one FLEX pool (RB/WR/TE), bench size. " +
    "Kickers and defenses are priced at $1 by design."));
  const grid = el("div", "grid4");
  for (const slot of ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BN"]) {
    grid.appendChild(numInput(slot, wizardState.roster[slot], 0, 12,
      (v) => { wizardState.roster[slot] = v; }));
  }
  body.appendChild(grid);
  navButtons(nav, { onNext: () => { wizardState.step++; renderWizard(); } });
}

function stepScoring(body, nav) {
  body.appendChild(el("h2", null, "Scoring"));
  const row = el("div", "choices");
  for (const [name] of Object.entries(PRESETS)) {
    const label = name === "half" ? "Half PPR"
      : name === "full" ? "Full PPR" : "Standard";
    const b = el("button",
      wizardState.preset === name ? "choice on" : "choice", label);
    b.onclick = () => { wizardState.preset = name; renderWizard(); };
    row.appendChild(b);
  }
  body.appendChild(row);
  body.appendChild(el("p", "hint", "Enter your league's scoring settings"));
  const form = el("div", "form");
  const knobDefs = [
    ["pass_yd", "Points per passing yard"], ["pass_td", "Passing TD"],
    ["int", "Interception"], ["rush_rec_yd", "Points per rush/rec yard"],
    ["rush_rec_td", "Rush/rec TD"], ["fumble_lost", "Fumble lost"],
    ["two_pt", "Two-point conversion"],
  ];
  for (const [k, label] of knobDefs) {
    const r = el("label", "formrow");
    r.appendChild(el("span", null, label));
    const inp = el("input");
    inp.type = "number"; inp.step = "0.01"; inp.value = wizardState.knobs[k];
    inp.onchange = () => { wizardState.knobs[k] = Number(inp.value); };
    r.appendChild(inp);
    form.appendChild(r);
  }
  body.appendChild(form);
  navButtons(nav, { onNext: () => { wizardState.step++; renderWizard(); } });
}

function stepTeams(body, nav) {
  body.appendChild(el("h2", null, "Team names"));
  body.appendChild(el("p", "hint",
    "One per line. The first one is yours. Change these any time under " +
    "the gear menu, League settings."));
  const ta = el("textarea");
  ta.rows = Math.min(wizardState.teams, 14);
  if (!wizardState.teamNames.length) {
    wizardState.teamNames = Array.from({ length: wizardState.teams },
      (_, i) => `Team ${i + 1}`);
  }
  ta.value = wizardState.teamNames.join("\n");
  body.appendChild(ta);
  navButtons(nav, {
    onNext: async () => {
      const names = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
      while (names.length < wizardState.teams) {
        names.push(`Team ${names.length + 1}`);
      }
      wizardState.teamNames = names.slice(0, wizardState.teams);
      if (wizardState.editing) { await saveLeagueEdit(); return; }
      wizardState.step++; renderWizard();
    },
    next: wizardState.editing ? "Save settings" : "Next",
  });
}

/* Edit-mode finish: rewrite doc.league from the wizard, keep everything else
 * (sources, journal, calls, favorites), and recompute values as a new
 * append-only run so the values-from chip shows the change. */
async function saveLeagueEdit() {
  await finishWizard();
  wizardState.editing = false;
  if (Object.keys(doc.sources).length) {
    await makeRun();
    doc.ui.run = null;              // newest run becomes current
    await saveDoc(doc);
  }
  renderBoardScreen();
  stampShow("SAVED", "league settings updated");
}

function stepData(body, nav) {
  body.appendChild(el("h2", null, "Projections"));
  body.appendChild(el("p", "hint",
    "One click fetches projections from Sleeper's public data, straight " +
    "from your browser. You can add more sources later."));
  const btn = el("button", "primary big", "Fetch projections");
  const msg = el("p", "msg");
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = "Fetching...";
    try {
      await finishWizard();
      await doFetchSleeper();
      renderBoardScreen();
    } catch (e) {
      msg.textContent = `Fetch failed (${e.message}). If you are offline, ` +
        "reconnect and try again; the wizard settings are saved.";
      btn.disabled = false; btn.textContent = "Fetch projections";
    }
  };
  body.appendChild(btn);
  body.appendChild(msg);
  navButtons(nav, {
    next: "Skip for now",
    onNext: async () => { await finishWizard(); renderBoardScreen(); },
  });
}

function totalRosterSpots(roster) {
  return Object.values(roster).reduce((a, b) => a + b, 0);
}

async function finishWizard() {
  if (!doc) doc = newDoc();
  const w = wizardState;
  doc.league = {
    platform: w.platform, season: PRIOR_SEASON,
    teams: w.teams, budget: w.budget, weeks: 17,
    roster_slots: { QB: w.roster.QB, RB: w.roster.RB, WR: w.roster.WR,
      TE: w.roster.TE, FLEX: w.roster.FLEX },
    full_roster: { ...w.roster },
    scoring: buildScoring(PRESETS[w.preset], w.knobs),
    model_params: {
      baseline_bench_share: 0.15, vols_blend_alpha: 0,
      tier_gap_theta: 0.2,
      dollar_slots_per_team: totalRosterSpots(w.roster),
    },
    team_names: [...w.teamNames],
  };
  await saveDoc(doc);
}

/* ---------------------------------------------------------------- runs */

async function doFetchSleeper() {
  const { as_of, players, kdef, names, meta } =
    await fetchSleeper(doc.league.season);
  doc.sources.sleeper = { as_of, players };
  doc.kdef = { as_of, players: kdef };
  Object.assign(doc.names, names);
  Object.assign(doc.player_meta, meta);
  await makeRun();
}

async function makeRun() {
  const cfg = doc.league;
  const sourceNames = Object.keys(doc.sources);
  if (!sourceNames.length) return;
  let asOf, players, label;
  if (sourceNames.length > 1) {
    ({ asOf, players } = blendProjections(doc.sources, cfg.scoring));
    label = "blend";
  } else {
    const s = doc.sources[sourceNames[0]];
    asOf = `${sourceNames[0]}@${s.as_of}`;
    players = s.players;
    label = sourceNames[0];
  }
  const result = valueBoard(cfg, players, PRIOR);
  doc.runs.push({
    run_id: doc.runs.length + 1,
    created_at: new Date().toISOString(),
    source_label: label, as_of: asOf,
    meta: result.meta,
    players: result.players,
  });
  await saveDoc(doc);
}

/* -------------------------------------------------------------- import */

let importState = null;

/* Per-position expansion of the below-FREE section. Module-level, never on
 * DOM nodes: re-renders destroy nodes (the predecessor's dead-expander
 * lesson). Collapsed by default. */
const freeExpanded = {};

function boardRoster() {
  const roster = [];
  for (const src of Object.values(doc.sources)) {
    for (const p of src.players) {
      roster.push({ pid: p.player_id, name: doc.names[p.player_id] ?? "",
        pos: p.pos });
    }
  }
  if (doc.kdef) {
    for (const p of doc.kdef.players) {
      roster.push({ pid: p.player_id, name: doc.names[p.player_id] ?? "",
        pos: p.pos });
    }
  }
  const seen = new Set();
  return roster.filter((r) => !seen.has(r.pid) && seen.add(r.pid));
}

function renderImport() {
  const root = $("#main");
  root.innerHTML = "";
  ["#hleft", "#hcenter", "#flow"].forEach((s) => {   // header is board-only
    const n = $(s); if (n) n.innerHTML = "";
  });
  const panel = el("div", "bigpanel");
  root.appendChild(panel);
  panel.appendChild(el("h2", null, "Add data"));
  panel.appendChild(el("p", "hint",
    "Add the values that the rest of your league will likely be using. " +
    "Import today's Yahoo or ESPN values (avg salary) as a csv or copy " +
    "and paste plain text here."));
  panel.appendChild(el("p", "hint",
    "If your source is not actual auction salary values, you can also use " +
    "other formats (projection or player rankings); the app detects what " +
    "you pasted."));

  const ta = el("textarea");
  ta.rows = 10;
  ta.placeholder = "Paste here (or choose a file below)";
  ta.value = importState.text ?? "";
  ta.oninput = () => { importState.text = ta.value; };
  panel.appendChild(ta);

  const fileRow = el("div", "choices");
  const fileInp = el("input");
  fileInp.type = "file"; fileInp.accept = ".csv,.tsv,.txt";
  fileInp.onchange = async () => {
    if (fileInp.files.length) {
      importState.text = await fileInp.files[0].text();
      ta.value = importState.text;
    }
  };
  fileRow.appendChild(fileInp);
  panel.appendChild(fileRow);

  const msg = el("p", "msg");
  panel.appendChild(msg);
  const nav = el("div", "wiznav");
  const cancel = el("button", "ghost", "Cancel");
  cancel.onclick = () => { importState = null; renderBoardScreen(); };
  nav.appendChild(cancel);
  const prev = el("button", "primary", "Preview");
  prev.onclick = () => {
    const parsed = parsePaste(importState.text ?? "");
    if (!parsed.rows.length) { msg.textContent = "Nothing parseable found."; return; }
    importState.parsed = parsed;
    importState.kind = detectKind(parsed);
    setMapping();
    renderMapper();
  };
  nav.appendChild(prev);
  panel.appendChild(nav);
}

function setMapping() {
  const { parsed, kind } = importState;
  if (parsed.preset === "yahoo" && kind === "values") {
    importState.mapping = ["name", "pos", "team", "ignore", "value", "ignore"];
  } else {
    importState.mapping = guessMapping(parsed.headers, parsed.rows, kind);
  }
}

function renderMapper() {
  const root = $("#main");
  root.innerHTML = "";
  const panel = el("div", "bigpanel wide");
  root.appendChild(panel);
  const { parsed, mapping, kind } = importState;
  panel.appendChild(el("h2", null,
    `Confirm the columns (${parsed.rows.length} rows` +
    (parsed.preset === "yahoo" ? ", Yahoo format detected" : "") + ")"));
  const kindRow = el("div", "choices");
  kindRow.appendChild(el("span", "hint", "Looks like:"));
  for (const [k, def] of Object.entries(KINDS)) {
    const b = el("button", kind === k ? "choice on" : "choice", def.label);
    b.onclick = () => { importState.kind = k; setMapping(); renderMapper(); };
    kindRow.appendChild(b);
  }
  panel.appendChild(kindRow);
  if (kind === "values") {
    const radios = el("div", "choices radios");
    radios.appendChild(el("span", "hint", "These values are from:"));
    for (const p of ["yahoo", "espn"]) {
      const lab = el("label", "radio");
      const r = el("input");
      r.type = "radio"; r.name = "platform"; r.value = p;
      const current = importState.platform ??
        (parsed.preset === "yahoo" ? "yahoo" : "yahoo");
      importState.platform = current;
      r.checked = current === p;
      r.onchange = () => { importState.platform = p; };
      lab.appendChild(r);
      lab.appendChild(el("span", null, p === "espn" ? "ESPN" : "Yahoo"));
      radios.appendChild(lab);
    }
    panel.appendChild(radios);
  } else {
    const labelRow = el("label", "field");
    labelRow.appendChild(el("span", null, "Source name"));
    const labelInp = el("input");
    labelInp.value = importState.label ?? kind;
    importState.label = importState.label ?? kind;
    labelInp.onchange = () => { importState.label = labelInp.value.trim(); };
    labelRow.appendChild(labelInp);
    panel.appendChild(labelRow);
  }
  panel.appendChild(el("p", "hint",
    "The app guessed what each column is. Fix any dropdown that is wrong; " +
    "set columns you do not want to \"ignore\"."));
  const fields = ["ignore", ...KINDS[kind].fields];
  const tbl = el("table", "maptable");
  const selRow = el("tr");
  mapping.forEach((f, i) => {
    const td = el("th");
    const sel = el("select");
    for (const opt of fields) {
      const o = el("option", null, opt);
      o.value = opt;
      if (opt === f) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => { importState.mapping[i] = sel.value; };
    td.appendChild(sel);
    selRow.appendChild(td);
  });
  tbl.appendChild(selRow);
  if (parsed.headers) {
    const hr = el("tr", "hdr");
    parsed.headers.forEach((h) => hr.appendChild(el("td", null, h)));
    tbl.appendChild(hr);
  }
  for (const r of parsed.rows.slice(0, 6)) {
    const tr = el("tr");
    r.forEach((c) => tr.appendChild(el("td", null, c)));
    tbl.appendChild(tr);
  }
  const wrap = el("div", "tblwrap");
  wrap.appendChild(tbl);
  panel.appendChild(wrap);
  const msg = el("p", "msg");
  panel.appendChild(msg);
  const nav = el("div", "wiznav");
  const back = el("button", "ghost", "Back");
  back.onclick = renderImport;
  nav.appendChild(back);
  const imp = el("button", "primary", "Import");
  imp.onclick = () => {
    if (!importState.mapping.includes("name")) {
      msg.textContent = "One column must be mapped to \"name\"."; return;
    }
    if (kind === "rankings" && !importState.mapping.includes("rank")) {
      msg.textContent = "Rankings need a \"rank\" column."; return;
    }
    const entries = toEntries(parsed.rows, importState.mapping);
    const { matched, unmatched } = matchEntries(entries, boardRoster());
    importState.matched = matched;
    importState.unmatched = unmatched;
    if (unmatched.length) renderUnmatched();
    else finishImport();
  };
  nav.appendChild(imp);
  panel.appendChild(nav);
}

function renderUnmatched() {
  const root = $("#main");
  root.innerHTML = "";
  const panel = el("div", "bigpanel");
  root.appendChild(panel);
  panel.appendChild(el("h2", null,
    `${importState.unmatched.length} rows did not match a player`));
  panel.appendChild(el("p", "hint",
    "Nothing is dropped silently. Match each row by hand or skip it."));
  const run = doc.runs[doc.runs.length - 1];
  const dollars = new Map(
    (run?.players ?? []).map((p) => [p.player_id, p.dollar]));
  const roster = boardRoster()
    .sort((a, b) => (dollars.get(b.pid) ?? 0) - (dollars.get(a.pid) ?? 0));
  importState.resolutions = importState.unmatched.map(() => null);
  const list = el("div", "form");
  importState.unmatched.forEach((e, i) => {
    const r = el("label", "formrow");
    r.appendChild(el("span", null,
      `${e.name}${e.pos ? ` (${e.pos})` : ""}`));
    const sel = el("select");
    sel.appendChild(el("option", null, "skip"));
    const cands = e.pos ? roster.filter((p) => p.pos === e.pos) : roster;
    for (const c of cands.slice(0, 80)) {
      const o = el("option", null, `${c.name} (${c.pos})`);
      o.value = c.pid;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      importState.resolutions[i] = sel.value === "skip" ? null : sel.value;
    };
    r.appendChild(sel);
    list.appendChild(r);
  });
  panel.appendChild(list);
  const nav = el("div", "wiznav");
  const back = el("button", "ghost", "Back");
  back.onclick = renderMapper;
  nav.appendChild(back);
  const fin = el("button", "primary", "Finish import");
  fin.onclick = () => {
    importState.unmatched.forEach((e, i) => {
      if (importState.resolutions[i]) {
        importState.matched.push({ entry: e, pid: importState.resolutions[i] });
      }
    });
    finishImport();
  };
  nav.appendChild(fin);
  panel.appendChild(nav);
}

async function finishImport() {
  const { kind, matched } = importState;
  const label = kind === "values" ? (importState.platform ?? "yahoo")
    : (importState.label ?? kind).trim() || kind;
  const as_of = new Date().toISOString().slice(0, 10);
  const posOf = new Map(boardRoster().map((r) => [r.pid, r.pos]));
  if (kind === "values") {
    const values = {};
    for (const m of matched) {
      if (m.entry.value != null) values[m.pid] = m.entry.value;
    }
    doc.market = { label, as_of, values };
  } else if (kind === "projections") {
    doc.sources[label] = {
      as_of,
      players: matched.filter((m) => posOf.get(m.pid))
        .map((m) => ({ player_id: m.pid, pos: posOf.get(m.pid),
          team: m.entry.team ?? null, stats: m.entry.stats })),
    };
    await makeRun();
  } else if (kind === "rankings") {
    const srcNames = Object.keys(doc.sources);
    let reference;
    if (srcNames.length > 1) {
      reference = blendProjections(doc.sources, doc.league.scoring).players;
    } else if (srcNames.length === 1) {
      reference = doc.sources[srcNames[0]].players;
    } else {
      alert("Fetch or import projections first; rankings need a curve to map onto.");
      importState = null; renderBoardScreen(); return;
    }
    const withPos = matched.map((m) => ({ ...m, pos: posOf.get(m.pid) }))
      .filter((m) => m.pos);
    const players = rankImpliedStats(withPos, reference,
      (p) => scoreStatLine(p.pos, p.stats, doc.league.scoring));
    doc.sources[label] = { as_of, players };
    await makeRun();
  }
  await saveDoc(doc);
  importState = null;
  renderBoardScreen();
}

/* --------------------------------------------------------------- board */

/* ------------------------------------------------------------ the room
 * Ported from the original (levi-sheet/draftroom/app.html V36): same DOM
 * shape, same CSS, same interaction grammar. Data access adapted from its
 * server state to our local doc; everything else moves faithfully. */

let P = [], byId = {}, soldSet = new Set(), soldBy = {};
let hitList = [], hitSel = 0, picked = null, selOwner = null;
let stagedId = null, rosterView = null, showTeams = false;
let kdefView = localStorage.getItem("ls-kdef") || "DEF";
let sortBy = localStorage.getItem("ls-sort") || "usd";
let mScale = 1;
let curRun = null, curSales = [];
/* any board column can collapse to a slim strip; persisted (ported) */
let colMin = JSON.parse(localStorage.getItem("ls-colmin") || "{}");
if (!("KDEF" in colMin)) colMin.KDEF = true;  // K/DEF collapsed until toggled
let ownerFilter = "";                          // type-to-filter the owner grid
let boardTab = localStorage.getItem("ls-tab") || "board";
let notesExpanded = false;
let flaggedOpen = localStorage.getItem("ls-fav") === "open";
let lastEsc = 0;                               // double-tap Escape timer
let cp = null;   // copilot handle, non-null only when config.AI_ENDPOINT is set

const fmt$ = (v) => v == null ? "" : "$" + Math.round(v);
const posClass = (l) => ({ QB: "pQB", RB: "pRB", WR: "pWR", TE: "pTE",
  FLX: "pFLX", K: "pK", DEF: "pDEF" }[l] || "");
const isFav = (pid) => (doc.favorites || []).includes(pid);
async function toggleFav(pid) {
  doc.favorites = doc.favorites || [];
  doc.favorites = isFav(pid)
    ? doc.favorites.filter((x) => x !== pid)
    : [...doc.favorites, pid];
  await saveDoc(doc);
}

function applyTheme() {
  /* dark is the default; light removes the attribute, any dark* theme sets it */
  const t = doc?.ui?.theme || "dark";
  if (t === "light") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = "dark";
}
const owners = () => doc.league.team_names.map((name, i) =>
  ({ id: i, name, is_me: i === 0 }));
const short = (o) => o.is_me ? "ME"
  : o.name.split(" ")[0].slice(0, 4).toUpperCase();

window.onerror = (m, src, l) => { const e = $("#errbar");
  e.style.display = "block";
  e.textContent = "UI ERROR (screenshot this): " + m + " @line " + l; };
window.onunhandledrejection = (ev) => { const e = $("#errbar");
  e.style.display = "block";
  e.textContent = "UI ERROR (screenshot this): " + ev.reason; };

function slotOrder() {
  const r = doc.league.full_roster;
  const out = [];
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    for (let i = 0; i < (r[pos] ?? 0); i++) out.push(pos);
  }
  for (let i = 0; i < (r.FLEX ?? 0); i++) out.push("FLX");
  for (const pos of ["K", "DEF"]) {
    for (let i = 0; i < (r[pos] ?? 0); i++) out.push(pos);
  }
  for (let i = 0; i < (r.BN ?? 0); i++) out.push("BN");
  return out;
}

/* My Calls: a personal dollar nudge on a player's board value. Stored per player
 * in doc.calls as {pid, delta}; set from the player popup. */
function callOf(pid) {
  const c = (doc.calls || []).find((x) => x.pid === pid);
  return c ? (c.delta || 0) : 0;
}

/* the base (un-nudged) our$ for a player, from the latest real run */
function baseValueOf(pid) {
  const base = doc.runs[doc.runs.length - 1];
  const bp = base?.players.find((x) => x.player_id === pid);
  return bp ? Math.max(1, Math.round(bp.dollar)) : null;
}

/* set (or clear) a player's call to an absolute dollar delta */
async function setCall(pid, delta) {
  doc.calls = (doc.calls || []).filter((x) => x.pid !== pid);
  if (delta !== 0) doc.calls.push({ pid, delta });
  if (doc.calls.length) doc.ui.run = "calls";
  else if (doc.ui.run === "calls") doc.ui.run = null;
  await saveDoc(doc);
  refreshRoom();
  openModal(pid);
}

/* derive the "blend + My Calls" run on the fly from the latest base run
 * (never persisted; regenerates whenever a call changes). The nudge is a direct
 * dollar delta on our$; the base blend is never touched. */
function deriveCallsRun(base) {
  const delta = {};
  for (const c of (doc.calls || [])) if (c.pid) delta[c.pid] = c.delta || 0;
  const players = base.players.map((p) => {
    const d = delta[p.player_id] || 0;
    return d
      ? { ...p, dollar: Math.max(1, Math.round((p.dollar + d) * 10) / 10) }
      : p;
  });
  return { run_id: "calls", source_label: base.source_label + "+calls",
    as_of: base.as_of, meta: base.meta, players };
}

function buildModel() {
  const baseReal = doc.runs[doc.runs.length - 1] ?? null;
  if (doc.ui?.run === "calls" && (doc.calls || []).length && baseReal) {
    curRun = deriveCallsRun(baseReal);
  } else {
    curRun = doc.runs.find((r) => r.run_id === doc.ui?.run) ?? baseReal;
  }
  /* attach a generic, editable plan the first time a run exists (never the
   * author's numbers; derived from the run's own chalk values). */
  if (curRun && doc.league && !doc.league.plan) {
    doc.league.plan = defaultPlan(curRun.players, slotOrder(),
      doc.league.budget);
    saveDoc(doc);
  }
  curSales = activeSales(doc.journal);
  soldSet = new Set(curSales.map((s) => s.pid));
  soldBy = {}; curSales.forEach((s) => { soldBy[s.pid] = s; });
  const mv = doc.market?.values ?? null;
  P = [];
  if (curRun) {
    for (const p of curRun.players) {
      const meta = doc.player_meta[p.player_id] ?? {};
      P.push({ id: p.player_id, name: doc.names[p.player_id] ?? p.player_id,
        pos: p.pos, team: p.team, pts: p.proj_pts, usd: p.dollar,
        tier: p.tier, inj: meta.injury_status, rookie: meta.is_rookie,
        y_avg: mv ? mv[p.player_id] ?? null : null });
    }
    mScale = mv ? marketScale(curRun.players, mv,
      doc.league.teams * doc.league.model_params.dollar_slots_per_team) : 1;
  }
  if (doc.kdef) {
    for (const p of doc.kdef.players) {
      P.push({ id: p.player_id, name: doc.names[p.player_id] ?? p.player_id,
        pos: p.pos, team: p.team, pts: p.pts, usd: null, tier: null,
        y_avg: mv ? mv[p.player_id] ?? null : null, kd: true });
    }
  }
  byId = {}; P.forEach((p) => { byId[p.id] = p; });
}

const dealOf = (p) => (doc.market && p.usd != null && p.y_avg != null)
  ? p.usd - p.y_avg * mScale : null;

/* ledger states in the original's field names */
function oStates() {
  return ownerStates(doc.league, curSales).map((o) => ({
    id: o.idx, name: o.name, is_me: o.idx === 0, spent: o.spent,
    left: o.remaining, open: o.spotsLeft, max: o.maxBid }));
}

/* inflation, ported: money over owners with open spots, value over the
 * top spotsLeft unsold players */
function inflation() {
  const os = oStates();
  const money = os.reduce((a, o) => a + (o.open > 0 ? o.left : 0), 0);
  const spotsLeft = os.reduce((a, o) => a + Math.max(o.open, 0), 0);
  const vals = P.filter((p) => !soldSet.has(p.id))
    .map((p) => Math.max(p.usd || 1, 1)).sort((a, b) => b - a)
    .slice(0, spotsLeft);
  const value = vals.reduce((a, b) => a + b, 0);
  return { money, value, ratio: value > 0 ? money / value : 1 };
}

function ownerNeedMap() {
  const r = doc.league.full_roster;
  const base = { QB: r.QB ?? 0, RB: r.RB ?? 0, WR: r.WR ?? 0, TE: r.TE ?? 0,
    FLX: r.FLEX ?? 0, K: r.K ?? 0, DEF: r.DEF ?? 0, BN: r.BN ?? 0 };
  const map = {};
  owners().forEach((o) => { map[o.id] = { ...base }; });
  curSales.forEach((s) => {
    const p = byId[s.pid]; if (!p) return;
    const n = map[s.owner]; if (!n) return;
    if (n[p.pos] > 0) n[p.pos]--;
    else if (["RB", "WR", "TE"].includes(p.pos) && n.FLX > 0) n.FLX--;
    else n.BN--;
  });
  return map;
}

/* unsold auction values per position, sorted high to low (plan ceilings) */
function unsoldByPos() {
  const out = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  for (const p of P) {
    if (soldSet.has(p.id) || p.usd == null) continue;
    if (out[p.pos]) out[p.pos].push(Math.max(1, Math.round(p.usd)));
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b - a);
  return out;
}

/* my live plan state (envelopes water-filled to remaining budget). Owner 0 is
 * always "me" (team_names[0]); ported from the personal tool's is_me model. */
function planState() {
  const mine = curSales.filter((s) => s.owner === 0)
    .map((s) => ({ pos: (byId[s.pid] || {}).pos || s.pos, price: s.price,
      name: s.name }));
  const plan = doc.league.plan || null;
  return myPlanState({
    env: plan ? plan.envelopes : null,
    purseCfg: plan ? plan.purse : null,
    floatTarget: plan ? plan.float_target : null,
    budget: doc.league.budget,
    mine, slotLabels: slotOrder(), unsoldByPos: unsoldByPos(),
  });
}

/* BeerSheets-style surplus shading (ported, incl. sqrt scale) */
function surplusBg(ourVal, price) {
  const d = (ourVal == null ? 1 : ourVal) - price;
  if (Math.abs(d) < 0.5) return "";
  const t = Math.sqrt(Math.min(Math.abs(d), 20) / 20);
  const dark = (document.documentElement.dataset.theme || "").startsWith("dark");
  const a = (dark ? 0.08 : 0.05) + t * (dark ? 0.40 : 0.36);
  return d > 0
    ? (dark ? `rgba(102,189,143,${a.toFixed(2)})` : `rgba(13,107,70,${a.toFixed(2)})`)
    : (dark ? `rgba(224,133,99,${a.toFixed(2)})` : `rgba(166,58,48,${a.toFixed(2)})`);
}

function stampShow(big, small) {
  const s = $("#stamp");
  s.innerHTML = `${big}<small>${small}</small>`;
  s.classList.remove("show"); void s.offsetWidth; s.classList.add("show");
  clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove("show"), 1600);
}

/* ---------------- board columns (ported) ---------------- */

function addRow(p, target, kdef) {
  const sold = soldSet.has(p.id), sale = soldBy[p.id];
  const winner = sale && owners()[sale.owner];
  const mine = winner && winner.is_me;
  const edge = dealOf(p);
  const row = el("div", "row " + (kdef ? "grid-kdef" : "grid-skill")
    + (sold ? (mine ? " sold mine" : " sold") : "")
    + (p.id === stagedId && !sold ? " staged" : ""));
  row.dataset.id = p.id;
  if (sold) row.style.background = surplusBg(kdef ? 1 : p.usd, sale.price);
  if (kdef) {
    /* K/DEF sold rows show the price + buyer (there is no our$ to keep) */
    row.innerHTML = `<span class="nm">${p.name}</span>`
      + (sold ? `<span class="mkt">${fmt$(sale.price)} ${short(winner)}</span>`
        : `<span class="mkt">${p.y_avg != null ? fmt$(p.y_avg) : "$1"}</span>`);
  } else {
    /* skill rows always show bid$ / +/- / my$; a sold row keeps my value
     * (struck through + surplus tint), the buyer shows in the popup (V53) */
    const bid = p.y_avg != null ? "$" + Math.round(p.y_avg * mScale) : "";
    const cd = callOf(p.id);
    row.innerHTML =
      `<span class="tier">${p.tier ?? ""}</span>`
      + `<span class="nm">${p.name}<span class="tm">${p.team || ""}</span>`
      + (p.inj ? `<span class="inj" title="${p.inj}">+</span>` : "")
      + (p.rookie ? `<span class="rk" title="rookie">R</span>` : "")
      + (isFav(p.id) ? `<span class="favm" title="favorite">&#9733;</span>` : "")
      + (cd ? `<span class="callm ${cd > 0 ? "up" : "dn"}" title="your call: ${cd > 0 ? "+" : ""}${cd}">${cd > 0 ? "+" : ""}${cd}</span>` : "") + `</span>`
      + `<span class="pts" title="estimated bid the room pays: your market source's average x the money-supply scale (x${mScale.toFixed(2)})">${bid}</span>`
      + `<span class="edge ${edge == null ? "" : Math.round(edge) > 0 ? "up" : Math.round(edge) < 0 ? "dn" : ""}" title="${edge == null ? "" : edge > 0 ? "a $" + Math.round(edge) + " deal vs the expected bid" : "$" + Math.round(-edge) + " over my value"}">${edge == null ? "" : (Math.round(edge) > 0 ? "+" : "") + Math.round(edge)}</span>`
      + `<span class="usd">${fmt$(p.usd)}</span>`;
  }
  /* single click = popup; double click = nominate (ported timing trick) */
  row.onclick = () => {
    if (sold) { openModal(p.id); return; }
    clearTimeout(row._t);
    row._t = setTimeout(() => openModal(p.id), 260);
  };
  row.ondblclick = () => { if (!sold) { clearTimeout(row._t); pick(p.id); } };
  target.appendChild(row);
}

/* any column can collapse to a slim vertical strip (persisted, ported) */
function toggleCol(key) {
  colMin[key] = !colMin[key];
  localStorage.setItem("ls-colmin", JSON.stringify(colMin));
  renderBoard();
}
function minCol(key, labelHtml, sub) {
  const col = el("div", "poscol min");
  col.title = "expand column";
  col.innerHTML = `<span class="minlab">${labelHtml}${sub ? ` <small>${sub}</small>` : ""}</span>`;
  col.onclick = () => toggleCol(key);
  return col;
}

function skillCol(pos) {
  if (colMin[pos]) {
    const left = P.filter((p) => p.pos === pos && !soldSet.has(p.id)
      && (p.usd || 0) >= 2).length;
    return minCol(pos, `<b class="${posClass(pos)}">${pos}</b>`, `${left} left`);
  }
  const col = el("div", "poscol");
  const base = curRun.meta.baselines[pos] ?? "";
  col.innerHTML =
    `<div class="colhead"><div class="t1"><span class="${posClass(pos)}" title="Position column. Values are computed against replacement baseline ${pos}${base}: the best player assumed freely available.">${pos}</span><button class="colbtn" title="collapse this column to a slim strip">&#171;</button></div>
     <div class="t2 grid-skill"><span title="tier: players whose values sit within noise of each other. A tier ends once value has fallen 20% below that tier's own top - one rule that catches both hard cliffs and slow slides. The horizontal rule marks each break.">T</span><span>player</span>
       <span class="pts" title="estimated bid the room pays: your market source's average salary, rescaled to your league's money supply. Blank until you add market values.">bid$</span>
       <span class="edge sortable${sortBy === "deal" ? " on" : ""}" data-sort="deal" title="my$ minus bid$. GREEN (+) a deal: worth more to me than the room pays. RED (-) the room pays past my value. Blank without market values. CLICK to sort by deal.">+/-</span>
       <span class="r sortable${sortBy === "usd" ? " on" : ""}" data-sort="usd" title="my auction value for this league: the most you should be willing to pay. CLICK to sort by value.">my$</span></div></div>`;
  col.querySelector(".colbtn").onclick = (e) => {
    e.stopPropagation(); toggleCol(pos);
  };
  col.querySelectorAll(".sortable").forEach((s) => {
    s.onclick = (e) => { e.stopPropagation(); sortBy = s.dataset.sort;
      localStorage.setItem("ls-sort", sortBy); renderBoard(); };
  });
  const wrap = el("div", "rows");
  let group = P.filter((p) => p.pos === pos && p.usd != null);
  group.sort((a, b) => b.usd - a.usd);
  if (sortBy === "deal") {
    group = [...group].sort((a, b) =>
      ((dealOf(b) ?? -999) - (dealOf(a) ?? -999)));
  }
  const above = group.filter((p) => (p.usd || 0) >= 2);
  const free = group.filter((p) => (p.usd || 0) < 2);
  let lastTier = null;
  const rowWithTier = (p, target) => {
    addRow(p, target, false);
    if (sortBy !== "deal" && p.tier !== lastTier && lastTier !== null) {
      target.lastChild.classList.add("t-open");
    }
    lastTier = p.tier;
  };
  above.forEach((p) => rowWithTier(p, wrap));
  col.appendChild(wrap);
  if (free.length) {
    const bar = el("div", "freebar");
    bar.title = "the replacement line: everyone below prices at $1 - never bid $2";
    bar.innerHTML = `<span></span>&#9660; FREE &#9660;<span></span>`;
    col.appendChild(bar);
    if (freeExpanded[pos]) {
      const tail = el("div", "rows");
      free.forEach((p) => rowWithTier(p, tail));
      col.appendChild(tail);
    }
    const more = el("button", "more",
      freeExpanded[pos] ? "- collapse" : `+ ${free.length} more..`);
    more.onclick = (e) => { e.stopPropagation();
      freeExpanded[pos] = !freeExpanded[pos]; renderBoard(); };
    col.appendChild(more);
  }
  return col;
}

function kdefCol() {
  if (colMin.KDEF) {
    return minCol("KDEF", `<b class="pK">K</b>/<b class="pDEF">DEF</b>`, "$1");
  }
  const col = el("div", "poscol");
  col.innerHTML =
    `<div class="colhead"><div class="t1">
       <span class="kd pK${kdefView === "K" ? " on" : ""}" data-kd="K" title="show kickers">K</span> /
       <span class="kd pDEF${kdefView === "DEF" ? " on" : ""}" data-kd="DEF" title="show defenses">DEF</span>
       <small title="the model prices every K and DEF at $1">$1 rule</small>
       <button class="colbtn" title="collapse this column to a slim strip">&#171;</button></div>
     <div class="t2 grid-kdef"><span>player</span><span class="r" title="market average salary, when you have pasted values">mkt$</span></div></div>`;
  col.querySelector(".colbtn").onclick = (e) => {
    e.stopPropagation(); toggleCol("KDEF");
  };
  col.querySelectorAll(".kd").forEach((s) => {
    s.onclick = (e) => { e.stopPropagation(); kdefView = s.dataset.kd;
      localStorage.setItem("ls-kdef", kdefView); renderBoard(); };
  });
  const wrap = el("div", "rows");
  P.filter((p) => p.pos === kdefView)
    .sort((a, b) => (b.y_avg || b.pts || 0) - (a.y_avg || a.pts || 0))
    .slice(0, 34)
    .forEach((p) => addRow(p, wrap, true));
  col.appendChild(wrap);
  return col;
}

function renderBoard() {
  const board = $("#board");
  if (!board) return;
  board.innerHTML = "";
  const hasKdef = doc.kdef && doc.kdef.players.length;
  const weights = { QB: "1fr", RB: "1.05fr", WR: "1.05fr", TE: "1fr",
    KDEF: ".55fr" };
  const keys = hasKdef ? [...POSITIONS, "KDEF"] : [...POSITIONS];
  board.style.gridTemplateColumns =
    keys.map((k) => colMin[k] ? "30px" : weights[k]).join(" ");
  POSITIONS.forEach((pos) => board.appendChild(skillCol(pos)));
  if (hasKdef) board.appendChild(kdefCol());
}

/* ---------------- rail renders (ported) ---------------- */

function renderOwners() {
  const os = [...oStates()].sort((a, b) => b.left - a.left);
  $("#ownerbody").innerHTML = os.map((o) =>
    `<div class="orow${o.is_me ? " me" : ""}${o.max <= 1 ? " out" : ""}">
      <span>${o.name}</span>
      <span class="m g">$${o.left}</span>
      <span class="m">$${Math.max(o.max, 0)}</span>
      <span class="sp">${o.open}</span></div>`).join("");
  renderOwnerGrid();
}

function renderOwnerGrid() {
  const grid = $("#ogrid");
  if (!grid) return;
  const os = oStates();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
  grid.innerHTML = os.map((o, i) => {
    const fcls = ownerFilter
      ? (o.name.toLowerCase().startsWith(ownerFilter) ? " hit" : " dim") : "";
    return `<button class="obtn${o.is_me ? " me" : ""}${o.max <= 1 ? " out" : ""}${selOwner === o.id ? " selected" : ""}${fcls}"
      data-oid="${o.id}" title="${o.name}: $${o.left} bank, max bid $${o.max} (key: ${keys[i] ?? ""})">${o.name}</button>`;
  }).join("")
    + (ownerFilter ? `<div id="ofilter">${ownerFilter}</div>` : "");
  grid.querySelectorAll(".obtn").forEach((b) =>
    b.onclick = () => selectOwner(+b.dataset.oid));
}

function ownerSlots(oid) {
  const theirs = curSales.filter((s) => s.owner === oid)
    .map((s) => ({ ...(byId[s.pid] ?? { name: s.name, pos: s.pos }),
      price: s.price }));
  const slots = slotOrder().map((l) => ({ lab: l, who: null, price: null }));
  const fits = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"],
    DEF: ["DEF"] };
  theirs.forEach((p) => {
    const s = slots.find((x) => !x.who && (fits[p.pos] || []).includes(x.lab))
      || (["RB", "WR", "TE"].includes(p.pos)
        ? slots.find((x) => !x.who && x.lab === "FLX") : null)
      || slots.find((x) => !x.who && x.lab === "BN");
    if (s) { s.who = p; s.price = p.price; }
  });
  return { slots, spent: theirs.reduce((a, p) => a + p.price, 0) };
}

function renderRoster() {
  const viewId = rosterView ?? 0;
  const sel = $("#rostersel");
  if (document.activeElement !== sel) {
    sel.innerHTML = owners().map((o) =>
      `<option value="${o.id}">${o.is_me ? "My Roster" : o.name}</option>`)
      .join("");
    sel.value = String(viewId);
  }
  /* another team's roster: filled slots + money left, no plan projections */
  if (viewId !== 0) {
    const os = ownerSlots(viewId);
    const oleft = doc.league.budget - os.spent;
    $("#roster").innerHTML = os.slots.map((s) =>
      `<div class="slot${s.who ? " filled" : ""}"><span class="lab ${posClass(s.lab)}">${s.lab}</span>
        <span class="who">${s.who ? s.who.name : ""}</span>
        <span class="pr">${s.who ? fmt$(s.price) : ""}</span></div>`).join("")
      + `<div class="slot"><span class="lab"></span><span class="who">left</span>
         <span class="pr" title="spent $${os.spent} of $${doc.league.budget}">${fmt$(oleft)}</span></div>`;
    return;
  }
  /* my roster: envelopes water-filled to remaining budget + purse row */
  const ps = planState();
  $("#roster").innerHTML = ps.slots.map((s) =>
    `<div class="slot${s.who ? " filled" : ""}"><span class="lab ${posClass(s.lab)}">${s.lab}</span>
      <span class="who">${s.who ? s.who.name : ""}</span>
      <span class="pr">${s.who ? fmt$(s.price)
      : (ps.hasPlan
        ? (s.lab === "BN"
          ? `<span class="pl" title="estimated budget left for this bench spot as the plan flexes">~${fmt$(s.eff ?? ps.benchPer)}</span>`
          : `<span class="pl ${posClass(s.lab)}" title="plan for this slot: $${s.planned}${s.eff != null && s.eff !== s.planned ? " - flexed to your remaining budget (grows when you bank deals, shrinks when you overspend)" : ""}, capped at the best remaining value for the slot">~${fmt$(s.eff ?? s.planned)}</span>`)
        : "")}</span></div>`).join("")
    + `<div class="slot"><span class="lab"></span><span class="who">left</span>
       <span class="pr" title="spent $${ps.spent} of $${doc.league.budget}">${fmt$(ps.left)}</span></div>`;
}

function renderChips() {
  const inf = inflation();
  const infEl = $("#infl");
  infEl.className = "chip"
    + (inf.ratio > 1.12 || inf.ratio < 0.88 ? " hot" : "");
  const pct = Math.max(2, Math.min(98, (inf.ratio - 0.6) / 0.8 * 100));
  infEl.innerHTML = `<span class="lab">inflation</span>
    <span class="cval"><b>${inf.ratio.toFixed(2)}</b>
    <span class="g">$${inf.money}</span><span>/ $${Math.round(inf.value)}</span></span>
    <span class="gauge" title="dot vs center tick: right of center = money-rich room (overpays coming), left = money drying up (deals coming)"><i style="left:${pct.toFixed(1)}%"></i></span>`;
  const last = curSales[curSales.length - 1];
  if (last) {
    $("#lastchip").innerHTML = `<span class="lab">last sale</span>
      <span class="cval"><b>${last.name}</b><span class="g">${fmt$(last.price)}</span><span>${short(owners()[last.owner])}</span></span>`;
  } else {
    $("#lastchip").innerHTML = `<span class="lab">last sale</span><b>none yet</b>`;
  }
  const mast = $("#spendline");
  mast.textContent = `${doc.league.teams} TEAMS X $${doc.league.budget}` +
    (doc.market ? ` X MARKET ${mScale.toFixed(2)}` : "");
}

/* ---------------- favorites ----------------
 * Players you starred from the research popup, listed high value first. Unsold
 * ones first, then any that have already sold (dimmed). */
function renderFavorites() {
  const box = $("#favlist");
  if (!box) return;
  const items = (doc.favorites || [])
    .map((pid) => byId[pid]).filter(Boolean)
    .sort((a, b) => (soldSet.has(a.id) - soldSet.has(b.id))
      || ((b.usd || 0) - (a.usd || 0)));
  $("#favcount").textContent = items.length ? ` (${items.length})` : "";
  $("#favcaret").style.transform = flaggedOpen ? "rotate(90deg)" : "";
  box.style.display = flaggedOpen ? "" : "none";
  if (!flaggedOpen) return;
  const shown = notesExpanded ? items : items.slice(0, 30);
  box.innerHTML = (shown.map((p) => {
    const sold = soldSet.has(p.id);
    return `<button class="favrow${sold ? " out" : ""}" data-id="${p.id}">
      <span class="star">&#9733;</span>
      <span class="n">${p.name}<span class="tm ${posClass(p.pos)}">${p.pos}</span></span>
      <span class="d">${p.usd != null ? fmt$(p.usd) : "$1"}</span></button>`;
  }).join("")
    + (items.length > 30
      ? `<button class="more" id="favmore" style="padding:6px 2px">${notesExpanded ? "- collapse" : `+ ${items.length - 30} more...`}</button>` : ""))
    || `<div style="color:var(--faint);font-size:12px">no favorites yet. Open a player and tap the star to add one.</div>`;
  box.querySelectorAll(".favrow").forEach((b) =>
    b.onclick = () => openModal(b.dataset.id));
  const nm = $("#favmore");
  if (nm) nm.onclick = () => { notesExpanded = !notesExpanded; renderFavorites(); };
}

/* ---------------- positional pressure strip (deterministic, ported) ----------
 * Per position, need/left = starter slots still unfilled league-wide vs
 * startable ($5+) players remaining. Amber = window closing, red = crunch. */
function renderFlow() {
  const flow = $("#flow");
  if (!flow) return;
  const n = curSales.length;
  const runPos = new Set();
  if (n >= 4) {
    const last6 = curSales.slice(-6).map((s) => (byId[s.pid] || {}).pos);
    const counts = {};
    last6.forEach((pp) => { counts[pp] = (counts[pp] || 0) + 1; });
    for (const [pos, c] of Object.entries(counts)) {
      if (c >= 4 && POSITIONS.includes(pos)) runPos.add(pos);
    }
  }
  const needs = ownerNeedMap();
  const cells = POSITIONS.map((pos) => {
    const demand = Object.values(needs).reduce((a, x) => a + x[pos], 0);
    const supply = P.filter((p) => p.pos === pos && !soldSet.has(p.id)
      && (p.usd || 0) >= 5).length;
    const margin = supply - demand;
    const cls = demand > supply ? " crunch" : margin <= 2 ? " tight" : "";
    const run = runPos.has(pos)
      ? `<i class="runmark" title="${pos} run: 4+ of the last 6 sales">&#9650;</i>` : "";
    const iNeed = needs[0][pos] > 0
      || (["RB", "WR", "TE"].includes(pos) && needs[0].FLX > 0);
    const dot = cls ? `<i class="mdot ${iNeed ? "exposed" : "exploit"}"></i>` : "";
    const stance = !cls ? ""
      : iNeed ? " YOU STILL NEED THIS SLOT: act before the music stops; do not nominate your own target."
        : " Your slot is filled: nominate this position to drain the needers' budgets.";
    const state = demand > supply ? " - CRUNCH: someone goes without; the last startable ones sell at a premium."
      : margin <= 2 ? " - window closing." : "";
    return `<span class="fcell${cls}" title="${pos}: ${demand} starter slots still needed league-wide vs ${supply} startable ($5+) players left${state}${stance}${runPos.has(pos) ? " RUN in progress: wait out your target or feed it a player you don't want." : ""}">`
      + `<span class="${posClass(pos)}">${pos}</span><b>${demand}/${supply}</b>${dot}${run}</span>`;
  });
  const extras = [];
  const hoard = oStates().filter((o) => !o.is_me && o.left >= 100 && o.open <= 9)
    .sort((a, b) => b.left - a.left);
  const spots = doc.league.teams * rosterSpots(doc.league.full_roster);
  if (n > spots * 0.2 && hoard.length) {
    extras.push(`<span class="fcell tight" title="cash hoarders strike late: your cheap deals will get contested by these wallets">hoard <b>${hoard.slice(0, 2).map((o) => `${o.name} $${o.left}`).join(", ")}</b></span>`);
  }
  if (n >= 20) {
    const ps = planState();
    const startersFilled = ps.slots.filter((s) => s.starter && s.who).length;
    const nStart = ps.slots.filter((s) => s.starter).length;
    const pace = n / spots;
    if (nStart > 0 && startersFilled / nStart < pace - 0.25) {
      extras.push(`<span class="fcell crunch" title="${Math.round(pace * 100)}% of the draft is sold and you hold ${startersFilled} of ${nStart} starters: discipline is becoming stranding - start winning bids">pace <b>${startersFilled}/${nStart}</b></span>`);
    }
  }
  flow.innerHTML = cells.join("") + extras.join("");
}

/* ---------------- teams grid (ported) ---------------- */
function renderTeams() {
  const box = $("#teams");
  if (!box) return;
  const os = oStates();
  box.innerHTML = `<div id="tgrid">` + owners().map((o) => {
    const st = os.find((x) => x.id === o.id);
    const tiles = curSales.filter((s) => s.owner === o.id).map((s) => {
      const p = byId[s.pid]; if (!p) return "";
      return `<div class="ttile posbg-${p.pos}" data-id="${p.id}">
        <div class="tn ${posClass(p.pos)}">${p.name}</div>
        <div class="tmeta"><span><span class="${posClass(p.pos)}">${p.pos}</span> &middot; ${p.team || ""}</span><b>$${s.price}</b></div></div>`;
    }).join("");
    return `<div class="tcol${o.is_me ? " meCol" : ""}">
      <div class="thead">${o.is_me ? "You" : o.name}<small>$${st.left} left &middot; ${st.open} open</small></div>
      ${tiles}</div>`;
  }).join("") + `</div>`;
  box.querySelectorAll(".ttile").forEach((t) =>
    t.onclick = () => openModal(t.dataset.id));
}

function applyTab() {
  const b = $("#board"), t = $("#teams");
  if (!b || !t) return;
  b.style.display = boardTab === "board" ? "grid" : "none";
  t.style.display = boardTab === "teams" ? "block" : "none";
  document.querySelectorAll(".btab").forEach((x) =>
    x.classList.toggle("on", x.dataset.tab === boardTab));
}

/* ---------------- sale flow (ported) ---------------- */

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");

function search(qs) {
  const q = normName(qs);
  if (!q) return [];
  return P.filter((p) => !soldSet.has(p.id) && normName(p.name).includes(q))
    .sort((a, b) => ((b.usd || b.y_avg || 0) - (a.usd || a.y_avg || 0)))
    .slice(0, 8);
}

function renderHits() {
  $("#hits").innerHTML = hitList.map((p, i) =>
    `<button class="hit${i === hitSel ? " sel" : ""}" data-id="${p.id}">
      <span class="p">${p.pos}</span><span class="n">${p.name} ${p.team || ""}</span>
      <span class="d">${p.usd != null ? fmt$(p.usd) : "$1"}</span></button>`)
    .join("");
  $("#hits").querySelectorAll(".hit").forEach((b) =>
    b.onclick = () => pick(b.dataset.id));
}

function pick(pid) {
  picked = byId[pid]; selOwner = null; ownerFilter = "";
  hitList = []; renderHits(); $("#q").value = "";
  const p = picked;
  $("#picked").style.display = "block";
  $("#picked").innerHTML = `<div class="pnm">${p.name} <span class="${posClass(p.pos)}">${p.pos}</span> <span style="color:var(--faint)">${p.team || ""}</span>${p.inj ? ' <span style="color:var(--bad);font-size:12px">' + p.inj + "</span>" : ""}</div>`;
  $("#price").value = ""; $("#msg").textContent = "";
  renderCall(p);
  stageCopilot(p);
  stagedId = p.id;
  document.querySelectorAll(".row.staged").forEach((r) =>
    r.classList.remove("staged"));
  const br = document.querySelector(`.row[data-id="${p.id}"]`);
  if (br) br.classList.add("staged");
  renderOwnerGrid(); updateSummary();
  $("#price").focus();
}

/* the call: deterministic advisor (ported, now plan-aware). Synthesizes every
 * live metric plus the plan envelopes into one verdict + max price. Pure logic
 * over the same numbers on screen: traceable, instant, works offline (R1). */
function advise(p) {
  const ps = planState();
  const fit = planFit(p, ps);
  const inf = inflation();
  const deal = dealOf(p);
  const est = (doc.market && p.y_avg != null)
    ? Math.max(1, Math.round(p.y_avg * mScale * inf.ratio)) : null;
  const val = p.usd != null ? Math.max(1, Math.round(p.usd)) : 1;
  const myMax = oStates().find((o) => o.is_me).max;
  const reasons = [];

  let comparable = null, drop = null;
  if (POSITIONS.includes(p.pos) && p.usd != null) {
    const peers = P.filter((x) => x.pos === p.pos && !soldSet.has(x.id)
      && x.id !== p.id && x.usd != null);
    comparable = peers.filter((x) => x.usd >= p.usd - 5).length;
    const below = peers.filter((x) => x.usd < p.usd - 5)
      .sort((a, b) => b.usd - a.usd)[0];
    drop = below ? Math.round(p.usd - below.usd) : null;
  }
  const needs = ownerNeedMap();
  const contest = oStates().filter((o) => !o.is_me
    && o.max > Math.max(est || 2, 2)
    && (needs[o.id][p.pos] > 0
      || (["RB", "WR", "TE"].includes(p.pos) && needs[o.id].FLX > 0))).length;

  /* envelope status rows for the eligible open slots (mirrors My Roster) */
  const elig = ["K", "DEF"].includes(p.pos) ? [] : ps.openStarters.filter((s) =>
    s.lab === p.pos
    || (s.lab === "FLX" && ["RB", "WR", "TE"].includes(p.pos)));

  let cls, label, max, planCap;
  if (p.pos === "K" || p.pos === "DEF") {
    cls = "bench"; label = "$1 RULE"; max = 1; planCap = 1;
    reasons.push("kickers and defenses are $1 players; never bid $2");
  } else if (fit && fit.bench) {
    cls = "pass"; label = "BENCH ONLY"; max = Math.min(2, myMax);
    planCap = Math.max(1, Math.min(ps.benchPer, myMax));
    reasons.push((ps.benchOpen > 0
      ? "no starting slot open for him; bench money ~$" + ps.benchPer
        + " across " + ps.benchOpen + " spot" + (ps.benchOpen === 1 ? "" : "s")
      : "no roster spot open for him")
      + (ps.openStarters.length ? "; starters still open: "
        + ps.openStarters.map((s) => s.lab).join(" ") : ""));
  } else {
    const envMax = fit ? fit.max : val;
    planCap = Math.min(envMax, myMax);
    const cliffPressure = comparable != null && comparable <= 2 && contest >= 2
      && (drop == null || drop >= 8);
    if (deal != null && deal <= -4 && !cliffPressure) {
      cls = "pass"; label = "LET HIM GO"; max = Math.min(val, envMax);
    } else if (cliffPressure) {
      cls = "last"; label = "LAST CHANCE"; max = val;
      reasons.push(`only ${comparable} comparable ${p.pos}s left`
        + (drop != null ? ` before a $${drop} drop` : "")
        + ` and ${contest} funded owners still need one; paying full value is correct here`);
    } else if (deal != null && deal >= 2) {
      cls = "target"; label = "TARGET"; max = Math.min(val, envMax);
    } else {
      cls = "value"; label = "FAIR VALUE"; max = Math.min(val, envMax);
    }
    if (comparable != null && !cliffPressure) {
      reasons.push(`${comparable} comparable ${p.pos}s left, `
        + `${contest} funded owner${contest === 1 ? "" : "s"} fighting for them`);
    }
  }
  if (inf.ratio > 1.1) {
    reasons.push(`money-rich room (x${inf.ratio.toFixed(2)}): expect ~${Math.round((inf.ratio - 1) * 100)}% overpays`);
  } else if (inf.ratio < 0.9) {
    reasons.push(`money drying up (x${inf.ratio.toFixed(2)}): patience is being paid`);
  }
  if (p.inj) reasons.push("injury status: " + p.inj);
  return { cls, label, max: Math.max(1, Math.min(max, myMax)), worth: val,
    planCap, benchPer: ps.benchPer, benchOpen: ps.benchOpen, est, reasons,
    elig };
}

function renderCall(p) {
  const a = advise(p);
  const slotRows = a.elig.length
    ? `<div class="cslots">${a.elig.map((s) =>
      `<div class="srow"><span class="lab ${posClass(s.lab)}">${s.lab}</span>
       <span class="pl ${posClass(s.lab)}">~${fmt$(s.eff ?? s.planned)}</span></div>`).join("")}</div>`
    : (POSITIONS.includes(p.pos) && a.benchOpen > 0 && a.benchPer > 0
      ? `<div class="cslots"><div class="srow"><span class="lab">BN</span>
         <span class="pl">~${fmt$(a.benchPer)}</span></div></div>`
      : "");
  $("#call").style.display = "block";
  $("#call").innerHTML = `<span class="cverdict ${a.cls}">${a.label}</span>
    <div class="cmax" title="the break-even ceiling from my value model - past this you provably overpaid.">worth <b>$${a.max}</b>${a.max !== a.worth ? ` <span>(value $${a.worth}, plan-capped)</span>` : ""}</div>
    ${a.est ? `<div class="cest">room bids <b>~$${a.est}</b></div>` : ""}
    ${slotRows}
    <ul>${a.reasons.slice(0, 5).map((r) => `<li>${r}</li>`).join("")}</ul>`;
}

/* ---------------- AI live read (self-host only, gated) ----------------
 * The hosted app ships with config.AI_ENDPOINT null, so cp stays null and none
 * of this runs, no #liveread renders, no network call is made. A self-hoster
 * running copilot-server/ sets the endpoint; then the browser posts the same
 * numbers The Call already computed plus a plain-text brief. The read is
 * advisory text beside the numbers and never enters the value math (R1, #5). */
function copilotBrief() {
  const os = oStates();
  const inf = inflation();
  const ps = planState();
  const lines = [];
  lines.push(`${doc.league.teams}-team, $${doc.league.budget} budget. `
    + `${curSales.length} of ${doc.league.teams * rosterSpots(doc.league.full_roster)} sold. `
    + `inflation x${inf.ratio.toFixed(2)} ($${inf.money} chasing $${Math.round(inf.value)}).`);
  lines.push("owners (money / max bid / open): " + os.map((o) =>
    `${o.is_me ? "ME>" : o.name} $${o.left}/$${Math.max(o.max, 0)}/${o.open}`).join("; "));
  const recent = curSales.slice(-6).map((s) =>
    `${s.name} $${s.price} ${short(owners()[s.owner])}`);
  if (recent.length) lines.push("recent sales: " + recent.join(", ") + ".");
  lines.push(`my plan: spent $${ps.spent}, $${ps.left} left, reserve $${ps.purseLeft}/$${ps.purseTarget}, `
    + `open starters ${ps.openStarters.map((s) => s.lab).join(" ") || "none"}.`);
  return lines.join("\n");
}

function rosterFitLine(p) {
  const ps = planState();
  const fit = planFit(p, ps);
  if (!fit) return "";
  if (fit.bench) {
    return `MY ROSTER FIT: bench only for ${p.name} (${p.pos}); `
      + `no open starter slot; bench money ~$${ps.benchPer}.`;
  }
  return `MY ROSTER FIT: ${p.name} (${p.pos}) fits an open starter slot; `
    + `plan allows up to $${Math.round(fit.max)}.`;
}

function stageCopilot(p) {
  if (!cp) return;
  const a = advise(p);
  cp.stage({
    player: { name: p.name, pos: p.pos, our_value: a.worth,
      proj_pts: p.pts, est_bid: a.est },
    call: { verdict: a.label, worth: a.worth, plan_cap: a.planCap,
      room_bids: a.est, reasons: a.reasons.slice(0, 5),
      slots: a.elig.map((s) => ({ slot: s.lab,
        plan: Math.round(s.eff ?? s.planned) })),
      bench_per: a.benchPer, bench_open: a.benchOpen, tags: [] },
    brief: copilotBrief(),
    roster_fit: rosterFitLine(p),
  });
}

function selectOwner(oid) {
  selOwner = oid; ownerFilter = "";
  renderOwnerGrid(); updateSummary();
  $("#sold").focus();
}

function updateSummary() {
  const ready = picked && selOwner != null
    && parseInt($("#price").value, 10) >= 1;
  $("#sold").disabled = !ready;
  if (picked && selOwner != null) {
    const o = owners()[selOwner];
    const pr = parseInt($("#price").value, 10);
    let warn = "";
    if (o.is_me) {
      const ps = planState();
      const fit = planFit(picked, ps);
      if (fit && fit.bench && !["K", "DEF"].includes(picked.pos)
        && ps.openStarters.length) {
        warn = `<br><span style="color:var(--warn);font-weight:700">! bench buy while starters open: ${ps.openStarters.map((s) => s.lab).join(" ")}</span>`;
      } else if (fit && !fit.bench && pr > fit.max) {
        warn = `<br><span style="color:var(--warn);font-weight:700">! $${pr} exceeds plan fit of ${fmt$(fit.max)}</span>`;
      }
    }
    $("#summary").style.display = "block";
    $("#summary").innerHTML = `<b>${picked.name}</b> to <b>${o.name}</b> for <span class="g">${pr >= 1 ? fmt$(pr) : "$?"}</span>${warn}`;
  } else {
    $("#summary").style.display = "none";
  }
}

function resetSale() {
  picked = null; selOwner = null; hitList = []; hitSel = 0; ownerFilter = "";
  stagedId = null;
  if (cp) cp.clear();
  document.querySelectorAll(".row.staged").forEach((r) =>
    r.classList.remove("staged"));
  const ids = ["#picked", "#call", "#summary"];
  ids.forEach((i) => { const n = $(i); if (n) n.style.display = "none"; });
  if ($("#hits")) $("#hits").innerHTML = "";
  if ($("#q")) { $("#q").value = ""; $("#q").focus(); }
  if ($("#msg")) $("#msg").textContent = "";
}

async function commit() {
  if (!picked || selOwner == null) return;
  const price = parseInt($("#price").value, 10);
  if (!price || price < 1) {
    $("#msg").textContent = "enter a price of $1 or more";
    $("#price").focus(); return;
  }
  const p = picked, ow = selOwner;
  appendSale(doc, { pid: p.id, name: p.name, pos: p.pos, owner: ow, price });
  if (!p.kd && (p.usd || 0) < 2) freeExpanded[p.pos] = true;
  await saveDoc(doc);
  stampShow("SOLD", `${p.name} ${fmt$(price)} to ${owners()[ow].name}`);
  resetSale();
  refreshRoom();
  $("#q").focus();
}

/* Reopen the last sale for edits (button, and double-tap Escape while idle).
 * Pops the most recent sale and re-nominates that player with the old price and
 * owner pre-filled, so a wrong price or owner is a quick fix. Replaces the old
 * UNDO LAST: a mis-entry now reopens instead of just vanishing. */
async function reopenLastSale() {
  const last = curSales[curSales.length - 1];
  if (!last) return;
  const pid = last.pid, oldPrice = last.price, oldOwner = last.owner;
  appendUnsale(doc, last.seq);
  await saveDoc(doc);
  refreshRoom();
  if (!byId[pid]) return;
  pick(pid);
  $("#price").value = oldPrice;
  selectOwner(oldOwner);
  $("#price").focus(); $("#price").select();
  stampShow("REOPENED", `${byId[pid].name} back for edits`);
}

/* ---------------- player research popup ---------------- */

function openModal(pid) {
  const p = byId[pid], sale = soldBy[pid];
  /* research popup: only what the board does NOT already show survives here */
  const rows = [["tier", p.tier != null ? p.tier : "-"]];
  if (!sale && p.usd != null) rows.push(["my$", fmt$(Math.round(p.usd))]);
  if (p.y_avg != null) {
    rows.push(["avg auction", fmt$(Math.round(p.y_avg))]);
    rows.push(["est. league bid",
      `${fmt$(Math.round(p.y_avg * mScale))} (x${mScale.toFixed(2)})`]);
    const dl = dealOf(p);
    if (dl != null) {
      const r = Math.round(dl);
      rows.push(["deal", (r >= 0 ? "+" : "-") + "$" + Math.abs(r),
        r >= 0 ? "pos" : "neg"]);
    }
  }
  rows.push(["status", (p.inj || "healthy") + (p.rookie ? " / rookie" : "")]);
  if (sale) {
    rows.unshift(["SOLD",
      fmt$(sale.price) + " to " + owners()[sale.owner].name, "g"]);
    if (p.usd != null) {
      const v = Math.round(p.usd), diff = sale.price - v;
      rows.splice(1, 0, ["my$", fmt$(v)
        + (diff > 0 ? ` (paid +$${diff} over)` : diff < 0 ? ` (-$${-diff} under)` : ""),
        sale.price <= v ? "g" : ""]);
    }
  }
  /* My Call: set your own value for this player, then "Set to $X". Only for
   * skill players and only while unsold. Base value comes from the un-nudged
   * run; the pending value lives in the input until you save. */
  const base = baseValueOf(pid);
  const cd = callOf(pid);
  const calls = (!sale && POSITIONS.includes(p.pos) && base != null)
    ? `<div id="mcalls"><b>MY CALL</b>
        <div class="callset">
          <button class="cstep" id="cdec" title="down $1">-</button>
          <div class="cval"><span class="cd">$</span><input id="callval" type="number" min="1" step="1" value="${base + cd}"></div>
          <button class="cstep" id="cinc" title="up $1">+</button>
        </div>
        <div class="callbtns">
          <button class="ghost" id="callclear" title="clear this call and revert to the model's value">Reset to $${base}</button>
          <button class="primary" id="callsave">Set to $${base + cd}</button>
        </div>
        <div class="chint">Fine tune your value with a fading/boosting override. It is kept in a separate "blend + My Calls" run, so the base blend is never touched.</div></div>`
    : "";
  const fav = isFav(pid);
  $("#modal").innerHTML = `<div class="mhead"><div class="mhl">
        <button id="mfav" class="${fav ? "on" : ""}" title="${fav ? "remove from favorites" : "add to favorites"}">&#9733;</button>
        <div class="mhname"><h3>${p.name}</h3>
          <div class="sub">${p.pos} &middot; ${p.team || ""}</div></div></div>
      <button id="mclose" title="close">&times;</button></div>
    <table id="mtable">${rows.map((r) => `<tr><td>${r[0]}</td><td class="${r[2] || ""}">${r[1]}</td></tr>`).join("")}</table>
    ${calls}
    ${!sale ? `<button id="msell">RECORD SALE</button>`
    : `<button id="mrev">REVERSE THIS SALE</button>`}`;
  $("#ovl").style.display = "flex";
  $("#mclose").onclick = () => closeModal();
  $("#mfav").onclick = async () => {
    await toggleFav(pid);
    openModal(pid);        // re-render the star
    renderFavorites();     // update the panel live
  };
  if (calls) {
    const inp = $("#callval");
    const val = () => Math.max(1, Math.round(+inp.value || base));
    const upd = () => {
      $("#callsave").textContent = `Set to $${val()}`;
      $("#callclear").disabled = val() === base;   // nothing to reset at base
    };
    upd();
    $("#cdec").onclick = () => {
      inp.value = Math.max(1, (Math.round(+inp.value) || base) - 1); upd();
    };
    $("#cinc").onclick = () => {
      inp.value = (Math.round(+inp.value) || base) + 1; upd();
    };
    inp.oninput = upd;
    inp.onkeydown = (e) => { if (e.key === "Enter") $("#callsave").click(); };
    $("#callsave").onclick = () => setCall(pid, val() - base);
    $("#callclear").onclick = () => setCall(pid, 0);
  }
  const ms = $("#msell");
  if (ms) ms.onclick = () => { closeModal(); pick(p.id); };
  const mr = $("#mrev");
  if (mr) {
    mr.onclick = async () => {
      appendUnsale(doc, sale.seq);
      await saveDoc(doc);
      closeModal();
      stampShow("REVERSED", `${p.name} back on the board`);
      refreshRoom();
    };
  }
}

function closeModal() {
  $("#ovl").style.display = "none";
  if (!picked && $("#q")) $("#q").focus();
}

/* ---------------- plan editor (edit envelopes / variants) ---------------- */

function openPlanEditor() {
  if (!doc.league || !doc.league.plan) {
    alert("Fetch or import projections first; the plan needs a valued board.");
    return;
  }
  const plan = doc.league.plan;
  plan.variants = plan.variants || {};
  /* only the skill-starter envelopes are editable; K/DEF/BN are the purse */
  const keys = Object.keys(plan.envelopes)
    .filter((k) => !["K", "DEF", "BN"].includes(k));
  const rows = keys.map((k) =>
    `<tr><td>${k}</td><td><input class="penv" data-k="${k}" type="number" min="1" step="1" value="${plan.envelopes[k]}" style="width:80px;text-align:right"></td></tr>`)
    .join("");
  const purseVal = plan.purse != null ? plan.purse
    : Math.round((plan.float_target[0] + plan.float_target[1]) / 2) + 6;
  const varOpts = Object.keys(plan.variants).map((v) =>
    `<option value="${v}">${v}</option>`).join("");
  $("#modal").innerHTML = `<h3>Budget plan</h3>
    <div class="sub">stars-and-scrubs envelopes: what you plan to spend per starting slot. These shape The Call's plan-fit and your roster projections; they never touch the value math. The live water-fill flexes them as the draft unfolds.</div>
    ${varOpts ? `<div class="field"><span>Load a saved variant</span><select id="pvar"><option value="">(pick one)</option>${varOpts}</select></div>` : ""}
    <div class="field"><span>Reserve held for bench + K + DEF</span><input id="ppurse" type="number" min="0" step="1" value="${purseVal}" style="width:80px;text-align:right"></div>
    <table id="mtable">${rows}</table>
    <div class="wiznav" style="margin-top:14px;gap:8px;flex-wrap:wrap">
      <button class="ghost tiny" id="planDefault">reset to value default</button>
      <button class="ghost tiny" id="planSaveAs">save as variant...</button>
      <button class="primary" id="planSave">Save plan</button>
    </div>`;
  $("#ovl").style.display = "flex";
  const readInputs = () => {
    document.querySelectorAll(".penv").forEach((inp) => {
      plan.envelopes[inp.dataset.k] = Math.max(1, parseInt(inp.value, 10) || 1);
    });
    const pv = parseInt($("#ppurse").value, 10);
    plan.purse = Number.isFinite(pv) ? pv : null;
  };
  $("#planSave").onclick = async () => {
    readInputs(); await saveDoc(doc); closeModal(); refreshRoom();
  };
  $("#planDefault").onclick = async () => {
    doc.league.plan = { ...defaultPlan(curRun.players, slotOrder(),
      doc.league.budget), variants: plan.variants };
    await saveDoc(doc); closeModal(); openPlanEditor();
  };
  $("#planSaveAs").onclick = async () => {
    const name = (prompt("Name this plan variant:") || "").trim();
    if (!name) return;
    readInputs();
    plan.variants[name] = { envelopes: { ...plan.envelopes },
      purse: plan.purse, float_target: [...plan.float_target] };
    await saveDoc(doc); openPlanEditor();
  };
  const pvar = $("#pvar");
  if (pvar) {
    pvar.onchange = async () => {
      const v = plan.variants[pvar.value];
      if (!v) return;
      plan.envelopes = { ...v.envelopes };
      plan.purse = v.purse;
      plan.float_target = [...v.float_target];
      plan.variant = pvar.value;
      await saveDoc(doc); openPlanEditor();
    };
  }
}

/* ---------------- the room shell ---------------- */

function renderBoardScreen() {
  const root = $("#main");
  root.innerHTML = "";
  buildModel();

  /* masthead line, mirroring the predecessor: run selector + last sale on the
   * left, inflation centered, flow strip on the right (built with the rail) */
  const hl = $("#hleft"), hc = $("#hcenter");
  hl.innerHTML = curRun ? `
    <div class="chip"><span class="lab">values from</span><select id="runsel" title="which run all board values come from; add a new source at the bottom of the list"></select></div>
    <div class="chip" id="lastchip"></div>` : "";
  hc.innerHTML = curRun ? `<div class="chip" id="infl"></div>` : "";
  const hf = $("#flow"); if (hf) hf.innerHTML = "";

  if (!curRun) {
    const empty = el("div", "empty");
    empty.appendChild(el("p", null,
      "No projections yet. Fetch to populate the board."));
    const btn = el("button", "primary", "Fetch projections");
    btn.onclick = async () => {
      btn.disabled = true;
      try { await doFetchSleeper(); renderBoardScreen(); }
      catch (e) { btn.textContent = `Failed: ${e.message}`; }
    };
    empty.appendChild(btn);
    root.appendChild(empty);
    return;
  }

  const layout = el("div", "layout");
  const boardcol = el("div", "boardcol");
  boardcol.innerHTML = `
    <div id="btabs">
      <button class="btab on" data-tab="board">BOARD</button>
      <button class="btab" data-tab="teams">TEAMS</button>
    </div>
    <div class="boardscroll">
      <div class="cols" id="board"></div>
      <div id="teams" style="display:none"></div>
    </div>`;
  layout.appendChild(boardcol);

  const rail = el("div"); rail.id = "rail";
  rail.innerHTML = `
    <div class="panel">
      <input id="q" placeholder="/Player" autocomplete="off">
      <div id="hits"></div>
      <div id="picked"></div>
      <div id="call"></div>
      ${AI_ENABLED ? '<div id="liveread"></div>' : ""}
      <div id="saleform">
        <div class="steplab">price</div>
        <span style="font-family:var(--mono);color:var(--gold);font-size:17px;font-weight:700">$</span>
        <input id="price" type="number" min="1" step="1" placeholder="0">
        <div id="salegrid">
          <div><h2><select id="rostersel" title="view any team's roster"></select></h2><div id="roster"></div></div>
          <div><div class="steplab">owner</div><div id="ogrid"></div></div>
        </div>
        <div id="summary"></div>
        <button id="sold" disabled>DRAFT</button>
        <div id="msg"></div>
      </div>
    </div>
    <div class="panel">
      <h2 id="ledgerhead" style="cursor:pointer" title="click to collapse/expand">Owner ledger <span id="ledgerarrow">&#9662;</span></h2>
      <div id="ledgerbody">
        <div class="ohead"><span>team</span><span>left</span><span>max bid</span><span>open</span></div>
        <div id="ownerbody"></div>
      </div>
    </div>
    <div class="panel">
      <h2 id="favhd" style="cursor:pointer;user-select:none" title="players you starred from the research popup. Click to expand/collapse."><span id="favcaret" style="display:inline-block;transition:transform .18s;color:var(--faint)">&rsaquo;</span> Favorites<span id="favcount" style="color:var(--faint);font-weight:400;font-size:12px"></span></h2>
      <div id="favlist"></div>
    </div>`;
  layout.appendChild(rail);
  root.appendChild(layout);

  const runsel = $("#runsel");
  runsel.innerHTML = doc.runs.map((r) =>
    `<option value="${r.run_id}">${r.source_label} (#${r.run_id})</option>`)
    .join("")
    + ((doc.calls || []).length
      ? `<option value="calls">blend + My Calls</option>` : "")
    + `<option disabled>--------</option><option value="__add">Add New...</option>`;
  runsel.value = String(curRun.run_id);
  runsel.onchange = async () => {
    const v = runsel.value;
    if (v === "__add") { importState = { kind: "values" }; renderImport(); return; }
    doc.ui.run = v === "calls" ? "calls" : parseInt(v, 10);
    await saveDoc(doc); refreshRoom();
  };
  document.querySelectorAll(".btab").forEach((b) => {
    b.onclick = () => {
      boardTab = b.dataset.tab; localStorage.setItem("ls-tab", boardTab);
      applyTab();
    };
  });
  $("#favhd").onclick = () => {
    flaggedOpen = !flaggedOpen;
    localStorage.setItem("ls-fav", flaggedOpen ? "open" : "closed");
    renderFavorites();
  };

  $("#q").addEventListener("input", () => {
    hitList = search($("#q").value); hitSel = 0; renderHits();
  });
  $("#q").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { hitSel = Math.min(hitSel + 1,
      hitList.length - 1); renderHits(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { hitSel = Math.max(hitSel - 1, 0);
      renderHits(); e.preventDefault(); }
    else if (e.key === "Enter" && hitList[hitSel]) {
      pick(hitList[hitSel].id); e.preventDefault(); }
  });
  $("#price").addEventListener("input", updateSummary);
  $("#price").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!$("#sold").disabled) { commit(); return; }
      const b = document.querySelector(".obtn"); if (b) b.focus();
    }
  });
  $("#sold").onclick = commit;
  $("#rostersel").onchange = () => {
    rosterView = parseInt($("#rostersel").value, 10); renderRoster();
  };
  $("#ledgerhead").onclick = () => {
    const open = $("#ledgerbody").style.display !== "none";
    $("#ledgerbody").style.display = open ? "none" : "block";
    $("#ledgerarrow").innerHTML = open ? "&#9656;" : "&#9662;";
  };

  renderBoard(); renderTeams(); renderOwners(); renderRoster();
  renderChips(); renderFavorites(); renderFlow(); applyTab();
}

/* re-render everything after a state change, preserving staged state */
function refreshRoom() {
  const keepPicked = picked, keepOwner = selOwner;
  renderBoardScreen();
  if (keepPicked && !soldSet.has(keepPicked.id)) {
    pick(keepPicked.id);
    if (keepOwner != null) selectOwner(keepOwner);
  }
}


/* ---------------- keys (ported) ---------------- */

const OKEYS = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6,
  "8": 7, "9": 8, "0": 9, "-": 10, "=": 11 };

document.addEventListener("keydown", (e) => {
  if (!doc || !doc.league || !curRun || !$("#q")) return;
  const a = document.activeElement;
  const inInput = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"
    || a.tagName === "SELECT");
  const modalUp = $("#ovl").style.display === "flex";
  if (e.key === "/" && !inInput) { $("#q").focus(); e.preventDefault(); return; }
  if (e.key === "Escape") {
    /* idle + a recent sale exists: double-tap within 500ms reopens it for a
     * price/owner edit. A single idle tap does nothing. */
    if (!picked && !modalUp && curSales.length) {
      const now = performance.now();
      if (now - lastEsc < 500) { lastEsc = 0; reopenLastSale(); return; }
      lastEsc = now; return;
    }
    resetSale(); closeModal(); return;
  }
  if (!inInput && !picked && e.key.length === 1 && /[a-z]/i.test(e.key)
    && !e.metaKey && !e.ctrlKey && !e.altKey) { $("#q").focus(); return; }
  if (picked && !inInput && e.key in OKEYS) {
    const btns = document.querySelectorAll(".obtn");
    const b = btns[OKEYS[e.key]];
    if (b) { selectOwner(+b.dataset.oid); e.preventDefault(); return; }
  }
  /* type-to-filter the owner grid while staged (digit hotkeys take precedence,
   * inert while the modal is up). Enter takes the first match. */
  if (picked && !inInput && !modalUp) {
    if (e.key === "Enter" && ownerFilter) {
      const hit = owners().find((o) =>
        o.name.toLowerCase().startsWith(ownerFilter));
      ownerFilter = "";
      if (hit) selectOwner(hit.id); else renderOwnerGrid();
      e.preventDefault(); return;
    }
    if (e.key === "Backspace" && ownerFilter) {
      ownerFilter = ownerFilter.slice(0, -1);
      renderOwnerGrid(); e.preventDefault(); return;
    }
    if (e.key.length === 1
      && (/[a-z'.]/i.test(e.key) || (e.key === " " && ownerFilter))
      && !e.metaKey && !e.ctrlKey && !e.altKey) {
      ownerFilter += e.key.toLowerCase();
      renderOwnerGrid(); e.preventDefault(); return;
    }
  }
  if (picked && !inInput && e.key === "Enter" && !$("#sold").disabled
    && !(a && a.className && String(a.className).includes("obtn"))) {
    commit(); e.preventDefault(); return;
  }
  if (a && a.className && String(a.className).includes("obtn")) {
    const btns = [...document.querySelectorAll(".obtn")];
    const i = btns.indexOf(a);
    const moves = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 };
    if (e.key in moves && btns[i + moves[e.key]]) {
      btns[i + moves[e.key]].focus(); e.preventDefault();
    }
  }
});
$("#ovl").onclick = (e) => { if (e.target.id === "ovl") closeModal(); };

/* ---------------- under the hood (rewritten for strangers) ---------------- */

const HELP_VALUE = `<div style="font-size:13.5px;line-height:1.6;color:var(--muted)">
  <p><b style="color:var(--text)">1. Bring your own projections; blend them.</b>
  One click pulls Sleeper's public projections; you can paste or import more
  sources (Yahoo, ESPN, FantasyPros, a rankings list). When you have more than
  one, the board averages them, because ensembles beat any single forecaster.</p>
  <p><b style="color:var(--text)">2. Re-scored under YOUR rules.</b>
  Points are recomputed from raw stats with the exact scoring you entered in the
  wizard. That is why these values can differ from any public sheet.</p>
  <p><b style="color:var(--text)">3. Availability discount.</b>
  Each projection is trimmed by the games players at that draft slot
  historically miss (a shipped, attributed aggregate of open data). Elite RB
  slots miss the most; the discount is baked in.</p>
  <p><b style="color:var(--text)">4. Points above a free player.</b>
  When the draft ends, a replacement-level player at each position is still free
  on waivers. So points a free player would also score are worth $0; a player's
  worth is only his points ABOVE that line. Tiers mark real value cliffs (a tier
  ends once value falls 20% below that tier's own top).</p>
  <p><b style="color:var(--text)">Then points become dollars.</b>
  The room holds teams x budget. After $1 minimums for every roster spot, the
  rest splits among players in proportion to surplus. Every value sums back to
  the room's money, so if one player is overpriced another is underpriced.</p>
  <p><b style="color:var(--text)">What sits on top (evidence, never inside the
  number).</b> DEAL compares my value to a market source you pasted, rescaled
  to your league's money supply. My Calls are your own dollar nudges on a
  player's value, set from the research popup; they live only in the separate
  "blend + My Calls" run you pick in the values-from dropdown, and never touch
  the base blend.</p>
  </div>`;

const HELP_ROOM = `<div style="font-size:13.5px;line-height:1.6;color:var(--muted)">
  <p><b style="color:var(--text)">One place, one verdict.</b>
  Stage a player (double-click a row, or search and Enter) and The Call fires
  instantly: a verdict pill, the bid ceiling, the envelope status of the slots
  he could fill, and the comparable-supply line. It is pure arithmetic over the
  numbers already on screen, so it works offline.</p>
  <p><b style="color:var(--text)">The pressure strip.</b>
  The top-bar strip is deterministic and recomputed after every sale: per
  position, starter slots still needed league-wide vs startable players left.
  Amber = window closing, red = crunch. A pulsing marker flags a positional run;
  hoarder and pace chips appear only when they fire.</p>
  <p><b style="color:var(--text)">Your plan.</b>
  The envelopes you set under PLAN water-fill to your remaining budget as the
  draft unfolds: envelopes grow when you bank deals and shrink when you overpay,
  each capped at the best value still available for that slot. A reserve is held
  back for your bench, K and DEF so a starter run never strands them.</p>
  <p><b style="color:var(--text)">The AI live read (self-host only).</b>
  This hosted app ships with no AI: no key, no calls, nothing leaves your
  browser but the projection sources you fetch yourself. Developers who want a
  live "reading the room" can run the small companion server in the open-source
  repo (copilot-server/) against their own AI, and point the app's config at it.
  It is a layer, never a dependency: the board and The Call never need it.</p>
  </div>`;

function openHelp() {
  $("#modal").innerHTML = `<h3>Under the hood</h3>
    <div class="sub">every number traces to one saved run (see the values-from chip)</div>
    <div id="mtabs">
      <button class="mtab on" data-m="v">our$</button>
      <button class="mtab" data-m="r">the room</button>
    </div>
    <div id="mtabc">${HELP_VALUE}</div>`;
  document.querySelectorAll(".mtab").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".mtab").forEach((x) =>
        x.classList.toggle("on", x === b));
      $("#mtabc").innerHTML = b.dataset.m === "v" ? HELP_VALUE : HELP_ROOM;
    };
  });
  $("#ovl").style.display = "flex";
}

/* ---------------- boot ---------------- */

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  doc = await loadDoc();
  applyTheme();
  const importInput = $("#importfile");
  importInput.onchange = async () => {
    if (!importInput.files.length) return;
    try {
      doc = await importDocFile(importInput.files[0]);
      applyTheme();
      doc.league ? renderBoardScreen() : renderWizard();
    } catch (e) { alert(e.message); }
  };
  const menu = $("#gearmenu");
  $("#gearbtn").onclick = (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  document.addEventListener("click", (ev) => {
    if (!menu.hidden && !menu.contains(ev.target)) menu.hidden = true;
  });
  const themeBtn = $("#menuTheme");
  themeBtn.classList.toggle("on", (doc?.ui?.theme || "dark") !== "light");
  themeBtn.onclick = async () => {
    if (!doc) return;
    doc.ui.theme = doc.ui.theme === "light" ? "dark" : "light";
    doc.ui.themeChosen = true;
    applyTheme(); await saveDoc(doc);
    themeBtn.classList.toggle("on", doc.ui.theme !== "light");
    if (doc.league && curRun) refreshRoom();
  };
  $("#menuPlan").onclick = () => {
    menu.hidden = true;
    if (!doc || !doc.league) { alert("Finish setup first."); return; }
    openPlanEditor();
  };
  $("#menuLeague").onclick = () => {
    menu.hidden = true;
    if (!doc || !doc.league) { alert("Finish setup first."); return; }
    openLeagueEditor();
  };
  let resetArmed = 0;
  const resetBtn = $("#menuReset");
  resetBtn.onclick = async (ev) => {
    ev.stopPropagation();
    if (!doc || !doc.league) { alert("Nothing to reset yet."); return; }
    if (Date.now() - resetArmed > 5000) {
      resetArmed = Date.now();
      resetBtn.textContent = "Click again to CONFIRM reset";
      setTimeout(() => {
        resetBtn.textContent = "Reset board (clear all sales)"; resetArmed = 0;
      }, 5000);
      return;
    }
    resetBtn.textContent = "Reset board (clear all sales)";
    resetArmed = 0; menu.hidden = true;
    const n = activeSales(doc.journal).length;
    doc.journal = [];                 // deliberate draft reset; league is kept
    await saveDoc(doc);
    resetSale();
    stampShow("RESET", `${n} sales cleared`);
    refreshRoom();
  };
  $("#menuHelp").onclick = () => { menu.hidden = true; openHelp(); };
  $("#menuImport").onclick = () => { menu.hidden = true; importInput.click(); };
  $("#menuExport").onclick = () => {
    menu.hidden = true;
    if (doc) exportDoc(doc);
    else alert("Nothing to back up yet.");
  };
  $("#menuSleeper").onclick = async () => {
    menu.hidden = true;
    if (!doc || !doc.league) { alert("Finish setup first."); return; }
    try { await doFetchSleeper(); renderBoardScreen(); }
    catch (e) { alert(`Fetch failed (${e.message}). Are you offline?`); }
  };
  $("#ovl").onclick = (e) => { if (e.target.id === "ovl") closeModal(); };

  /* AI live read: wired ONLY when a self-hoster set config.AI_ENDPOINT. The
   * hosted build has AI_ENABLED false, so nothing here runs and no AI UI or
   * network call exists. */
  if (AI_ENABLED) {
    try {
      const mod = await import("./copilot.js");
      cp = mod.makeCopilot(AI_ENDPOINT);
      const btn = document.createElement("button");
      btn.id = "menuCopilot"; btn.className = "";
      const setLabel = () => { btn.textContent = "AI live read: " + cp.mode(); };
      setLabel();
      btn.onclick = () => {
        const modes = ["synthesize", "complement", "off"];
        const next = modes[(modes.indexOf(cp.mode()) + 1) % modes.length];
        cp.setMode(next); setLabel();
        if (next === "off") cp.clear();
        else if (picked) stageCopilot(picked);
      };
      menu.insertBefore(btn, $("#menuHelp"));
    } catch (e) { console.warn("copilot unavailable", e); }
  }

  if (doc && doc.league) renderBoardScreen();
  else renderWizard();
}

boot();
