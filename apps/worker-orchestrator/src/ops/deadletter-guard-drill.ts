import { spawnSync } from "node:child_process";
import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

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

function tailLines(input: string, lineCount = 30) {
  return input
    .trim()
    .split("\n")
    .slice(-lineCount)
    .join("\n");
}

function runReplayCommand(env: Record<string, string>) {
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env
  };
  const result = spawnSync(
    "pnpm",
    ["--filter", "@apps/worker-orchestrator", "ops:deadletter:replay"],
    {
      env: mergedEnv,
      encoding: "utf-8"
    }
  );

  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

async function main() {
  const logger = createLogger("deadletter-guard-drill");
  const prisma = new PrismaClient();

  const queueName = readEnv("QUEUE_NAME", "task.standard");
  const deadletterQueueName = readEnv("QUEUE_DEADLETTER_NAME", `${queueName}.deadletter`);
  const redisUrl = readEnv("REDIS_URL", "redis://127.0.0.1:6379");
  const databaseUrl = readEnv("DATABASE_URL", "");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for deadletter guard drill");
  }

  const connection = parseRedisConnection(redisUrl);
  const deadletterQueue = new Queue<DeadletterJobData, void, "task.deadletter">(deadletterQueueName, {
    connection
  });

  const now = Date.now();
  const eventId = `evt_guard_drill_${now}`;
  const taskId = `tsk_guard_drill_${now}`;
  const deadletterId = `dlq_guard_drill_${now}`;
  const deadletterJobId = `guard_drill_${now}`;

  logger.info(
    {
      queueName,
      deadletterQueueName,
      redisUrl,
      eventId,
      deadletterJobId
    },
    "deadletter guard drill started"
  );

  try {
    await prisma.outboxEvent.create({
      data: {
        eventId,
        eventType: "task.retried",
        aggregateType: "task",
        aggregateId: taskId,
        status: "DEAD",
        retryCount: 3,
        createdAt: new Date()
      }
    });

    await deadletterQueue.add(
      "task.deadletter",
      {
        deadletterId,
        source: "outbox.dispatch",
        reason: "OUTBOX_ATTEMPTS_EXHAUSTED",
        taskId,
        eventId,
        eventType: "task.retried",
        attemptsMade: 3,
        maxRetries: 2,
        errorMessage: "guard drill",
        createdAt: new Date().toISOString()
      },
      {
        jobId: deadletterJobId,
        removeOnComplete: false,
        removeOnFail: false
      }
    );

    const blocked = runReplayCommand({
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      DLQ_DRY_RUN: "false",
      DLQ_JOB_ID: deadletterJobId,
      DLQ_ALLOW_HIGH_CONCURRENCY: "true",
      DLQ_REPLAY_CONCURRENCY: "20",
      DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD: "1",
      DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY: "false"
    });
    if (blocked.status === 0) {
      throw new Error("guard drill failed: blocked replay unexpectedly succeeded");
    }

    const blockedOutput = `${blocked.stdout}\n${blocked.stderr}`;
    if (!blockedOutput.includes("high-concurrency bulk replay is blocked")) {
      throw new Error("guard drill failed: blocked replay output missing guard message");
    }

    const allowed = runReplayCommand({
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      DLQ_DRY_RUN: "false",
      DLQ_JOB_ID: deadletterJobId,
      DLQ_ALLOW_HIGH_CONCURRENCY: "true",
      DLQ_REPLAY_CONCURRENCY: "20",
      DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD: "1",
      DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY: "true",
      DLQ_DELETE_AFTER_REPLAY: "true"
    });
    if (allowed.status !== 0) {
      throw new Error(`guard drill failed: allowed replay exited with status ${allowed.status}`);
    }

    const outbox = await prisma.outboxEvent.findUnique({
      where: {
        eventId
      }
    });
    if (!outbox || outbox.status !== "PENDING" || outbox.retryCount !== 0) {
      throw new Error("guard drill failed: outbox event not reset to PENDING/retryCount=0");
    }

    const deadletterJob = await deadletterQueue.getJob(deadletterJobId);
    if (deadletterJob) {
      throw new Error("guard drill failed: deadletter job should be removed after allowed replay");
    }

    logger.info(
      {
        blockedStatus: blocked.status,
        allowedStatus: allowed.status,
        blockedOutputTail: tailLines(blockedOutput, 20),
        allowedOutputTail: tailLines(`${allowed.stdout}\n${allowed.stderr}`, 20)
      },
      "deadletter guard drill passed"
    );
  } finally {
    await prisma.outboxEvent.deleteMany({
      where: {
        eventId
      }
    });
    const existing = await deadletterQueue.getJob(deadletterJobId);
    if (existing) {
      await existing.remove();
    }
    await deadletterQueue.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[deadletter-guard-drill] failed:", error);
  process.exit(1);
});
