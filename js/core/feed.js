// Published price feed (data/prices.json, same origin). Pure: decides which records to add.
// Each record is added once. A record the user deleted is not added again (meta.feedSeen).
import { cleanObservation, checkObservation } from "./validate.js";

export function feedToAdd(feed, state, now = Date.now()) {
  if (!feed || feed.format !== "bourse-hardware" || feed.kind !== "feed" || !Array.isArray(feed.observations)) return { add: [], seen: [], rejected: 0 };
  const seen = new Set(state.meta?.feedSeen || []);
  const have = new Set(state.observations.map(o => o.id));
  const productIds = new Set(state.products.map(p => p.id));
  const add = [], newSeen = [];
  let rejected = 0;
  for (const raw of feed.observations) {
    const id = typeof raw?.id === "string" ? raw.id : null;
    if (!id || seen.has(id) || have.has(id)) continue;
    const o = cleanObservation({ ...raw, id }, { method: "feed", status: "unverified" });
    const { errors } = checkObservation(o, { productIds, now });
    if (errors.length) { rejected++; continue; } // e.g. product deleted by the user: skipped, retried next time
    add.push(o); newSeen.push(id);
  }
  return { add, seen: newSeen, rejected };
}
