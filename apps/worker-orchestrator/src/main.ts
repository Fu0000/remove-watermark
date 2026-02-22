import type { TaskMediaType, TaskStatus } from "@packages/contracts";
import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient, type Prisma } from "@prisma/client";
import { JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import { pathToFileURL } from "node:url";

const appName = "worker-orchestrator";
const logger = createLogger(appName);
export const prisma = new PrismaClient();

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);
const OUTBOX_TRIGGER_EVENTS = ["task.created", "task.retried", "task.masked"] as const;

interface OrchestratorJobData {
  taskId: string;
  reason: "outbox" | "followup";
  triggerEventId?: string;
}
type OrchestratorQueue = Queue<OrchestratorJobData, void, "task.progress">;

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
type DeadletterQueue = Queue<DeadletterJobData, void, "task.deadletter">;

export interface RetryPolicyOptions {
  maxRetries: number;
  baseDelayMs: number;
  jitterRatio: number;
}

interface DeadletterAlertOptions {
  windowMs: number;
  rateThreshold: number;
  minSamples: number;
}

interface DeadletterAlertState {
  windowStartedAtMs: number;
  processed: number;
  deadlettered: number;
  alerted: boolean;
}

interface DispatchOptions {
  retryPolicy: RetryPolicyOptions;
  outboxMaxRetries: number;
  deadletterQueue: DeadletterQueue;
  deadletterAlertOptions: DeadletterAlertOptions;
  deadletterAlertState: DeadletterAlertState;
}

interface DispatchResult {
  scanned: number;
  published: number;
  failed: number;
  deadlettered: number;
}

type TaskStepResult =
  | { kind: "NOT_FOUND" }
  | { kind: "TERMINAL"; status: TaskStatus }
  | { kind: "WAIT_MASK"; status: TaskStatus }
  | { kind: "NO_PLAN"; status: TaskStatus }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "ADVANCED"; status: TaskStatus };

export interface WorkerRuntimeOptions {
  stepDelayMs: number;
  waitMaskDelayMs: number;
  maxStepIterations: number;
  followupDelayMs: number;
  inferenceGatewayUrl: string;
  inferenceSharedToken: string;
  resultExpireDays: number;
}

interface TaskArtifact {
  type: "PDF" | "ZIP" | "VIDEO" | "IMAGE";
  url: string;
  expireAt: string;
}

interface PackagingResult {
  resultUrl: string;
  artifacts: TaskArtifact[];
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseNonNegativeInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseRatio(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
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

function readErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === "object" && error && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }

  return undefined;
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "unknown error";
}

function isUnrecoverableError(error: unknown) {
  if (error instanceof UnrecoverableError) {
    return true;
  }
  return readErrorName(error) === "UnrecoverableError";
}

function jitterDelay(baseDelayMs: number, jitterRatio: number) {
  const randomOffset = (Math.random() * 2 - 1) * jitterRatio;
  const jittered = Math.round(baseDelayMs * (1 + randomOffset));
  return Math.max(100, jittered);
}

function buildJobOptions(
  retryPolicy: RetryPolicyOptions,
  input: {
    jobId: string;
    delayMs?: number;
    removeOnComplete?: JobsOptions["removeOnComplete"];
    removeOnFail?: JobsOptions["removeOnFail"];
  }
): JobsOptions {
  const options: JobsOptions = {
    jobId: input.jobId,
    attempts: retryPolicy.maxRetries + 1,
    backoff: {
      type: "exponential",
      delay: jitterDelay(retryPolicy.baseDelayMs, retryPolicy.jitterRatio)
    },
    removeOnComplete: input.removeOnComplete ?? true,
    removeOnFail: input.removeOnFail ?? 100
  };

  if (typeof input.delayMs === "number" && input.delayMs > 0) {
    options.delay = input.delayMs;
  }

  return options;
}

function ensureDeadletterWindowFresh(state: DeadletterAlertState, options: DeadletterAlertOptions) {
  const now = Date.now();
  if (now - state.windowStartedAtMs < options.windowMs) {
    return;
  }

  state.windowStartedAtMs = now;
  state.processed = 0;
  state.deadlettered = 0;
  state.alerted = false;
}

function recordProcessedMetric(
  state: DeadletterAlertState,
  options: DeadletterAlertOptions,
  count = 1
) {
  ensureDeadletterWindowFresh(state, options);
  state.processed += count;
}

