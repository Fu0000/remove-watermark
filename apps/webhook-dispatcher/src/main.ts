import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient } from "@prisma/client";
import { dispatchPendingEvents, parseBoolean, parsePositiveInt, parseRetryScheduleMs } from "./dispatcher";

const appName = "webhook-dispatcher";
const logger = createLogger(appName);
const prisma = new PrismaClient();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap() {
  const env = readEnv("NODE_ENV", "dev");
  const runOnce = parseBoolean(readEnv("WEBHOOK_DISPATCHER_RUN_ONCE", "false"), false);
  const pollMs = parsePositiveInt(readEnv("WEBHOOK_DISPATCHER_POLL_MS", "1000"), 1000);
  const batchSize = parsePositiveInt(readEnv("WEBHOOK_DISPATCHER_BATCH_SIZE", "50"), 50);
  const retryScheduleMs = parseRetryScheduleMs(
    readEnv("WEBHOOK_DISPATCHER_RETRY_SCHEDULE_MS", "60000,120000,300000,900000,1800000,3600000")
  );
  const defaultTimeoutMs = parsePositiveInt(readEnv("WEBHOOK_DISPATCHER_DEFAULT_TIMEOUT_MS", "5000"), 5000);

  logger.info(
    {
      env,
      runOnce,
      pollMs,
      batchSize,
      retryScheduleMs,
      defaultTimeoutMs
    },
    "service initialized"
  );

  if (runOnce) {
    const result = await dispatchPendingEvents(prisma, {
      batchSize,
      retryScheduleMs,
      defaultTimeoutMs
    });
    logger.info(result, "webhook dispatch run-once finished");
    await prisma.$disconnect();
    return;
  }

  while (true) {
    try {
      const result = await dispatchPendingEvents(prisma, {
        batchSize,
        retryScheduleMs,
        defaultTimeoutMs
      });
      if (result.scanned > 0 || result.deliveriesCreated > 0) {
        logger.info(result, "webhook dispatch batch finished");
      }
    } catch (error) {
      logger.error({ error }, "webhook dispatch batch failed");
    }

    await sleep(pollMs);
  }
}

bootstrap().catch((error) => {
  logger.error({ error }, "service startup failed");
  prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
