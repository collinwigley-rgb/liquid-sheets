/* Persistence per ADR-0005: one versioned document in IndexedDB, plain
 * structures, append-only runs and journal, one-file JSON export/import as
 * the recovery ritual. No other storage mechanism is used. */

const DB_NAME = "liquidsheets";
const STORE = "docs";
const KEY = "main";
export const SCHEMA_VERSION = 2;

function openDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function loadDoc() {
  const db = await openDB();
  const raw = await new Promise((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).get(KEY);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => rej(rq.error);
  });
  return raw ? migrate(raw) : null;
}

/* Forward-fill fields added in later schema versions so an older stored doc
 * (or an imported older backup) keeps loading. Idempotent and non-destructive:
 * only fills what is missing; never rewrites recorded runs or the journal. */
export function migrate(doc) {
  if (!doc.calls) doc.calls = [];        // named bets (my-calls mechanism); empty
  if (!doc.tags) doc.tags = {};          // pid -> {tags, note, opinion}; Path E sink
  if (!doc.ui) doc.ui = {};
  /* dark is the default color scheme. themeChosen distinguishes a real user
   * choice from the old hardcoded default, so pre-theme docs flip to dark while
   * an explicit light choice persists. */
  if (doc.ui.themeChosen === undefined) doc.ui.themeChosen = false;
  if (!doc.ui.themeChosen) doc.ui.theme = "dark";
  else if (!doc.ui.theme) doc.ui.theme = "dark";
  if (!("run" in doc.ui)) doc.ui.run = null;        // selected run id
  if (!doc.ui.planVariant) doc.ui.planVariant = "default";
  doc.schema_version = SCHEMA_VERSION;
  return doc;
}

export async function saveDoc(doc) {
  doc.saved_at = new Date().toISOString();
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function wipeDoc() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export function newDoc() {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    league: null,          // wizard output; null means wizard not finished
    names: {},             // player_id -> display name
    player_meta: {},       // player_id -> {adp, injury_status, is_rookie}
    sources: {},           // source name -> {as_of, players: [...]}
    runs: [],              // append-only; never mutate a recorded run
    journal: [],           // append-only sale journal (M3)
    calls: [],             // named bets {name,pos,thesis,points?,adjust?}; empty
    tags: {},              // pid -> {tags:[], note, opinion}; Path E import sink
    ui: { theme: "dark", themeChosen: false, run: null,
      planVariant: "default" },
  };
}

export function exportDoc(doc) {
  const blob = new Blob([JSON.stringify(doc, null, 1)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `liquid-sheets-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importDocFile(file) {
  const doc = JSON.parse(await file.text());
  if (typeof doc !== "object" || doc === null || !("schema_version" in doc)) {
    throw new Error("Not a Liquid Sheets backup file.");
  }
  if (doc.schema_version > SCHEMA_VERSION) {
    throw new Error("Backup is from a newer app version; refresh the app first.");
  }
  migrate(doc);
  await saveDoc(doc);
  return doc;
}
