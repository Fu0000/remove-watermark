export function buildRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
