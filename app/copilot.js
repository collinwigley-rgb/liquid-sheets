/* Optional AI "live read" client. Loaded by app.js ONLY when config.AI_ENDPOINT
 * is set (a self-hoster running copilot-server/). The hosted app never imports
 * this file: it ships with no AI, no key, and no #liveread element.
 *
 * This is the browser half of the personal tool's server-mediated copilot
 * (levi-sheet/draftroom/app.html V56, stageCopilot). app.js hands it the exact
 * numbers The Call already computed plus a plain-text brief; this module posts
 * to the companion server, polls for the read, and paints #liveread. The read
 * is advisory text beside the numbers and never enters the value math. */

const MODES = ["synthesize", "complement", "off"];

export function makeCopilot(endpoint) {
  const base = String(endpoint).replace(/\/+$/, "");
  let seq = 0, timer = null;
  const node = () => document.getElementById("liveread");

  function clear() {
    const n = node();
    if (n) { n.textContent = ""; n.className = ""; }
    if (timer) { clearInterval(timer); timer = null; }
  }

  return {
    mode() {
      const m = localStorage.getItem("ls-cp-mode");
      return MODES.includes(m) ? m : "off";   // default OFF for the public app
    },
    setMode(m) {
      if (MODES.includes(m)) localStorage.setItem("ls-cp-mode", m);
    },
    clear,
    async stage(payload) {
      const n = node();
      if (!n) return;
      if (this.mode() === "off") { clear(); return; }
      try {
        const res = await (await fetch(base + "/api/stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, mode: this.mode() }),
        })).json();
        seq = res.seq;
        n.className = "thinking";
        n.textContent = "reading the room...";
        if (timer) clearInterval(timer);
        timer = setInterval(async () => {
          try {
            const c = await (await fetch(base + "/api/copilot")).json();
            if (c.seq === seq && c.status === "ready") {
              clearInterval(timer); timer = null;
              n.className = "";
              const t = (c.text || "").trim();
              n.textContent = /^no (live )?read\b/i.test(t) ? "" : t;
            }
          } catch (e) { clearInterval(timer); timer = null; n.className = ""; }
        }, 1200);
      } catch (e) {
        n.className = "";
        n.textContent = "";
      }
    },
  };
}
