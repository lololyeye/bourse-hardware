import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedToAdd } from "../js/core/feed.js";
import { defaultState } from "../js/core/migrate.js";

const feed = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url), "utf8"));

test("published feed: every record is valid, sourced, dated and never an estimate", () => {
  const st = defaultState();
  const { add, rejected } = feedToAdd(feed, st, Date.parse("2026-11-20T00:00:00+01:00"));
  assert.equal(rejected, 0);
  assert.equal(add.length, feed.observations.length);
  for (const o of add) {
    assert.ok(o.sourceUrl.startsWith("https://"), o.id);
    assert.notEqual(o.status, "estimate");
    assert.equal(o.method, "feed");
    assert.ok(Number.isFinite(o.ts));
  }
  assert.equal(new Set(feed.observations.map(o => o.id)).size, feed.observations.length, "ids are unique");
});

test("feed records are added once, and not re-added after the user deletes them", () => {
  const st = defaultState(), now = Date.parse("2026-11-20T00:00:00+01:00");
  const first = feedToAdd(feed, st, now);
  st.observations.push(...first.add); st.meta.feedSeen = first.seen;
  assert.equal(feedToAdd(feed, st, now).add.length, 0);
  st.observations = st.observations.filter(o => !o.id.startsWith("feed-"));
  assert.equal(feedToAdd(feed, st, now).add.length, 0);
});

test("unknown product in the feed is skipped, other formats are ignored", () => {
  const st = defaultState();
  const r = feedToAdd({ format: "bourse-hardware", kind: "feed", observations: [{ id: "x1", productId: "nope", price: 10, ts: Date.now(), sourceUrl: "https://a.b" }] }, st);
  assert.equal(r.add.length, 0); assert.equal(r.rejected, 1);
  assert.equal(feedToAdd({ kind: "snapshot" }, st).add.length, 0);
});
