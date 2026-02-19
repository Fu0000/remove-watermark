import pino from "pino";

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || "info",
    base: {
      requestId: undefined,
      traceId: undefined,
      taskId: undefined,
      eventId: undefined
    }
  });
}
