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
  if (!doc.calls) doc.calls = [];        // My Calls: [{pid, delta}]; empty
  if (!doc.favorites) doc.favorites = []; // favorited player ids
  if (!doc.ui) doc.ui = {};
  /* dark is the default color scheme. themeChosen distinguishes a real user
   * choice from the old hardcoded default, so pre-theme docs flip to dark while
   * an explicit light choice persists. */
  if (doc.ui.themeChosen === undefined) doc.ui.themeChosen = false;
  if (!doc.ui.themeChosen) doc.ui.theme = "dark";
  else if (!doc.ui.theme) doc.ui.theme = "dark";
  if (!("run" in doc.ui)) doc.ui.run = null;        // selected run id
  if (!doc.ui.planVariant) doc.ui.planVariant = "default";
  if (!("availFade" in doc.ui)) doc.ui.availFade = true;   // availability fade on
  doc.schema_version = SCHEMA_VERSION;
  return doc;
}

/* Listeners run after every successful save (status line, file auto-save). */
const savedListeners = [];
export function onSaved(fn) { savedListeners.push(fn); }

export async function saveDoc(doc) {
  doc.saved_at = new Date().toISOString();
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  for (const fn of savedListeners) { try { fn(doc); } catch (e) { console.warn(e); } }
}

/* ---- where the data lives, made visible ----
 * Ask the browser to mark this origin's storage persistent (not evicted under
 * disk pressure). Returns true/false, or null if the API is missing. */
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (e) { /* ignore */ }
  return null;
}

/* Heuristic for a private/incognito window, where storage is discarded on
 * close. Browsers hand such windows a much smaller quota; there is no direct
 * API, so this is a best-effort hint, worded as one in the UI. */
export async function storageLooksTemporary() {
  try {
    const est = navigator.storage && navigator.storage.estimate
      ? await navigator.storage.estimate() : null;
    if (est && est.quota && est.quota < 250 * 1024 * 1024) return true;
  } catch (e) { /* ignore */ }
  return false;
}

/* ---- save to a file the user owns ----
 * Chrome/Edge expose the File System Access API: pick a file once, then every
 * later save writes to the same file silently. The handle is kept in the same
 * IndexedDB store. Other browsers fall back to a download (exportDoc). */
const HANDLE_KEY = "filehandle";
export const canSaveToFile = typeof window !== "undefined"
  && "showSaveFilePicker" in window;

async function getKey(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).get(key);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => rej(rq.error);
  });
}
async function putKey(key, val) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    if (val === null) tx.objectStore(STORE).delete(key);
    else tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function linkedFileName() {
  const h = await getKey(HANDLE_KEY);
  return h ? h.name : null;
}

export async function unlinkFile() { await putKey(HANDLE_KEY, null); }

/* pick: force the picker even if a file is linked. silent: never prompt
 * (used by auto-save); returns {mode:"needs-click"} if permission lapsed. */
export async function saveToFile(doc, { pick = false, silent = false } = {}) {
  if (!canSaveToFile) { exportDoc(doc); return { mode: "download" }; }
  let h = pick ? null : await getKey(HANDLE_KEY);
  if (h) {
    const opts = { mode: "readwrite" };
    let p = await h.queryPermission(opts);
    if (p !== "granted") {
      if (silent) return { mode: "needs-click", name: h.name };
      p = await h.requestPermission(opts);
      if (p !== "granted") h = null;
    }
  }
  if (!h) {
    if (silent) return { mode: "none" };
    h = await window.showSaveFilePicker({
      suggestedName: `liquid-sheets-${new Date().toISOString().slice(0, 10)}.json`,
      types: [{ description: "Liquid Sheets backup",
        accept: { "application/json": [".json"] } }],
    });
    await putKey(HANDLE_KEY, h);
  }
  const w = await h.createWritable();
  await w.write(JSON.stringify(doc, null, 1));
  await w.close();
  return { mode: "file", name: h.name };
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
    calls: [],             // My Calls: [{pid, delta}]; empty
    favorites: [],         // favorited player ids
    ui: { theme: "dark", themeChosen: false, run: null,
      planVariant: "default", availFade: true },
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