function recordDeadletterMetric(
  state: DeadletterAlertState,
  options: DeadletterAlertOptions,
  context: { source: DeadletterJobData["source"]; reason: DeadletterJobData["reason"] }
) {
  ensureDeadletterWindowFresh(state, options);
  state.deadlettered += 1;

  if (state.alerted || state.processed < options.minSamples) {
    return;
  }

  const deadletterRate = state.deadlettered / state.processed;
  if (deadletterRate < options.rateThreshold) {
    return;
  }

  state.alerted = true;
  logger.warn(
    {
      source: context.source,
      reason: context.reason,
      windowSec: Math.floor(options.windowMs / 1000),
      processed: state.processed,
      deadlettered: state.deadlettered,
      deadletterRate,
      rateThreshold: options.rateThreshold
    },
    "deadletter rate threshold exceeded"
  );
}

async function publishDeadletter(
  deadletterQueue: DeadletterQueue,
  deadletter: DeadletterJobData,
  alertState: DeadletterAlertState,
  alertOptions: DeadletterAlertOptions
) {
  await deadletterQueue.add(
    "task.deadletter",
    deadletter,
    {
      jobId: deadletter.deadletterId,
      removeOnComplete: false,
      removeOnFail: false
    }
  );

  recordDeadletterMetric(alertState, alertOptions, {
    source: deadletter.source,
    reason: deadletter.reason
  });
}

function buildDefaultResultUrl(taskId: string, mediaType: TaskMediaType) {
  switch (mediaType) {
    case "VIDEO":
      return `https://minio.local/result/${taskId}.mp4`;
    case "PDF":
    case "PPT":
      return `https://minio.local/result/${taskId}.pdf`;
    default:
      return `https://minio.local/result/${taskId}.png`;
  }
}

function buildExpireAt(days: number) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export async function callInferenceGateway<T>(
  runtime: WorkerRuntimeOptions,
  path: string,
  payload: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${runtime.inferenceGatewayUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inference-token": runtime.inferenceSharedToken
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status >= 400 && response.status < 500) {
      throw new UnrecoverableError(`inference non-retryable ${response.status}: ${body || "unknown"}`);
    }
    throw new Error(`inference failed ${response.status}: ${body || "unknown"}`);
  }

  return (await response.json()) as T;
}

async function handleSuccessSideEffects(tx: Prisma.TransactionClient, taskId: string, userId: string) {
  await tx.usageLedger.createMany({
    data: [
      {
        ledgerId: buildId("led"),
        userId,
        taskId,
        status: "COMMITTED",
        source: "task_succeeded",
        consumeUnit: 1,
        consumeAt: new Date()
      }
    ],
    skipDuplicates: true
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

async function markTaskFailed(taskId: string, message: string, code = "50001") {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { taskId }
    });
    if (!task) {
      return;
    }

    const currentStatus = task.status as TaskStatus;
    if (TERMINAL_STATUS.has(currentStatus)) {
      return;
    }

    const updated = await tx.task.updateMany({
      where: {
        taskId,
        version: task.version
      },
      data: {
        status: "FAILED",
        errorCode: code,
        errorMessage: message.slice(0, 1024),
        version: { increment: 1 },
        updatedAt: new Date()
      }
    });
    if (updated.count !== 1) {
      return;
    }

    await tx.usageLedger.createMany({
      data: [
        {
          ledgerId: buildId("led"),
          userId: task.userId,
          taskId,
          status: "RELEASED",
          source: "task_failed",
          consumeUnit: 1,
          consumeAt: new Date()
        }
      ],
      skipDuplicates: true
    });

    await tx.outboxEvent.create({
      data: {
        eventId: buildId("evt"),
        eventType: "task.failed",
        aggregateType: "task",
        aggregateId: taskId,
        status: "PENDING",
        retryCount: 0,
        createdAt: new Date()
      }
    });
  });
}

async function hasDetectionInput(taskId: string, mediaType: TaskMediaType) {
  const region = await prisma.taskRegion.findUnique({
    where: { taskId },
    select: { taskId: true }
  });
  if (region) {
    return true;
  }

  if (mediaType === "IMAGE") {
    const mask = await prisma.taskMask.findUnique({
      where: { taskId },
      select: { taskId: true }
    });
    return Boolean(mask);
  }

  return false;
}

