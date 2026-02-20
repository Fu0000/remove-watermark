export function buildIdempotencyKey() {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
