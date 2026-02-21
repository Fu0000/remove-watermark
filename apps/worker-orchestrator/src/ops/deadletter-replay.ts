import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient } from "@prisma/client";
import { Queue, type Job } from "bullmq";

interface OrchestratorJobData {
  taskId: string;
  reason: "outbox" | "followup";
  triggerEventId?: string;
}

interface DeadletterJobData {
  deadletterId: string;
  source: "task.progress" | "outbox.dispatch";
  reason: "NON_RETRYABLE" | "ATTEMPTS_EXHAUSTED" | "OUTBOX_ATTEMPTS_EXHAUSTED";
  taskId?: string;
  eventId?: string;
  eventType?: string;
  triggerEventId?: string;
  attemptsMade: number;
  maxRetries: number;
  errorName?: string;
  errorMessage: string;
  createdAt: string;
}

type DeadletterSource = DeadletterJobData["source"];

interface ReplayFilters {
  jobId?: string;
  taskId?: string;
  eventId?: string;
  source: DeadletterSource | "all";
  createdAfterMs?: number;
  createdBeforeMs?: number;
}

const DEFAULT_REPLAY_CONCURRENCY_CAP = 10;
const ELEVATED_REPLAY_CONCURRENCY_CAP = 20;
const DEFAULT_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD = 50;

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function parseSource(value: string, fallback: ReplayFilters["source"]): ReplayFilters["source"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "all") {
    return "all";
  }
  if (normalized === "task.progress" || normalized === "outbox.dispatch") {
    return normalized;
  }

  return fallback;
}

function parseDateMillis(value: string): number | undefined {
  const input = value.trim();
  if (!input) {
    return undefined;
  }

  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) {
    return undefined;
  }

  return ms;
}

function parseRedisConnection(redisUrl: string) {
  const target = new URL(redisUrl);
  const connection: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db?: number;
    maxRetriesPerRequest: null;
  } = {
    host: target.hostname,
    port: Number.parseInt(target.port || "6379", 10),
    maxRetriesPerRequest: null
  };

  if (target.username) {
    connection.username = decodeURIComponent(target.username);
  }
  if (target.password) {
    connection.password = decodeURIComponent(target.password);
  }
  if (target.pathname && target.pathname !== "/") {
    const db = Number.parseInt(target.pathname.slice(1), 10);
    if (Number.isFinite(db) && db >= 0) {
      connection.db = db;
    }
  }

  return connection;
}

function matchJob(
  job: Job<DeadletterJobData, void, "task.deadletter">,
  filters: ReplayFilters
) {
  const rawJobId = String(job.id);
  if (filters.jobId && rawJobId !== filters.jobId) {
    return false;
  }

  const data = job.data;
  if (filters.source !== "all" && data.source !== filters.source) {
    return false;
  }
  if (filters.taskId && data.taskId !== filters.taskId) {
    return false;
  }
  if (filters.eventId && data.eventId !== filters.eventId) {
    return false;
  }
  if (typeof filters.createdAfterMs === "number" || typeof filters.createdBeforeMs === "number") {
    const createdAtMs = parseDateMillis(data.createdAt ?? "");
    if (!createdAtMs) {
      return false;
    }
    if (typeof filters.createdAfterMs === "number" && createdAtMs < filters.createdAfterMs) {
      return false;
    }
    if (typeof filters.createdBeforeMs === "number" && createdAtMs > filters.createdBeforeMs) {
      return false;
    }
  }

  return true;
}

function chunkJobs<T>(input: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }

  return chunks;
}

type ReplayOutcome = "replayed" | "skipped" | "failed";

