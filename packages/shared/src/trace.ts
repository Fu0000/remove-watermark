import { createHash } from "node:crypto";

export function buildStableTraceId(seed: string, prefix = "trc") {
  const normalized = seed.trim();
  const digest = createHash("sha1")
    .update(normalized.length > 0 ? normalized : "empty")
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}
