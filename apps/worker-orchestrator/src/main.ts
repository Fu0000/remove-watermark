import type { TaskStatus } from "@packages/contracts";
import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient, type Prisma } from "@prisma/client";
import { Queue, Worker } from "bullmq";

const appName = "worker-orchestrator";
const logger = createLogger(appName);
const prisma = new PrismaClient();

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);
const OUTBOX_TRIGGER_EVENTS = ["task.created", "task.retried"] as const;

interface OrchestratorJobData {
  taskId: string;
  reason: "outbox" | "followup";
  triggerEventId?: string;
}
type OrchestratorQueue = Queue<OrchestratorJobData, void, "task.progress">;

interface TransitionPlan {
  nextStatus: TaskStatus;
  progress: number;
  resultUrl?: string;
}

interface DispatchResult {
  scanned: number;
  published: number;
  failed: number;
}

type TaskStepResult =
  | { kind: "NOT_FOUND" }
  | { kind: "TERMINAL"; status: TaskStatus }
  | { kind: "WAIT_MASK"; status: TaskStatus }
  | { kind: "NO_PLAN"; status: TaskStatus }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "ADVANCED"; status: TaskStatus };

interface WorkerRuntimeOptions {
  stepDelayMs: number;
  waitMaskDelayMs: number;
  maxStepIterations: number;
  followupDelayMs: number;
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function planTransition(taskId: string, currentStatus: TaskStatus): TransitionPlan | undefined {
  switch (currentStatus) {
    case "QUEUED":
      return { nextStatus: "PREPROCESSING", progress: 15 };
    case "PREPROCESSING":
      return { nextStatus: "DETECTING", progress: 35 };
    case "DETECTING":
      return { nextStatus: "INPAINTING", progress: 60 };
    case "INPAINTING":
      return { nextStatus: "PACKAGING", progress: 85 };
    case "PACKAGING":
      return {
        nextStatus: "SUCCEEDED",
        progress: 100,
        resultUrl: `https://minio.local/result/${taskId}.png`
      };
    default:
      return undefined;
  }
}

async function handleSuccessSideEffects(tx: Prisma.TransactionClient, taskId: string, userId: string) {
  await tx.usageLedger.create({
    data: {
      ledgerId: buildId("led"),
      userId,
      taskId,
      status: "COMMITTED",
      source: "task_succeeded",
      consumeUnit: 1,
      consumeAt: new Date()
    }
  });

  await tx.outboxEvent.create({
    data: {
      eventId: buildId("evt"),
      eventType: "task.succeeded",
      aggregateType: "task",
      aggregateId: taskId,
      status: "PENDING",
      retryCount: 0,
      createdAt: new Date()
    }
  });
}

async function processTaskStep(taskId: string): Promise<TaskStepResult> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { taskId }
    });
    if (!task) {
      return { kind: "NOT_FOUND" };
    }

    const currentStatus = task.status as TaskStatus;
    if (TERMINAL_STATUS.has(currentStatus)) {
      return { kind: "TERMINAL", status: currentStatus };
    }

    const hasMask = await tx.taskMask.findUnique({
      where: { taskId },
      select: { taskId: true }
    });
    if (!hasMask) {
      return { kind: "WAIT_MASK", status: currentStatus };
    }

    const plan = planTransition(taskId, currentStatus);
    if (!plan) {
      return { kind: "NO_PLAN", status: currentStatus };
    }

    const updated = await tx.task.updateMany({
      where: {
        taskId,
        version: task.version,
        status: currentStatus
      },
      data: {
        status: plan.nextStatus,
        progress: plan.progress,
        resultUrl: plan.resultUrl,
        version: { increment: 1 },
        updatedAt: new Date()
      }
    });
    if (updated.count !== 1) {
      return { kind: "VERSION_CONFLICT" };
    }

    if (plan.nextStatus === "SUCCEEDED") {
      await handleSuccessSideEffects(tx, taskId, task.userId);
    }

    return { kind: "ADVANCED", status: plan.nextStatus };
  });
}