async function replayOneJob(input: {
  logger: ReturnType<typeof createLogger>;
  prisma: PrismaClient;
  queue: Queue<OrchestratorJobData, void, "task.progress">;
  dryRun: boolean;
  deleteAfterReplay: boolean;
  job: Job<DeadletterJobData, void, "task.deadletter">;
}): Promise<ReplayOutcome> {
  const { logger, prisma, queue, dryRun, deleteAfterReplay, job } = input;
  const data = job.data;

  try {
    if (data.source === "task.progress") {
      if (!data.taskId) {
        logger.warn({ jobId: job.id, data }, "skip task.progress deadletter: missing taskId");
        return "skipped";
      }

      if (!dryRun) {
        await queue.add(
          "task.progress",
          {
            taskId: data.taskId,
            reason: "followup",
            triggerEventId: data.triggerEventId
          },
          {
            jobId: `replay_${data.deadletterId}_${Date.now()}`,
            removeOnComplete: true,
            removeOnFail: 100
          }
        );
      }
    } else if (data.source === "outbox.dispatch") {
      if (!data.eventId) {
        logger.warn({ jobId: job.id, data }, "skip outbox.dispatch deadletter: missing eventId");
        return "skipped";
      }

      if (!dryRun) {
        const updated = await prisma.outboxEvent.updateMany({
          where: {
            eventId: data.eventId
          },
          data: {
            status: "PENDING",
            retryCount: 0
          }
        });
        if (updated.count !== 1) {
          throw new Error(`outbox event not found for replay: ${data.eventId}`);
        }
      }
    } else {
      logger.warn({ jobId: job.id, data }, "skip deadletter: unsupported source");
      return "skipped";
    }

    if (!dryRun && deleteAfterReplay) {
      await job.remove();
    }

    logger.info(
      {
        jobId: job.id,
        deadletterId: data.deadletterId,
        source: data.source,
        taskId: data.taskId,
        eventId: data.eventId,
        dryRun
      },
      "deadletter replayed"
    );
    return "replayed";
  } catch (error) {
    logger.error(
      {
        jobId: job.id,
        deadletterId: data.deadletterId,
        source: data.source,
        taskId: data.taskId,
        eventId: data.eventId,
        error
      },
      "failed to replay deadletter"
    );
    return "failed";
  }
}