async function executePreprocessing(
  task: {
    taskId: string;
    assetId: string;
    mediaType: string;
  },
  runtime: WorkerRuntimeOptions
) {
  if (task.mediaType === "PPT") {
    await callInferenceGateway(runtime, "/internal/doc/ppt-to-pdf", {
      taskId: task.taskId,
      assetId: task.assetId
    });
  }

  if (task.mediaType === "PDF" || task.mediaType === "PPT") {
    await callInferenceGateway(runtime, "/internal/doc/render-pdf", {
      taskId: task.taskId,
      assetId: task.assetId,
      mediaType: task.mediaType
    });
  }
}

async function executeInpainting(
  task: {
    taskId: string;
    assetId: string;
    mediaType: string;
  },
  runtime: WorkerRuntimeOptions
) {
  const region = await prisma.taskRegion.findUnique({
    where: { taskId: task.taskId }
  });
  const mask = await prisma.taskMask.findUnique({
    where: { taskId: task.taskId }
  });

  const regionsPayload =
    (region?.regionsJson as Prisma.JsonValue | undefined) ||
    ({
      polygons: (mask?.polygons as Prisma.JsonValue | undefined) || [],
      brushStrokes: (mask?.brushStrokes as Prisma.JsonValue | undefined) || []
    } satisfies Record<string, unknown>);

  if (task.mediaType === "VIDEO") {
    return callInferenceGateway<{ outputUrl?: string }>(runtime, "/internal/inpaint/video", {
      taskId: task.taskId,
      assetId: task.assetId,
      regions: regionsPayload
    });
  }

  return callInferenceGateway<{ outputUrl?: string }>(runtime, "/internal/inpaint/image", {
    taskId: task.taskId,
    assetId: task.assetId,
    mediaType: task.mediaType,
    regions: regionsPayload
  });
}

async function executePackaging(
  task: {
    taskId: string;
    assetId: string;
    mediaType: string;
    resultJson: Prisma.JsonValue | null;
  },
  runtime: WorkerRuntimeOptions
): Promise<PackagingResult> {
  const staged = toRecord(task.resultJson)?.staging as Record<string, unknown> | undefined;
  const defaultUrl = buildDefaultResultUrl(task.taskId, task.mediaType as TaskMediaType);
  const expireAt = buildExpireAt(runtime.resultExpireDays);

  if (task.mediaType === "PDF" || task.mediaType === "PPT") {
    const packaged = await callInferenceGateway<{ resultUrl?: string; pdfUrl?: string; zipUrl?: string }>(
      runtime,
      "/internal/doc/package",
      {
        taskId: task.taskId,
        assetId: task.assetId,
        mediaType: task.mediaType,
        staged
      }
    );

    const pdfUrl = packaged.pdfUrl || packaged.resultUrl || defaultUrl;
    const zipUrl = packaged.zipUrl || `https://minio.local/result/${task.taskId}.zip`;
    return {
      resultUrl: pdfUrl,
      artifacts: [
        { type: "PDF", url: pdfUrl, expireAt },
        { type: "ZIP", url: zipUrl, expireAt }
      ]
    };
  }

  const stagedOutput = typeof staged?.outputUrl === "string" ? staged.outputUrl : defaultUrl;
  return {
    resultUrl: stagedOutput,
    artifacts: [
      {
        type: task.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
        url: stagedOutput,
        expireAt
      }
    ]
  };
}

async function advanceTask(input: {
  taskId: string;
  userId: string;
  expectedVersion: number;
  expectedStatus: TaskStatus;
  nextStatus: TaskStatus;
  progress: number;
  resultUrl?: string;
  resultJson?: Prisma.InputJsonValue;
}): Promise<TaskStepResult> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.updateMany({
      where: {
        taskId: input.taskId,
        version: input.expectedVersion,
        status: input.expectedStatus
      },
      data: {
        status: input.nextStatus,
        progress: input.progress,
        resultUrl: input.resultUrl,
        resultJson: input.resultJson,
        version: { increment: 1 },
        updatedAt: new Date()
      }
    });
    if (updated.count !== 1) {
      return { kind: "VERSION_CONFLICT" };
    }

    if (input.nextStatus === "SUCCEEDED") {
      await handleSuccessSideEffects(tx, input.taskId, input.userId);
    }

    return { kind: "ADVANCED", status: input.nextStatus };
  });
}

