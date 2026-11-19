import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanObservation, checkObservation, analyseObservations, parseCSV, toCSV } from "../js/core/validate.js";
import { runAlerts } from "../js/core/alerts.js";
import { loadState, fromV1, normalize, KEY_V1 } from "../js/core/migrate.js";

const DAY = 864e5, NOW = Date.now(); // normalize() validates against the real clock
const ids = new Set(["p"]);

test("validation: impossible prices, missing dates, unknown currency, unknown product", () => {
  const e = o => checkObservation(cleanObservation(o), { productIds: ids, now: NOW }).errors;
  assert.ok(e({ productId: "p", price: -3, ts: NOW }).length);
  assert.ok(e({ productId: "p", price: 90000, ts: NOW }).length);
  assert.ok(e({ productId: "p", price: 10 }).length);
  assert.ok(e({ productId: "p", price: 10, ts: NOW + 5 * DAY }).length);
  assert.ok(e({ productId: "p", price: 10, ts: NOW, currency: "XYZ" }).length);
  assert.ok(e({ productId: "zz", price: 10, ts: NOW }).length);
  assert.equal(e({ productId: "p", price: "449,90 €", ts: NOW }).length, 0);
});
test("validation: duplicates and suspicious jumps are warnings", () => {
  const existing = [{ id: "a", productId: "p", price: 400, ts: NOW - 30_000, currency: "EUR" }];
  const w = o => checkObservation(cleanObservation(o), { productIds: ids, existing, now: NOW }).warnings;
  assert.ok(w({ productId: "p", price: 400, ts: NOW }).some(x => x.includes("Doublon")));
  assert.ok(w({ productId: "p", price: 900, ts: NOW }).some(x => x.includes("suspecte")));
  assert.ok(w({ productId: "p", price: 410, ts: NOW, currency: "USD" }).some(x => x.includes("Devise")));
});
test("analyseObservations: detects duplicates inside the batch itself", () => {
  const r = analyseObservations([{ productId: "p", price: 10, ts: NOW }, { productId: "p", price: 10, ts: NOW }, { productId: "p", price: -1, ts: NOW }], { productIds: ids, now: NOW });
  assert.equal(r.valid.length, 1); assert.equal(r.warned.length, 1); assert.equal(r.invalid.length, 1);
});
test("sourceUrl only accepts http(s)", () => {
  assert.equal(cleanObservation({ sourceUrl: "javascript:alert(1)" }).sourceUrl, "");
  assert.equal(cleanObservation({ sourceUrl: "https://ldlc.com/x" }).sourceUrl, "https://ldlc.com/x");
});
test("CSV round trip with quotes, commas and newlines", () => {
  const rows = [{ a: 'x,"y"', b: "l1\nl2" }];
  assert.deepEqual(parseCSV(toCSV(rows, ["a", "b"])), rows);
});

const ctx = obs => () => ({ obs, watch: { target: 100 }, product: { name: "P" }, signal: null });
test("alerts: level alert fires once, re-arms when condition clears", () => {
  let a = { id: "1", productId: "p", type: "below", threshold: 100, enabled: true, armed: true };
  const low = [{ id: "o1", price: 90, ts: NOW }], high = [{ id: "o2", price: 120, ts: NOW }];
  let r = runAlerts([a], ctx(low), NOW); assert.equal(r.fired.length, 1); a = { ...a, ...r.patches.get("1") };
  r = runAlerts([a], ctx(low), NOW); assert.equal(r.fired.length, 0);
  r = runAlerts([a], ctx(high), NOW); a = { ...a, ...r.patches.get("1") }; assert.equal(a.armed, true);
  r = runAlerts([a], ctx(low), NOW); assert.equal(r.fired.length, 1);
});
test("alerts: event alert fires once per observation, disabled alerts never fire", () => {
  let a = { id: "1", productId: "p", type: "dropPct", threshold: 5, enabled: true, lastKey: null };
  const obs = [{ id: "o1", price: 100, ts: NOW - DAY }, { id: "o2", price: 90, ts: NOW }];
  let r = runAlerts([a], ctx(obs), NOW); assert.equal(r.fired.length, 1); a = { ...a, ...r.patches.get("1") };
  assert.equal(runAlerts([a], ctx(obs), NOW).fired.length, 0);
  assert.equal(runAlerts([{ ...a, enabled: false, lastKey: null }], ctx(obs), NOW).fired.length, 0);
});

const V1 = {
  prods: { rx9060xt: { target: 500, hist: [{ t: NOW - 10 * DAY, p: 650, src: "estimation" }, { t: NOW - DAY, p: 600, src: "relevé" }] }, ghost: { target: 1, hist: [] } },
  alerts: [{ id: 1, t: NOW, type: "drop", text: "📉 Baisse importante", read: false }],
  settings: { drop: 7, rise: 6 }, budget: { net: 2100, fixed: 800, life: 500, saved: 300, pc: 400 },
  plan: { gpuFirst: true, resale: true, prices: { cpu: 420 }, resaleVal: { gtx: 90, cpu: 70, ram: 30 }, done: { case: true } }, lastReleve: NOW - DAY,
};
test("migration v1 → v2 keeps observations, targets, budget, plan order, notifications", () => {
  const { state, report } = fromV1(V1);
  const rx = state.observations.filter(o => o.productId === "rx9060xt");
  assert.equal(rx.length, 2); assert.equal(rx[0].status, "estimate"); assert.equal(rx[1].status, "verified");
  assert.equal(state.watchlist.find(w => w.productId === "rx9060xt").target, 500);
  assert.equal(state.budget.net, 2100); assert.equal(state.budget.pcMonthly, 400); assert.equal(state.budget.saved, 300);
  assert.equal(state.budget.plan[0].id, "gpu");
  assert.equal(state.budget.plan.find(i => i.id === "cpu").fixedPrice, 420);
  assert.equal(state.budget.plan.find(i => i.id === "gpu").resale, 90);
  assert.equal(state.budget.plan.find(i => i.id === "case").done, true);
  assert.equal(state.notifications.length, 1); assert.equal(state.notifications[0].body, "Baisse importante");
  assert.ok(state.alerts.some(a => a.type === "dropPct" && a.threshold === 7));
  assert.equal(state.meta.migratedFrom, 1); assert.ok(report.dropped >= 1);
});
test("loadState: v1 is backed up (never deleted), corrupt v2 is preserved", () => {
  const r = loadState(null, JSON.stringify(V1), NOW);
  assert.ok(Object.keys(r.writes).some(k => k.startsWith("bourse-hardware-v1-backup-")));
  assert.ok(!(KEY_V1 in r.writes));
  const c = loadState("{not json", null, NOW);
  assert.ok(Object.keys(c.writes).some(k => k.startsWith("bourse-hardware-corrupt-")));
  assert.ok(c.warning);
});
test("normalize: drops malformed records but keeps good ones", () => {
  const { state, report } = normalize({ products: [{ id: "x", name: "X", category: "gpu" }], observations: [{ productId: "x", price: 10, ts: NOW, currency: "EUR" }, { productId: "x", price: "abc", ts: NOW }, null], watchlist: [{ productId: "nope" }] });
  assert.equal(state.observations.length, 1); assert.equal(state.watchlist.length, 0); assert.equal(report.dropped, 2);
});