async function main() {
  const logger = createLogger("deadletter-replay");
  const prisma = new PrismaClient();

  const queueName = readEnv("QUEUE_NAME", "task.standard");
  const deadletterQueueName = readEnv("QUEUE_DEADLETTER_NAME", `${queueName}.deadletter`);
  const redisUrl = readEnv("REDIS_URL", "redis://127.0.0.1:6379");
  const connection = parseRedisConnection(redisUrl);

  const maxScan = parsePositiveInt(readEnv("DLQ_REPLAY_MAX_SCAN", "200"), 200);
  const maxReplay = parsePositiveInt(readEnv("DLQ_REPLAY_MAX_COUNT", "20"), 20);
  const requestedReplayConcurrency = parsePositiveInt(readEnv("DLQ_REPLAY_CONCURRENCY", "1"), 1);
  const allowHighConcurrency = parseBoolean(readEnv("DLQ_ALLOW_HIGH_CONCURRENCY", "false"), false);
  const replayConcurrencyCap = allowHighConcurrency
    ? ELEVATED_REPLAY_CONCURRENCY_CAP
    : DEFAULT_REPLAY_CONCURRENCY_CAP;
  const replayConcurrency = Math.min(requestedReplayConcurrency, replayConcurrencyCap);
  const lookbackMinutes = parsePositiveInt(readEnv("DLQ_LOOKBACK_MINUTES", "0"), 0);
  const dryRun = parseBoolean(readEnv("DLQ_DRY_RUN", "true"), true);
  const deleteAfterReplay = parseBoolean(readEnv("DLQ_DELETE_AFTER_REPLAY", "false"), false);
  const highConcurrencyBulkRejectThreshold = parsePositiveInt(
    readEnv("DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD", String(DEFAULT_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD)),
    DEFAULT_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD
  );
  const allowHighConcurrencyBulkReplay = parseBoolean(
    readEnv("DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY", "false"),
    false
  );
  const source = parseSource(readEnv("DLQ_SOURCE", "all"), "all");

  const createdAfterFromEnv = parseDateMillis(readEnv("DLQ_CREATED_AFTER", ""));
  const createdBeforeFromEnv = parseDateMillis(readEnv("DLQ_CREATED_BEFORE", ""));
  const createdAfterFromLookback =
    lookbackMinutes > 0 ? Date.now() - lookbackMinutes * 60 * 1000 : undefined;

  const filters: ReplayFilters = {
    jobId: process.env.DLQ_JOB_ID,
    taskId: process.env.DLQ_TASK_ID,
    eventId: process.env.DLQ_EVENT_ID,
    source,
    createdAfterMs: createdAfterFromEnv ?? createdAfterFromLookback,
    createdBeforeMs: createdBeforeFromEnv
  };

  const queue = new Queue<OrchestratorJobData, void, "task.progress">(queueName, { connection });
  const deadletterQueue = new Queue<DeadletterJobData, void, "task.deadletter">(deadletterQueueName, {
    connection
  });

  const candidates = await deadletterQueue.getJobs(["wait", "delayed"], 0, maxScan - 1);
  const matched = candidates.filter((job) => matchJob(job, filters)).slice(0, maxReplay);

  logger.info(
    {
      queueName,
      deadletterQueueName,
      redisUrl,
      dryRun,
      deleteAfterReplay,
      maxScan,
      maxReplay,
      requestedReplayConcurrency,
      replayConcurrency,
      replayConcurrencyCap,
      allowHighConcurrency,
      highConcurrencyBulkRejectThreshold,
      allowHighConcurrencyBulkReplay,
      lookbackMinutes,
      matched: matched.length,
      filters: {
        ...filters,
        createdAfter: filters.createdAfterMs ? new Date(filters.createdAfterMs).toISOString() : undefined,
        createdBefore: filters.createdBeforeMs
          ? new Date(filters.createdBeforeMs).toISOString()
          : undefined
      }
    },
    "deadletter replay started"
  );

  if (requestedReplayConcurrency > replayConcurrencyCap) {
    logger.warn(
      {
        requestedReplayConcurrency,
        replayConcurrencyCap,
        allowHighConcurrency,
        replayConcurrency
      },
      "replay concurrency exceeds cap, clamped to safe limit"
    );
  }

  if (
    !dryRun &&
    allowHighConcurrency &&
    replayConcurrency > DEFAULT_REPLAY_CONCURRENCY_CAP &&
    matched.length >= highConcurrencyBulkRejectThreshold &&
    !allowHighConcurrencyBulkReplay
  ) {
    logger.error(
      {
        matched: matched.length,
        replayConcurrency,
        highConcurrencyBulkRejectThreshold,
        allowHighConcurrencyBulkReplay
      },
      "high-concurrency bulk replay blocked by guard"
    );
    throw new Error(
      "high-concurrency bulk replay is blocked; set DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY=true to confirm"
    );
  }

  let replayed = 0;
  let skipped = 0;
  let failed = 0;

  const chunks = chunkJobs(matched, replayConcurrency);
  for (const chunk of chunks) {
    const outcomes = await Promise.all(
      chunk.map((job) =>
        replayOneJob({
          logger,
          prisma,
          queue,
          dryRun,
          deleteAfterReplay,
          job
        })
      )
    );
    for (const outcome of outcomes) {
      if (outcome === "replayed") {
        replayed += 1;
      } else if (outcome === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
      }
    }
  }

  logger.info(
    {
      scanned: candidates.length,
      matched: matched.length,
      replayed,
      skipped,
      failed,
      dryRun
    },
    "deadletter replay finished"
  );

  await deadletterQueue.close();
  await queue.close();
  await prisma.$disconnect();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[deadletter-replay] failed:", error);
  process.exit(1);
});