export async function processTaskStep(
  taskId: string,
  runtime: WorkerRuntimeOptions
): Promise<TaskStepResult> {
  const task = await prisma.task.findUnique({
    where: { taskId }
  });
  if (!task) {
    return { kind: "NOT_FOUND" };
  }

  const currentStatus = task.status as TaskStatus;
  if (TERMINAL_STATUS.has(currentStatus)) {
    return { kind: "TERMINAL", status: currentStatus };
  }

  switch (currentStatus) {
    case "QUEUED":
      await executePreprocessing(task, runtime);
      return advanceTask({
        taskId,
        userId: task.userId,
        expectedVersion: task.version,
        expectedStatus: currentStatus,
        nextStatus: "PREPROCESSING",
        progress: 15
      });
    case "PREPROCESSING":
      return advanceTask({
        taskId,
        userId: task.userId,
        expectedVersion: task.version,
        expectedStatus: currentStatus,
        nextStatus: "DETECTING",
        progress: 35
      });
    case "DETECTING": {
      const ready = await hasDetectionInput(taskId, task.mediaType as TaskMediaType);
      if (!ready) {
        return { kind: "WAIT_MASK", status: currentStatus };
      }
      return advanceTask({
        taskId,
        userId: task.userId,
        expectedVersion: task.version,
        expectedStatus: currentStatus,
        nextStatus: "INPAINTING",
        progress: 60
      });
    }
    case "INPAINTING": {
      const inpaint = await executeInpainting(task, runtime);
      const outputUrl = inpaint.outputUrl || buildDefaultResultUrl(taskId, task.mediaType as TaskMediaType);
      return advanceTask({
        taskId,
        userId: task.userId,
        expectedVersion: task.version,
        expectedStatus: currentStatus,
        nextStatus: "PACKAGING",
        progress: 85,
        resultJson: {
          staging: {
            outputUrl
          }
        } as Prisma.InputJsonValue
      });
    }
    case "PACKAGING": {
      const packaged = await executePackaging(task, runtime);
      return advanceTask({
        taskId,
        userId: task.userId,
        expectedVersion: task.version,
        expectedStatus: currentStatus,
        nextStatus: "SUCCEEDED",
        progress: 100,
        resultUrl: packaged.resultUrl,
        resultJson: {
          artifacts: packaged.artifacts
        } as unknown as Prisma.InputJsonValue
      });
    }
    default:
      return { kind: "NO_PLAN", status: currentStatus };
  }
}

export async function processQueueJob(
  queue: OrchestratorQueue,
  taskId: string,
  options: WorkerRuntimeOptions,
  retryPolicy: RetryPolicyOptions
) {
  const followupJobId = `job_followup_${taskId}`;

  for (let index = 0; index < options.maxStepIterations; index += 1) {
    let result: TaskStepResult;
    try {
      result = await processTaskStep(taskId, options);
    } catch (error) {
      if (isUnrecoverableError(error)) {
        await markTaskFailed(taskId, readErrorMessage(error), "50021");
        return;
      }
      throw error;
    }
    if (result.kind === "NOT_FOUND") {
      throw new UnrecoverableError(`task ${taskId} not found`);
    }

    if (result.kind === "NO_PLAN") {
      throw new UnrecoverableError(`task ${taskId} has no transition plan from ${result.status}`);
    }

    if (result.kind === "TERMINAL") {
      return;
    }

    if (result.kind === "VERSION_CONFLICT") {
      await sleep(50);
      continue;
    }

    if (result.kind === "WAIT_MASK") {
      await queue.add(
        "task.progress",
        {
          taskId,
          reason: "followup"
        },
        buildJobOptions(retryPolicy, {
          delayMs: options.waitMaskDelayMs,
          jobId: followupJobId
        })
      );
      return;
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
    buildJobOptions(retryPolicy, {
      delayMs: options.followupDelayMs,
      jobId: followupJobId
    })
  );
}

async function dispatchOutboxEvents(
  queue: OrchestratorQueue,
  batchSize: number,
  options: DispatchOptions
): Promise<DispatchResult> {
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
      aggregateId: true,
      retryCount: true
    }
  });

  let published = 0;
  let failed = 0;
  let deadlettered = 0;

  for (const event of events) {
    try {
      await queue.add(
        "task.progress",
        {
          taskId: event.aggregateId,
          reason: "outbox",
          triggerEventId: event.eventId
        },
        buildJobOptions(options.retryPolicy, {
          jobId: event.eventId
        })
      );

      await prisma.outboxEvent.update({
        where: { eventId: event.eventId },
        data: {
          status: "PUBLISHED"
        }
      });
      recordProcessedMetric(options.deadletterAlertState, options.deadletterAlertOptions);
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

      const nextRetryCount = event.retryCount + 1;
      if (nextRetryCount > options.outboxMaxRetries) {
        await prisma.outboxEvent.update({
          where: { eventId: event.eventId },
          data: {
            retryCount: nextRetryCount,
            status: "DEAD"
          }
        });

        recordProcessedMetric(options.deadletterAlertState, options.deadletterAlertOptions);
        await publishDeadletter(
          options.deadletterQueue,
          {
            deadletterId: `dlq_evt_${event.eventId}`,
            source: "outbox.dispatch",
            reason: "OUTBOX_ATTEMPTS_EXHAUSTED",
            taskId: event.aggregateId,
            eventId: event.eventId,
            eventType: event.eventType,
            attemptsMade: nextRetryCount,
            maxRetries: options.outboxMaxRetries,
            errorName: readErrorName(error),
            errorMessage: readErrorMessage(error),
            createdAt: new Date().toISOString()
          },
          options.deadletterAlertState,
          options.deadletterAlertOptions
        );
        deadlettered += 1;
      } else {
        await prisma.outboxEvent.update({
          where: { eventId: event.eventId },
          data: {
            retryCount: nextRetryCount
          }
        });
      }
    }
  }

  return {
    scanned: events.length,
    published,
    failed,
    deadlettered
  };
}

