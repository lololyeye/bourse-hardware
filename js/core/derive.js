// Derived data, computed once per state revision (memoised) — keeps views cheap.
import { obsOf, stats, trend, freshness, confidence, signal, buyScore, marketIndex, marketSummary, changeOver, isVerified } from "./analytics.js";
import { schedule, daysUntil } from "./plan.js";
import { catById } from "./catalog.js";

let cache = { rev: -1, value: null, minute: 0 };

export function derive(state, rev, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  if (cache.rev === rev && cache.minute === minute) return cache.value;
  const s = state.settings, cur = s.currency;
  const obsBy = new Map();
  for (const o of state.observations) { if (!obsBy.has(o.productId)) obsBy.set(o.productId, []); obsBy.get(o.productId).push(o); }
  // A starting estimate only stands in until the first real price: after that it is kept in the history but ignored.
  for (const [pid, list] of obsBy) { list.sort((a, b) => a.ts - b.ts); if (list.some(isVerified)) obsBy.set(pid, list.filter(isVerified)); }
  const watchBy = new Map(state.watchlist.map(w => [w.productId, w]));
  const priceNow = pid => { const l = obsBy.get(pid); return l?.length ? l[l.length - 1].price : null; };
  const plan = schedule(state.budget, priceNow, now);
  const deadlineBy = new Map();
  for (const it of plan.items) if (it.status === "planned") for (const pid of it.productIds) if (!deadlineBy.has(pid)) deadlineBy.set(pid, daysUntil(it.date, now));
  const available = plan.pcStart + state.budget.pcMonthly;

  const byId = new Map();
  for (const product of state.products) {
    // compare only observations in the product's main currency (the user's currency)
    const all = (obsBy.get(product.id) || []);
    const obs = all.filter(o => o.currency === cur);
    const ver = obs.filter(isVerified);
    const st = stats(obs, now);
    const watch = watchBy.get(product.id) || null;
    const deadlineDays = watch?.deadline ? (watch.deadline - now) / 864e5 : deadlineBy.get(product.id) ?? null;
    const ctx = { now, staleDays: s.staleDays, deadlineDays, currency: cur, available };
    const fresh = freshness(st.ageDays, s.staleDays);
    byId.set(product.id, {
      product, obs, ver, otherCurrency: all.length - obs.length, st, watch, fresh,
      conf: confidence(st, fresh), trend: trend(ver, now, 30), signal: signal(obs, watch, ctx),
      score: buyScore(obs, watch, ctx, s.weights), deadlineDays,
      c7: changeOver(obs, 7, now), c30: changeOver(obs, 30, now),
    });
  }
  const rows = [...byId.values()];
  const index = marketIndex(state.products, [...obsBy.values()].flat().filter(o => o.currency === cur), now);
  const summary = marketSummary(rows, c => catById(c).label, { staleDays: s.staleDays });
  const lastObservationAt = state.observations.reduce((m, o) => (o.method !== "seed" && o.ts > m ? o.ts : m), 0) || null;
  const value = { byId, rows, index, summary, plan, priceNow, lastObservationAt, now };
  cache = { rev, value, minute };
  return value;
}
