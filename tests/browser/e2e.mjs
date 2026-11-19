// End-to-end checks in real Chromium browsers (Brave, Chrome, Edge when installed), driven over CDP.
// Usage: node tests/browser/e2e.mjs [baseUrl]   (default: starts the local server)
// Screenshots go to tests/browser/out/ (git-ignored).
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, findBrowser } from "./cdp.mjs";
import { serve } from "../serve.mjs";

const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const ROUTES = ["overview", "market", "components", "product/rx9060xt", "watchlist", "timing", "alerts", "alerts?tab=history", "configs", "budget", "history", "settings"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

let server = null, BASE = process.argv[2];
if (!BASE) { server = await serve(5199); BASE = "http://localhost:5199/"; }

const results = [];
function check(browser, name, ok, detail = "") { results.push({ browser, name, ok: !!ok, detail }); console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`); }

async function run(name) {
  if (!findBrowser(name)) { console.log(`\n${name}: not installed, skipped`); results.push({ browser: name, name: "installed", ok: null, detail: "not installed" }); return; }
  const b = await launch(name);
  console.log(`\n${name} — ${b.version}`);
  const ignorable = e => /favicon|ERR_INTERNET_DISCONNECTED|net::ERR_ABORTED/.test(e);
  try {
    // 1. v1 → v2 migration, with an existing v1 store
    // seed from a same-origin page that is not the app, so the app cannot save over it first
    await b.goto(BASE + "manifest.webmanifest", 500);
    const D = 864e5, now = Date.now();
    await b.eval(`localStorage.clear(); localStorage.setItem("bourse-hardware-v1", JSON.stringify({ prods: { rx9060xt: { target: 500, hist: [{ t: ${now - 10 * D}, p: 640, src: "releve" }, { t: ${now - 5 * D}, p: 610, src: "releve" }, { t: ${now - D}, p: 590, src: "releve" }] } }, alerts: [{ t: ${now - D}, type: "drop", text: "baisse", read: false }], budget: { net: 2300, fixed: 900, life: 600, saved: 100, pc: 500 }, plan: { gpuFirst: true, done: { case: true } } })); return 1;`);
    await b.goto(BASE + "#/overview", 2500);
    const mig = await b.eval(`const s = window.__bh.store.state; return { net: s.budget.net, n: s.observations.filter(o => o.productId === "rx9060xt" && o.status === "verified").length, target: s.watchlist.find(w => w.productId === "rx9060xt").target, v1: !!localStorage.getItem("bourse-hardware-v1"), backup: Object.keys(localStorage).some(k => k.startsWith("bourse-hardware-v1-backup-")), done: s.budget.plan.find(i => i.id === "case").done, first: s.budget.plan[0].id };`);
    check(name, "v1 migration keeps prices, target, budget, plan", mig.net === 2300 && mig.n === 3 && mig.target === 500 && mig.done && mig.first === "gpu", JSON.stringify(mig));
    check(name, "v1 data left in place + dated backup written", mig.v1 && mig.backup);

    // 2. every route renders, desktop and mobile, without horizontal overflow
    for (const [w, h, mobile] of [[1366, 900, false], [375, 812, true]]) {
      await b.viewport(w, h, mobile);
      const bad = [];
      for (const r of ROUTES) {
        await b.eval(`location.hash = "#/${r}"; return 1;`); await sleep(700);
        const st = await b.eval(`return { err: document.querySelector("#view .callout.bad b")?.textContent || null, sw: document.documentElement.scrollWidth, iw: innerWidth, len: document.querySelector("#view").textContent.length };`);
        if (st.err || st.sw > st.iw + 1 || st.len < 100) bad.push(`${r}: ${st.err || `scroll ${st.sw}/${st.iw}, text ${st.len}`}`);
      }
      check(name, `all ${ROUTES.length} routes render at ${w}px`, !bad.length, bad.join("; "));
      await b.eval(`location.hash = "#/overview"; return 1;`); await sleep(600);
      await b.screenshot(`${OUT}${name}-overview-${w}.png`);
    }
    await b.viewport(1366, 900, false);

    // 3. chart engine + live update when an observation is added through the UI
    await b.eval(`location.hash = "#/product/rx9060xt"; return 1;`); await sleep(2500);
    const eng = await b.eval(`return document.querySelector("[data-chart]")?.dataset.engine || null;`);
    check(name, "price chart uses Lightweight Charts", eng === "lightweight-charts", String(eng));
    const before = await b.eval(`return { n: window.__bh.store.state.observations.length, notes: window.__bh.store.state.notifications.length };`);
    await b.eval(`document.querySelector('[data-act="obs"]').click(); await new Promise(r => setTimeout(r, 400)); const d = document.querySelector("dialog[open]"); d.querySelector('[name="price"]').value = "480"; d.querySelector('[name="retailer"]').value = "ldlc"; d.querySelector('button[type="submit"]').click(); return 1;`);
    await sleep(1200);
    const after = await b.eval(`const s = window.__bh.store.state; return { n: s.observations.length, notes: s.notifications.slice(0, 5).map(n => n.title), engine: document.querySelector("[data-chart]")?.dataset.engine, last: document.querySelector("#view .ph .num, #view .ph-price")?.textContent };`);
    check(name, "observation added from the dialog", after.n === before.n + 1, `${before.n} → ${after.n}`);
    check(name, "below-target alert fired once", after.notes.filter(t => /sous 500/.test(t)).length === 1, after.notes.join(" | "));
    check(name, "chart kept (updated in place, not rebuilt)", after.engine === "lightweight-charts");
    await b.screenshot(`${OUT}${name}-product.png`);

    // 4. motion: OS preference honoured in auto; user override wins
    const motion = async () => b.eval(`await new Promise(r => setTimeout(r, 200)); const t = document.querySelector(".ticker-track"); return { eff: document.documentElement.dataset.motionEffective, anim: t ? getComputedStyle(t).animationName : "no-ticker" };`);
    await b.emulateMotion("reduce"); await b.goto(BASE + "#/overview", 1800);
    let m = await motion();
    check(name, "OS reduced motion → reduced, ticker static", m.eff === "reduced" && m.anim === "none", JSON.stringify(m));
    await b.emulateMotion("no-preference"); await b.goto(BASE + "#/overview", 1800);
    m = await motion();
    check(name, "no OS preference → full, ticker animated", m.eff === "full" && m.anim !== "none", JSON.stringify(m));
    await b.emulateMotion("reduce");
    await b.eval(`window.__bh.store.commit("settings", s => (s.settings.motion = "full")); return 1;`);
    m = await motion();
    check(name, "setting « Pleines » overrides OS reduced motion", m.eff === "full" && m.anim !== "none", JSON.stringify(m));
    await b.eval(`window.__bh.store.commit("settings", s => (s.settings.motion = "none")); return 1;`);
    m = await motion();
    check(name, "setting « Aucune » disables all animation", m.eff === "none" && m.anim === "none", JSON.stringify(m));
    await b.eval(`window.__bh.store.commit("settings", s => (s.settings.motion = "auto")); return 1;`);
    await b.emulateMotion("no-preference");

    // 5. sharing never includes the budget unless chosen; link round-trips
    const share = await b.eval(`const m = await import("./js/core/share.js"); const s = window.__bh.store.state; const a = await m.decodeSnapshot(await m.encodeSnapshot(m.buildSnapshot(s, { watchlist: true, configs: true }))); const c = await m.decodeSnapshot(await m.encodeSnapshot(m.buildSnapshot(s, { watchlist: true, budget: true }))); return { noBudget: !("budget" in a), wl: a.watchlist.length, withBudget: c.budget?.net };`);
    check(name, "snapshot excludes budget by default, includes it only when chosen", share.noBudget && share.wl > 0 && share.withBudget === 2300, JSON.stringify(share));

    // 6. import link opens the review dialog and adds without overwriting
    const code = await b.eval(`const m = await import("./js/core/share.js"); return m.encodeSnapshot({ format: "bourse-hardware", version: 2, kind: "snapshot", parts: ["history"], products: [{ id: "gpu-test", name: "GPU test import", category: "gpu" }], observations: [{ productId: "gpu-test", price: 333, currency: "EUR", ts: ${now - 3 * D}, status: "verified", method: "manual" }] });`);
    await b.eval(`location.hash = ${JSON.stringify("#/import?d=" + code)}; return 1;`);
    await sleep(1500);
    await b.eval(`document.querySelector("dialog[open] button[type=submit]").click(); return 1;`); await sleep(800);
    const imp = await b.eval(`const s = window.__bh.store.state; return { p: s.products.some(p => p.id === "gpu-test"), o: s.observations.filter(o => o.productId === "gpu-test").length, kept: s.budget.net };`);
    check(name, "shared link import adds product + observation, keeps budget", imp.p && imp.o === 1 && imp.kept === 2300, JSON.stringify(imp));

    // 7. persistence across reload, and timing
    await b.goto(BASE + "#/overview", 2000);
    const per = await b.eval(`const s = window.__bh.store.state; const nav = performance.getEntriesByType("navigation")[0]; return { o: s.observations.filter(o => o.productId === "gpu-test").length, dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) };`);
    check(name, "data persists after reload", per.o === 1);
    check(name, "page timing", true, `DOMContentLoaded ${per.dcl} ms, load ${per.load} ms (local server)`);

    const errs = b.errors.filter(e => !ignorable(e));
    check(name, "no console errors or uncaught exceptions", !errs.length, errs.slice(0, 5).join(" | "));
  } catch (e) {
    check(name, "run completed", false, e.message);
  } finally { await b.close(); }
}

for (const name of ["brave", "chrome", "edge"]) await run(name);
server?.close();
const failed = results.filter(r => r.ok === false);
console.log(`\n${results.filter(r => r.ok).length} passed, ${failed.length} failed, ${results.filter(r => r.ok === null).length} skipped`);
process.exit(failed.length ? 1 : 0);