async function bootstrap() {
  const env = readEnv("NODE_ENV", "dev");
  const queueName = readEnv("QUEUE_NAME", "task.standard");
  const deadletterQueueName = readEnv("QUEUE_DEADLETTER_NAME", `${queueName}.deadletter`);
  const redisUrl = readEnv("REDIS_URL", "redis://127.0.0.1:6379");
  const outboxPollMs = parsePositiveInt(readEnv("ORCHESTRATOR_OUTBOX_POLL_MS", "300"), 300);
  const outboxBatchSize = parsePositiveInt(readEnv("ORCHESTRATOR_OUTBOX_BATCH_SIZE", "50"), 50);
  const retryPolicy: RetryPolicyOptions = {
    maxRetries: parseNonNegativeInt(readEnv("ORCHESTRATOR_MAX_RETRIES", "2"), 2),
    baseDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_RETRY_BASE_DELAY_MS", "5000"), 5000),
    jitterRatio: parseRatio(readEnv("ORCHESTRATOR_RETRY_JITTER_RATIO", "0.2"), 0.2)
  };
  const outboxMaxRetries = parseNonNegativeInt(readEnv("ORCHESTRATOR_OUTBOX_MAX_RETRIES", "2"), 2);
  const deadletterAlertOptions: DeadletterAlertOptions = {
    windowMs:
      parsePositiveInt(readEnv("ORCHESTRATOR_DEADLETTER_ALERT_WINDOW_SEC", "600"), 600) * 1000,
    rateThreshold: parseRatio(readEnv("ORCHESTRATOR_DEADLETTER_ALERT_RATE", "0.01"), 0.01),
    minSamples: parsePositiveInt(readEnv("ORCHESTRATOR_DEADLETTER_ALERT_MIN_SAMPLES", "20"), 20)
  };
  const deadletterAlertState: DeadletterAlertState = {
    windowStartedAtMs: Date.now(),
    processed: 0,
    deadlettered: 0,
    alerted: false
  };
  const runtimeOptions: WorkerRuntimeOptions = {
    stepDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_STEP_DELAY_MS", "200"), 200),
    waitMaskDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_WAIT_MASK_DELAY_MS", "500"), 500),
    maxStepIterations: parsePositiveInt(readEnv("ORCHESTRATOR_MAX_STEP_ITERATIONS", "20"), 20),
    followupDelayMs: parsePositiveInt(readEnv("ORCHESTRATOR_FOLLOWUP_DELAY_MS", "1000"), 1000),
    inferenceGatewayUrl: readEnv("INFERENCE_GATEWAY_URL", "http://127.0.0.1:8088"),
    inferenceSharedToken: readEnv("INFERENCE_SHARED_TOKEN", "inference-local-token"),
    resultExpireDays: parsePositiveInt(readEnv("RESULT_EXPIRE_DAYS", "30"), 30)
  };
  const workerConcurrency = parsePositiveInt(readEnv("ORCHESTRATOR_WORKER_CONCURRENCY", "4"), 4);
  const redisConnection = parseRedisConnection(redisUrl);

  const queue: OrchestratorQueue = new Queue<OrchestratorJobData, void, "task.progress">(queueName, {
    connection: redisConnection
  });
  const deadletterQueue: DeadletterQueue = new Queue<DeadletterJobData, void, "task.deadletter">(
    deadletterQueueName,
    {
      connection: redisConnection
    }
  );
  const worker = new Worker<OrchestratorJobData, void, "task.progress">(
    queueName,
    async (job) => {
      await processQueueJob(queue, job.data.taskId, runtimeOptions, retryPolicy);
    },
    {
      connection: redisConnection,
      concurrency: workerConcurrency
    }
  );

  worker.on("completed", () => {
    recordProcessedMetric(deadletterAlertState, deadletterAlertOptions);
  });

  worker.on("failed", (job, error) => {
    void (async () => {
      const attempts = typeof job?.opts.attempts === "number" ? job.opts.attempts : 1;
      const attemptsMade = typeof job?.attemptsMade === "number" ? job.attemptsMade : 0;
      const unrecoverable = isUnrecoverableError(error);
      const exhausted = attemptsMade >= attempts;
      const finalFailure = unrecoverable || exhausted;

      logger.error(
        {
          jobId: job?.id,
          taskId: job?.data.taskId,
          attemptsMade,
          attempts,
          unrecoverable,
          exhausted,
          error
        },
        finalFailure ? "worker job failed and moved to deadletter" : "worker job failed and will retry"
      );

      if (!job || !finalFailure) {
        return;
      }

      recordProcessedMetric(deadletterAlertState, deadletterAlertOptions);
      await publishDeadletter(
        deadletterQueue,
        {
          deadletterId: `dlq_job_${String(job.id)}`,
          source: "task.progress",
          reason: unrecoverable ? "NON_RETRYABLE" : "ATTEMPTS_EXHAUSTED",
          taskId: job.data.taskId,
          triggerEventId: job.data.triggerEventId,
          attemptsMade,
          maxRetries: Math.max(0, attempts - 1),
          errorName: readErrorName(error),
          errorMessage: readErrorMessage(error),
          createdAt: new Date().toISOString()
        },
        deadletterAlertState,
        deadletterAlertOptions
      );
    })().catch((deadletterError) => {
      logger.error(
        {
          jobId: job?.id,
          taskId: job?.data.taskId,
          deadletterError
        },
        "failed to persist deadletter record for worker job"
      );
    });
  });

  logger.info(
    {
      env,
      queueName,
      deadletterQueueName,
      redisUrl,
      outboxPollMs,
      outboxBatchSize,
      outboxMaxRetries,
      workerConcurrency,
      runtimeOptions: {
        stepDelayMs: runtimeOptions.stepDelayMs,
        waitMaskDelayMs: runtimeOptions.waitMaskDelayMs,
        maxStepIterations: runtimeOptions.maxStepIterations,
        followupDelayMs: runtimeOptions.followupDelayMs,
        inferenceGatewayUrl: runtimeOptions.inferenceGatewayUrl,
        resultExpireDays: runtimeOptions.resultExpireDays
      },
      retryPolicy,
      deadletterAlertOptions: {
        ...deadletterAlertOptions,
        windowSec: Math.floor(deadletterAlertOptions.windowMs / 1000)
      }
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
    await deadletterQueue.close();
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
      const result = await dispatchOutboxEvents(queue, outboxBatchSize, {
        retryPolicy,
        outboxMaxRetries,
        deadletterQueue,
        deadletterAlertOptions,
        deadletterAlertState
      });
      if (result.scanned > 0 || result.failed > 0 || result.deadlettered > 0) {
        logger.info(result, "outbox dispatch finished");
      }
    } catch (error) {
      logger.error({ error }, "outbox dispatch failed");
    }

    await sleep(outboxPollMs);
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  bootstrap().catch((error) => {
    logger.error({ error }, "service startup failed");
    process.exit(1);
  });
}
