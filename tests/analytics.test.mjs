import { test } from "node:test";
import assert from "node:assert/strict";
import { stats, trend, changeOver, signal, marketIndex, buyScore, freshness, confidence, marketSummary, MIN_VERIFIED } from "../js/core/analytics.js";

const DAY = 864e5, NOW = Date.UTC(2026, 11, 1);
const ob = (price, daysAgo, status = "verified", productId = "p") => ({ id: `${productId}-${daysAgo}-${price}`, productId, price, ts: NOW - daysAgo * DAY, status, currency: "EUR" });

test("stats: min / max / avg / change / age", () => {
  const s = stats([ob(100, 10), ob(80, 5), ob(90, 1)], NOW);
  assert.equal(s.n, 3); assert.equal(s.min, 80); assert.equal(s.max, 100); assert.equal(s.avg, 90);
  assert.equal(s.cur, 90); assert.equal(s.prev, 80); assert.equal(s.changePrev, 12.5); assert.equal(Math.round(s.ageDays), 1);
});
test("stats: empty history", () => { const s = stats([], NOW); assert.equal(s.n, 0); assert.equal(s.cur, null); });
test("changeOver uses the price known at that date, null if nothing known", () => {
  const o = [ob(100, 20), ob(110, 3)];
  assert.equal(changeOver(o, 7, NOW), 10);
  assert.equal(changeOver(o, 30, NOW), null);
});
test("trend: rising series gives positive slope, needs ≥3 points over ≥1 day", () => {
  const t = trend([ob(100, 21), ob(105, 14), ob(110, 7), ob(115, 0)], NOW);
  assert.equal(t.dir, "rising"); assert.ok(t.slopePctWeek > 4 && t.slopePctWeek < 5); assert.ok(t.r2 > 0.99);
  assert.equal(trend([ob(100, 2), ob(101, 1)], NOW), null);
});
test("signal: fewer than MIN_VERIFIED verified → INSUFFICIENT even if under target", () => {
  const s = signal([ob(400, 3, "estimate"), ob(380, 1)], { target: 500 }, { now: NOW });
  assert.equal(s.code, "INSUFFICIENT"); assert.equal(s.targetHit, true);
  assert.ok(s.reasons.some(r => r.kind === "data"));
});
test("signal: at historical low → EXCELLENT", () => {
  assert.equal(signal([ob(500, 20), ob(480, 10), ob(450, 1)], { target: 400 }, { now: NOW }).code, "EXCELLENT");
});
test("signal: well under average → GOOD", () => {
  assert.equal(signal([ob(400, 30), ob(500, 20), ob(520, 10), ob(440, 1)], null, { now: NOW }).code, "GOOD");
});
test("signal: above target, rising, no deadline → WAIT; with deadline → URGENT", () => {
  const o = [ob(500, 21), ob(520, 14), ob(540, 7), ob(560, 0)];
  assert.equal(signal(o, { target: 450 }, { now: NOW }).code, "WAIT");
  assert.equal(signal(o, { target: 450 }, { now: NOW, deadlineDays: 10 }).code, "URGENT");
});
test("signal: estimates never count as verified", () => {
  const o = [ob(500, 20, "estimate"), ob(480, 10, "estimate"), ob(450, 1, "estimate")];
  assert.equal(signal(o, null, { now: NOW }).code, "INSUFFICIENT");
  assert.equal(MIN_VERIFIED, 3);
});
test("freshness / confidence thresholds", () => {
  assert.equal(freshness(1), "fresh"); assert.equal(freshness(10, 14), "aging"); assert.equal(freshness(20, 14), "stale"); assert.equal(freshness(null), "none");
  assert.equal(confidence({ n: 2, nVerified: 0 }, "fresh").level, "low");
  assert.equal(confidence({ n: 6, nVerified: 6 }, "fresh").level, "high");
});
test("marketIndex: base 100, chain-linked, honest null when no history", () => {
  const products = [{ id: "a" }, { id: "b" }];
  const obs = [ob(100, 40, "verified", "a"), ob(110, 1, "verified", "a"), ob(200, 40, "verified", "b"), ob(180, 1, "verified", "b")];
  const ix = marketIndex(products, obs, NOW);
  assert.equal(Math.round(ix.value * 10) / 10, 100); // (110 + 90) / 2
  assert.equal(ix.rising, 1); assert.equal(ix.falling, 1);
  assert.equal(ix.c1, null); // last observation is exactly 24 h old: nothing new inside the 1-day window
  const one = marketIndex([{ id: "a" }], [ob(100, 0, "estimate", "a")], NOW);
  assert.equal(one.value, 100); assert.equal(one.c7, null); assert.equal(one.direction, "unknown"); assert.equal(one.estimateShare, 1);
});
test("buyScore: weights change the ranking and stay within 0–100", () => {
  const o = [ob(500, 20), ob(480, 10), ob(450, 1)];
  const a = buyScore(o, { target: 400, priority: "high" }, { now: NOW }, { price: 5, low: 0, trend: 0, urgency: 0, budget: 0 });
  const b = buyScore(o, { target: 400, priority: "high" }, { now: NOW }, { price: 0, low: 5, trend: 0, urgency: 0, budget: 0 });
  assert.ok(a.total < b.total); assert.ok(a.total >= 0 && b.total <= 100);
});
test("marketSummary: says so when data is insufficient", () => {
  const rows = [{ product: { name: "X", category: "gpu" }, ver: [], st: { n: 1, cur: 1, ageDays: 1 }, trend: null, signal: { code: "INSUFFICIENT" }, watch: null }];
  const s = marketSummary(rows, c => c);
  assert.equal(s.length, 1); assert.equal(s[0].kind, "data");
});
