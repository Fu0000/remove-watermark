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
  filters: { jobId?: string; taskId?: string; eventId?: string }
) {
  const rawJobId = String(job.id);
  if (filters.jobId && rawJobId !== filters.jobId) {
    return false;
  }

  const data = job.data;
  if (filters.taskId && data.taskId !== filters.taskId) {
    return false;
  }
  if (filters.eventId && data.eventId !== filters.eventId) {
    return false;
  }

  return true;
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
  const dryRun = parseBoolean(readEnv("DLQ_DRY_RUN", "true"), true);
  const deleteAfterReplay = parseBoolean(readEnv("DLQ_DELETE_AFTER_REPLAY", "false"), false);

  const filters = {
    jobId: process.env.DLQ_JOB_ID,
    taskId: process.env.DLQ_TASK_ID,
    eventId: process.env.DLQ_EVENT_ID
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
      matched: matched.length,
      filters
    },
    "deadletter replay started"
  );

  let replayed = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of matched) {
    const data = job.data;
    try {
      if (data.source === "task.progress") {
        if (!data.taskId) {
          skipped += 1;
          logger.warn({ jobId: job.id, data }, "skip task.progress deadletter: missing taskId");
          continue;
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
          skipped += 1;
          logger.warn({ jobId: job.id, data }, "skip outbox.dispatch deadletter: missing eventId");
          continue;
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
        skipped += 1;
        logger.warn({ jobId: job.id, data }, "skip deadletter: unsupported source");
        continue;
      }

      if (!dryRun && deleteAfterReplay) {
        await job.remove();
      }

      replayed += 1;
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
    } catch (error) {
      failed += 1;
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
