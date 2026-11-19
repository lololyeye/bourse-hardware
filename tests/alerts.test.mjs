import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../js/core/alerts.js";

const o = (id, price, status = "verified", ts = Date.now()) => ({ id, price, status, ts, currency: "EUR" });

test("estimates never trigger price alerts", () => {
  const obs = [o("a", 700), o("b", 400, "estimate")];
  assert.equal(evaluate({ type: "below", threshold: 500 }, { obs }).active, false);
  assert.equal(evaluate({ type: "dropPct", threshold: 5 }, { obs }).active, false);
});

test("drop/rise compare with the previous real observation, skipping estimates", () => {
  const obs = [o("a", 600), o("e", 650, "estimate"), o("b", 560)];
  const r = evaluate({ type: "dropPct", threshold: 5 }, { obs, product: { name: "X" } });
  assert.equal(r.active, true); assert.match(r.body, /600.*560/); assert.equal(r.key, "b");
  assert.equal(evaluate({ type: "risePct", threshold: 5 }, { obs }).active, false);
});
