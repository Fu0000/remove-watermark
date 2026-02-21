import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient } from "@prisma/client";
import { dispatchPendingEvents, parseBoolean, parsePositiveInt, parseRetryScheduleMs } from "./dispatcher";
import {
  createWebhookMetricsState,
  parseRatio,
  recordDispatchMetrics,
  type WebhookMetricsAlertOptions
} from "./metrics";

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
  const metricsAlertOptions: WebhookMetricsAlertOptions = {
    windowMs: parsePositiveInt(readEnv("WEBHOOK_DISPATCHER_METRICS_WINDOW_SEC", "600"), 600) * 1000,
    minSamples: parsePositiveInt(readEnv("WEBHOOK_DISPATCHER_ALERT_MIN_SAMPLES", "20"), 20),
    minSuccessRate: parseRatio(readEnv("WEBHOOK_DISPATCHER_ALERT_MIN_SUCCESS_RATE", "0.95"), 0.95),
    maxRetryRate: parseRatio(readEnv("WEBHOOK_DISPATCHER_ALERT_MAX_RETRY_RATE", "0.3"), 0.3)
  };
  const metricsState = createWebhookMetricsState();

  logger.info(
    {
      env,
      runOnce,
      pollMs,
      batchSize,
      retryScheduleMs,
      defaultTimeoutMs,
      metricsAlertOptions
    },
    "service initialized"
  );

  if (runOnce) {
    const result = await dispatchPendingEvents(prisma, {
      batchSize,
      retryScheduleMs,
      defaultTimeoutMs
    });
    const metrics = recordDispatchMetrics(metricsState, metricsAlertOptions, result);
    logger.info(
      {
        ...result,
        metrics: metrics.snapshot
      },
      "webhook dispatch run-once finished"
    );
    if (metrics.successRateAlertTriggered) {
      logger.warn(
        {
          metric: "webhook_success_rate",
          value: metrics.snapshot.webhook_success_rate,
          threshold: metricsAlertOptions.minSuccessRate,
          attempts: metrics.snapshot.attempts,
          windowSec: Math.floor(metricsAlertOptions.windowMs / 1000)
        },
        "webhook success rate below threshold"
      );
    }
    if (metrics.retryRateAlertTriggered) {
      logger.warn(
        {
          metric: "webhook_retry_total",
          retryTotal: metrics.snapshot.webhook_retry_total,
          retryRate: metrics.snapshot.webhook_retry_rate,
          rateThreshold: metricsAlertOptions.maxRetryRate,
          attempts: metrics.snapshot.attempts,
          windowSec: Math.floor(metricsAlertOptions.windowMs / 1000)
        },
        "webhook retry rate above threshold"
      );
    }
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
      const metrics = recordDispatchMetrics(metricsState, metricsAlertOptions, result);
      if (result.scanned > 0 || result.deliveriesCreated > 0) {
        logger.info(
          {
            ...result,
            metrics: metrics.snapshot
          },
          "webhook dispatch batch finished"
        );
      }

      if (metrics.successRateAlertTriggered) {
        logger.warn(
          {
            metric: "webhook_success_rate",
            value: metrics.snapshot.webhook_success_rate,
            threshold: metricsAlertOptions.minSuccessRate,
            attempts: metrics.snapshot.attempts,
            windowSec: Math.floor(metricsAlertOptions.windowMs / 1000)
          },
          "webhook success rate below threshold"
        );
      }
      if (metrics.retryRateAlertTriggered) {
        logger.warn(
          {
            metric: "webhook_retry_total",
            retryTotal: metrics.snapshot.webhook_retry_total,
            retryRate: metrics.snapshot.webhook_retry_rate,
            rateThreshold: metricsAlertOptions.maxRetryRate,
            attempts: metrics.snapshot.attempts,
            windowSec: Math.floor(metricsAlertOptions.windowMs / 1000)
          },
          "webhook retry rate above threshold"
        );
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
