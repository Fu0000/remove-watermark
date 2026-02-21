import type { TaskStatus } from "@packages/contracts";
import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient, type Prisma } from "@prisma/client";

const appName = "worker-orchestrator";
const logger = createLogger(appName);
const prisma = new PrismaClient();

const PROGRESSIBLE_STATUS: TaskStatus[] = ["QUEUED", "PREPROCESSING", "DETECTING", "INPAINTING", "PACKAGING"];
const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

interface TransitionPlan {
  nextStatus: TaskStatus;
  progress: number;
  resultUrl?: string;
}

interface TickResult {
  scanned: number;
  advanced: number;
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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

async function processTask(taskId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { taskId }
    });
    if (!task) {
      return false;
    }

    const currentStatus = task.status as TaskStatus;
    if (TERMINAL_STATUS.has(currentStatus)) {
      return false;
    }

    const hasMask = await tx.taskMask.findUnique({
      where: { taskId },
      select: { taskId: true }
    });
    if (!hasMask) {
      return false;
    }

    const plan = planTransition(taskId, currentStatus);
    if (!plan) {
      return false;
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
      return false;
    }

    if (plan.nextStatus === "SUCCEEDED") {
      await handleSuccessSideEffects(tx, taskId, task.userId);
    }

    return true;
  });
}

async function runTick(maxTasks: number): Promise<TickResult> {
  const candidates = await prisma.task.findMany({
    where: {
      status: {
        in: PROGRESSIBLE_STATUS
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: maxTasks,
    select: {
      taskId: true
    }
  });

  let advanced = 0;
  for (const candidate of candidates) {
    if (await processTask(candidate.taskId)) {
      advanced += 1;
    }
  }

  return {
    scanned: candidates.length,
    advanced
  };
}

async function bootstrap() {
  const env = readEnv("NODE_ENV", "dev");
  const queueName = readEnv("QUEUE_NAME", appName);
  const pollMs = parsePositiveInt(readEnv("ORCHESTRATOR_POLL_MS", "500"), 500);
  const maxTasks = parsePositiveInt(readEnv("ORCHESTRATOR_BATCH_SIZE", "20"), 20);

  logger.info({ env, queueName, pollMs, maxTasks }, "service initialized");

  let running = true;

  const stop = async (signal: string) => {
    if (!running) {
      return;
    }
    running = false;
    logger.info({ signal }, "shutdown signal received");
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
      const result = await runTick(maxTasks);
      if (result.scanned > 0) {
        logger.info(result, "tick finished");
      }
    } catch (error) {
      logger.error({ error }, "tick failed");
    }

    await sleep(pollMs);
  }
}

bootstrap().catch((error) => {
  logger.error({ error }, "service startup failed");
  process.exit(1);
});