async function processQueueJob(
  queue: OrchestratorQueue,
  taskId: string,
  options: WorkerRuntimeOptions
) {
  for (let index = 0; index < options.maxStepIterations; index += 1) {
    const result = await processTaskStep(taskId);
    if (result.kind === "NOT_FOUND" || result.kind === "TERMINAL" || result.kind === "NO_PLAN") {
      return;
    }

    if (result.kind === "VERSION_CONFLICT") {
      await sleep(50);
      continue;
    }

    if (result.kind === "WAIT_MASK") {
      await sleep(options.waitMaskDelayMs);
      continue;
    }

    if (result.kind === "ADVANCED") {
      if (result.status === "SUCCEEDED") {
        return;
      }
      await sleep(options.stepDelayMs);
    }
  }

  await queue.add(
    "task.progress",
    {
      taskId,
      reason: "followup"
    },
    {
      delay: options.followupDelayMs,
      jobId: buildId("job"),
      removeOnComplete: true,
      removeOnFail: 100
    }
  );
}

async function dispatchOutboxEvents(queue: OrchestratorQueue, batchSize: number): Promise<DispatchResult> {
  const events = await prisma.outboxEvent.findMany({
    where: {
      status: "PENDING",
      eventType: { in: [...OUTBOX_TRIGGER_EVENTS] }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: batchSize,
    select: {
      eventId: true,
      eventType: true,
      aggregateId: true
    }
  });

  let published = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await queue.add(
        "task.progress",
        {
          taskId: event.aggregateId,
          reason: "outbox",
          triggerEventId: event.eventId
        },
        {
          jobId: event.eventId,
          removeOnComplete: true,
          removeOnFail: 100
        }
      );

      await prisma.outboxEvent.update({
        where: { eventId: event.eventId },
        data: {
          status: "PUBLISHED"
        }
      });
      published += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          taskId: event.aggregateId,
          error
        },
        "failed to publish outbox event"
      );

      await prisma.outboxEvent.update({
        where: { eventId: event.eventId },
        data: {
          retryCount: { increment: 1 }
        }
      });
    }
  }

  return {
    scanned: events.length,
    published,
    failed
  };
}

async function bootstrap() {
  const env = readEnv("NODE_ENV", "dev");
  const queueName = readEnv("QUEUE_NAME", "task.standard");
  const redisUrl = readEnv("REDIS_URL", "redis://127.0.0.1:6379");
  const outboxPollMs = parsePositiveInt(readEnv("ORCHESTRATOR_OUTBOX_POLL_MS", "300"), 300);
  const outboxBatchSize = parsePositiveInt(readEnv("ORCHESTRATOR_OUTBOX_BATCH_SIZE", "50"), 50);
  const runtimeOptions: WorkerRuntimeOptions = {
    stepDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_STEP_DELAY_MS", "200"), 200),
    waitMaskDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_WAIT_MASK_DELAY_MS", "500"), 500),
    maxStepIterations: parsePositiveInt(readEnv("ORCHESTRATOR_MAX_STEP_ITERATIONS", "20"), 20),
    followupDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_FOLLOWUP_DELAY_MS", "1000"), 1000)
  };
  const workerConcurrency = parsePositiveInt(readEnv("ORCHESTRATOR_WORKER_CONCURRENCY", "4"), 4);
  const redisConnection = parseRedisConnection(redisUrl);

  const queue: OrchestratorQueue = new Queue<OrchestratorJobData, void, "task.progress">(queueName, {
    connection: redisConnection
  });
  const worker = new Worker<OrchestratorJobData, void, "task.progress">(
    queueName,
    async (job) => {
      await processQueueJob(queue, job.data.taskId, runtimeOptions);
    },
    {
      connection: redisConnection,
      concurrency: workerConcurrency
    }
  );

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        taskId: job?.data.taskId,
        error
      },
      "worker job failed"
    );
  });

  logger.info(
    {
      env,
      queueName,
      redisUrl,
      outboxPollMs,
      outboxBatchSize,
      workerConcurrency,
      runtimeOptions
    },
    "service initialized"
  );

  let running = true;

  const stop = async (signal: string) => {
    if (!running) {
      return;
    }
    running = false;
    logger.info({ signal }, "shutdown signal received");
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
  };

  process.on("SIGINT", () => {
    void stop("SIGINT");
  });
  process.on("SIGTERM", () => {
    void stop("SIGTERM");
  });

  while (running) {
    try {
      const result = await dispatchOutboxEvents(queue, outboxBatchSize);
      if (result.scanned > 0 || result.failed > 0) {
        logger.info(result, "outbox dispatch finished");
      }
    } catch (error) {
      logger.error({ error }, "outbox dispatch failed");
    }

    await sleep(outboxPollMs);
  }
}

bootstrap().catch((error) => {
  logger.error({ error }, "service startup failed");
  process.exit(1);
});
