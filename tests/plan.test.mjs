import test from "node:test";
import assert from "node:assert/strict";
import { schedule, safetyTarget, configTotals, compatibility, itemCost } from "../js/core/plan.js";

const NOW = new Date(2026, 10, 19).getTime();
const budget = (o = {}) => ({ net: 2200, fixed: 900, life: 600, saved: 0, pcMonthly: 450, safetyMonthly: 100, countResale: true, plan: [], ...o });

test("itemCost: fixed price wins, unknown prices are reported not guessed", () => {
  const price = id => ({ a: 100 }[id] ?? null);
  assert.deepEqual(itemCost({ fixedPrice: 30, extra: 5, productIds: ["a"] }, price), { cost: 35, known: true, missing: [] });
  const r = itemCost({ fixedPrice: null, extra: 0, productIds: ["a", "b"] }, price);
  assert.equal(r.cost, 100); assert.equal(r.known, false); assert.deepEqual(r.missing, ["b"]);
});

test("schedule: places each purchase at the first affordable month, in order, with resale", () => {
  const b = budget({ plan: [
    { id: "gpu", productIds: [], fixedPrice: 600, extra: 0, resale: 80, done: false },
    { id: "cpu", productIds: [], fixedPrice: 400, extra: 0, resale: 0, done: false },
  ] });
  const s = schedule(b, () => null, NOW);
  // 450/month: 600 reachable at month index 1 (900), then 900-600+80 = 380 → 400 needs month 2 (830)
  assert.equal(s.items[0].month, 1);
  assert.equal(s.items[1].month, 2);
  assert.equal(s.items[1].left, 450 * 3 + 80 - 600 - 400);
  assert.equal(s.total, 1000); assert.equal(s.resale, 80); assert.equal(s.reachable, true);
  assert.equal(s.items[0].date.getMonth(), 0); // month 0 = December 2026 → index 1 = January 2027
});

test("schedule: savings above the safety cushion fund the PC, done items are skipped, order changes the result", () => {
  assert.equal(safetyTarget(budget()), 1500);
  const items = [{ id: "a", productIds: [], fixedPrice: 500, extra: 0, done: false }, { id: "b", productIds: [], fixedPrice: 100, extra: 0, done: true }];
  const s = schedule(budget({ saved: 2000, plan: items }), () => null, NOW);
  assert.equal(s.pcStart, 500);
  assert.equal(s.items[0].month, 0);
  assert.equal(s.items[1].status, "done");
  const big = [{ id: "x", productIds: [], fixedPrice: 900, extra: 0, done: false }, { id: "y", productIds: [], fixedPrice: 100, extra: 0, done: false }];
  const s1 = schedule(budget({ plan: big }), () => null, NOW), s2 = schedule(budget({ plan: [...big].reverse() }), () => null, NOW);
  assert.equal(s1.items.find(i => i.id === "y").month, 2);
  assert.equal(s2.items.find(i => i.id === "y").month, 0);
});

test("schedule: unreachable within horizon is flagged, never given a fake date", () => {
  const s = schedule(budget({ pcMonthly: 0, plan: [{ id: "a", productIds: [], fixedPrice: 500, extra: 0, done: false }] }), () => null, NOW);
  assert.equal(s.items[0].status, "unreachable"); assert.equal(s.items[0].date, null); assert.equal(s.reachable, false);
});

test("compatibility: only checks backed by specs; missing data is 'unknown', never 'ok'", () => {
  const P = { cpu: { specs: { socket: "AM4", memType: "DDR4", tdp: 105 } }, mb: { specs: { socket: "AM5", memType: "DDR5" } }, ram: { specs: { memType: "DDR4" } }, gpu: { specs: { tdp: 160 } }, psu: { specs: { watts: 550 } }, cool: { specs: {} } };
  const cfg = { parts: { cpu: "cpu", motherboard: "mb", ram: "ram", gpu: "gpu", psu: "psu", cooling: "cool" }, owned: {} };
  const out = compatibility(cfg, id => P[id]);
  assert.equal(out.find(c => /Socket processeur/.test(c.text)).level, "error");
  assert.equal(out.find(c => /Mémoire/.test(c.text)).level, "error");
  assert.equal(out.find(c => /refroidissement/.test(c.text)).level, "unknown");
  assert.equal(out.find(c => /Alimentation/.test(c.text)).level, "ok"); // 550 W / (105 + 160 + 75 = 340 W) = 1.62
  P.psu.specs.watts = 450; // 1.32 → margin too thin
  assert.equal(compatibility(cfg, id => P[id]).find(c => /Alimentation/.test(c.text)).level, "warn");
  delete P.gpu.specs.tdp;
  assert.equal(compatibility(cfg, id => P[id]).find(c => /Alimentation|Puissance/.test(c.text)).level, "unknown");
});

test("configTotals: owned parts excluded, missing prices listed", () => {
  const d = id => ({ a: { st: { cur: 500, first: { price: 550 } }, watch: { target: 450 } }, b: { st: { cur: null } } }[id]);
  const t = configTotals({ budget: 1000, parts: { cpu: "a", gpu: "b", motherboard: "a" }, owned: { motherboard: true } }, d);
  assert.equal(t.current, 500); assert.equal(t.target, 450); assert.deepEqual(t.missing, ["Carte graphique"]); assert.equal(t.remaining, 500);
});
