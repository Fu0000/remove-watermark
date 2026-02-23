import type { TaskMediaType, TaskStatus } from "@packages/contracts";
import { buildStableTraceId, createLogger, readEnv } from "@packages/shared";
import { PrismaClient, type Prisma } from "@prisma/client";
import { JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";
import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createWorkerMetricsState,
  observeTaskFailure,
  observeTaskTransition,
  renderPrometheusMetrics,
  setOutboxBatch,
  setQueueDepth,
  type WorkerMetricsState
} from "./metrics";

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
  | { kind: "ADVANCED"; fromStatus: TaskStatus; status: TaskStatus };

export interface WorkerRuntimeOptions {
  stepDelayMs: number;
  waitMaskDelayMs: number;
  maxStepIterations: number;
  followupDelayMs: number;
  inferenceGatewayUrl: string;
  inferenceSharedToken: string;
  inferenceRequestTimeoutImageMs: number;
  inferenceRequestTimeoutVideoMs: number;
  inferenceRequestTimeoutDocMs: number;
  resultExpireDays: number;
  assetSourceMode: "minio" | "local";
  minioAssetBucket: string;
  minioResultBucket: string;
  minioSourcePrefix: string;
  minioResultPrefix: string;
  minioPublicEndpoint: string;
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

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  return `${trimTrailingSlash(base)}/${path.replace(/^\/+/, "")}`;
}

function normalizeObjectPrefix(prefix: string, fallback: string) {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function buildDatePath(reference: Date | string | null | undefined) {
  let date = new Date();
  if (reference instanceof Date) {
    date = reference;
  } else if (typeof reference === "string") {
    const parsed = new Date(reference);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function buildResultObjectKey(runtime: WorkerRuntimeOptions, taskId: string, ext: string, createdAt?: Date | string | null) {
  const datePath = buildDatePath(createdAt);
  return `${runtime.minioResultPrefix}/${datePath}/${taskId}.${ext}`;
}

function normalizePublicUrl(runtime: WorkerRuntimeOptions, url: string) {
  if (/^https?:\/\/minio\.local\//i.test(url)) {
    return joinUrl(runtime.minioPublicEndpoint, url.replace(/^https?:\/\/minio\.local\//i, ""));
  }
  return url;
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

function toMetricPort(raw: string) {
  return parseNonNegativeInt(raw, 0);
}

function startMetricsServer(port: number, metrics: WorkerMetricsState): Server {
  const server = createServer((request, response) => {
    const path = request.url || "/";
    if (path === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      response.end(renderPrometheusMetrics(metrics));
      return;
    }
    if (path === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });

  server.listen(port, () => {
    logger.info({ metricsPort: port }, "metrics server started");
  });
  return server;
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

function buildDefaultResultUrl(
  runtime: WorkerRuntimeOptions,
  taskId: string,
  mediaType: TaskMediaType,
  createdAt?: Date | string | null
) {
  const ext = mediaType === "VIDEO" ? "mp4" : mediaType === "PDF" || mediaType === "PPT" ? "pdf" : "png";
  return joinUrl(
    runtime.minioPublicEndpoint,
    `${runtime.minioResultBucket}/${buildResultObjectKey(runtime, taskId, ext, createdAt)}`
  );
}

function buildDefaultZipUrl(runtime: WorkerRuntimeOptions, taskId: string, createdAt?: Date | string | null) {
  return joinUrl(
    runtime.minioPublicEndpoint,
    `${runtime.minioResultBucket}/${buildResultObjectKey(runtime, taskId, "zip", createdAt)}`
  );
}

function buildExpireAt(days: number) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

async function buildAssetSourcePath(
  runtime: WorkerRuntimeOptions,
  task: {
    assetId: string;
    createdAt?: Date | null;
  }
) {
  if (runtime.assetSourceMode !== "minio") {
    return undefined;
  }
  let createdAt: Date | null = task.createdAt || null;
  if (process.env.DATABASE_URL) {
    try {
      const asset = await prisma.asset.findUnique({
        where: { assetId: task.assetId },
        select: { createdAt: true }
      });
      createdAt = asset?.createdAt || createdAt;
    } catch (error) {
      logger.warn(
        {
          assetId: task.assetId,
          error
        },
        "failed to load asset createdAt, fallback to task createdAt"
      );
    }
  }
  const datePath = buildDatePath(createdAt);
  return `minio://${runtime.minioAssetBucket}/${runtime.minioSourcePrefix}/${datePath}/${task.assetId}`;
}

function serializeTaskCreatedAt(value: Date | null | undefined): string | undefined {
  if (!(value instanceof Date)) {
    return undefined;
  }
  return value.toISOString();
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
  payload: Record<string, unknown>,
  options: {
    timeoutMs: number;
  }
): Promise<T> {
  const taskId = typeof payload.taskId === "string" ? payload.taskId : undefined;
  const traceId = taskId ? buildStableTraceId(`task:${taskId}`) : buildStableTraceId(`req:${crypto.randomUUID()}`);
  logger.debug({ taskId, traceId, path, timeoutMs: options.timeoutMs }, "inference request");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${runtime.inferenceGatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inference-token": runtime.inferenceSharedToken,
        "x-trace-id": traceId
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (readErrorName(error) === "AbortError") {
      throw new Error(`inference timeout after ${options.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status >= 400 && response.status < 500) {
      throw new UnrecoverableError(`inference non-retryable ${response.status}: ${body || "unknown"} (trace=${traceId})`);
    }
    throw new Error(`inference failed ${response.status}: ${body || "unknown"} (trace=${traceId})`);
  }

  return (await response.json()) as T;
}

function resolveInferenceTimeoutMs(
  runtime: WorkerRuntimeOptions,
  mediaType: TaskMediaType
) {
  if (mediaType === "VIDEO") {
    return runtime.inferenceRequestTimeoutVideoMs;
  }
  if (mediaType === "PDF" || mediaType === "PPT") {
    return runtime.inferenceRequestTimeoutDocMs;
  }
  return runtime.inferenceRequestTimeoutImageMs;
}

function resolveTaskFailureCode(error: unknown): string {
  const message = readErrorMessage(error).toLowerCase();
  if (message.includes("timeout")) {
    return "50023";
  }
  if (isUnrecoverableError(error)) {
    return "50021";
  }
  return "50001";
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
    createdAt: Date;
  },
  runtime: WorkerRuntimeOptions
) {
  logger.debug({ taskId: task.taskId, mediaType: task.mediaType }, "execute preprocessing");
  const sourcePath = await buildAssetSourcePath(runtime, task);
  const timeoutMs = resolveInferenceTimeoutMs(runtime, task.mediaType as TaskMediaType);
  if (task.mediaType === "PPT") {
    await callInferenceGateway(
      runtime,
      "/internal/doc/ppt-to-pdf",
      {
        taskId: task.taskId,
        assetId: task.assetId,
        sourcePath,
        taskCreatedAt: serializeTaskCreatedAt(task.createdAt)
      },
      {
        timeoutMs
      }
    );
  }

  if (task.mediaType === "PDF" || task.mediaType === "PPT") {
    await callInferenceGateway(
      runtime,
      "/internal/doc/render-pdf",
      {
        taskId: task.taskId,
        assetId: task.assetId,
        mediaType: task.mediaType,
        sourcePath,
        taskCreatedAt: serializeTaskCreatedAt(task.createdAt)
      },
      {
        timeoutMs
      }
    );
  }
}

async function executeInpainting(
  task: {
    taskId: string;
    assetId: string;
    mediaType: string;
    createdAt: Date;
  },
  runtime: WorkerRuntimeOptions
) {
  logger.debug({ taskId: task.taskId, mediaType: task.mediaType }, "execute inpainting");
  const region = await prisma.taskRegion.findUnique({
    where: { taskId: task.taskId }
  });
  const mask = await prisma.taskMask.findUnique({
    where: { taskId: task.taskId }
  });

  const sourcePath = await buildAssetSourcePath(runtime, task);
  const regionsPayload =
    (region?.regionsJson as Prisma.JsonValue | undefined) ||
    ({
      polygons: (mask?.polygons as Prisma.JsonValue | undefined) || [],
      brushStrokes: (mask?.brushStrokes as Prisma.JsonValue | undefined) || []
    } satisfies Record<string, unknown>);

  const timeoutMs = resolveInferenceTimeoutMs(runtime, task.mediaType as TaskMediaType);
  if (task.mediaType === "VIDEO") {
    return callInferenceGateway<{ outputUrl?: string }>(
      runtime,
      "/internal/inpaint/video",
      {
        taskId: task.taskId,
        assetId: task.assetId,
        regions: regionsPayload,
        sourcePath,
        taskCreatedAt: serializeTaskCreatedAt(task.createdAt)
      },
      {
        timeoutMs
      }
    );
  }

  if (task.mediaType === "PDF" || task.mediaType === "PPT") {
    return callInferenceGateway<{ outputUrl?: string }>(
      runtime,
      "/internal/doc/inpaint-pages",
      {
        taskId: task.taskId,
        assetId: task.assetId,
        mediaType: task.mediaType,
        regions: regionsPayload,
        taskCreatedAt: serializeTaskCreatedAt(task.createdAt)
      },
      {
        timeoutMs
      }
    );
  }

  return callInferenceGateway<{ outputUrl?: string }>(
    runtime,
    "/internal/inpaint/image",
    {
      taskId: task.taskId,
      assetId: task.assetId,
      mediaType: task.mediaType,
      regions: regionsPayload,
      sourcePath,
      taskCreatedAt: serializeTaskCreatedAt(task.createdAt)
    },
    {
      timeoutMs
    }
  );
}

async function executePackaging(
  task: {
    taskId: string;
    assetId: string;
    mediaType: string;
    resultJson: Prisma.JsonValue | null;
    createdAt: Date;
  },
  runtime: WorkerRuntimeOptions
): Promise<PackagingResult> {
  logger.debug({ taskId: task.taskId, mediaType: task.mediaType }, "execute packaging");
  const staged = toRecord(task.resultJson)?.staging as Record<string, unknown> | undefined;
  const defaultUrl = buildDefaultResultUrl(runtime, task.taskId, task.mediaType as TaskMediaType, task.createdAt);
  const expireAt = buildExpireAt(runtime.resultExpireDays);

  if (task.mediaType === "PDF" || task.mediaType === "PPT") {
    const sourcePath = await buildAssetSourcePath(runtime, task);
    const packaged = await callInferenceGateway<{ resultUrl?: string; pdfUrl?: string; zipUrl?: string }>(
      runtime,
      "/internal/doc/package",
      {
        taskId: task.taskId,
        assetId: task.assetId,
        mediaType: task.mediaType,
        staged,
        sourcePath,
        taskCreatedAt: serializeTaskCreatedAt(task.createdAt)
      },
      {
        timeoutMs: runtime.inferenceRequestTimeoutDocMs
      }
    );

    const pdfUrl = normalizePublicUrl(
      runtime,
      packaged.pdfUrl || packaged.resultUrl || defaultUrl
    );
    const zipUrl = normalizePublicUrl(
      runtime,
      packaged.zipUrl || buildDefaultZipUrl(runtime, task.taskId, task.createdAt)
    );
    return {
      resultUrl: pdfUrl,
      artifacts: [
        { type: "PDF", url: pdfUrl, expireAt },
        { type: "ZIP", url: zipUrl, expireAt }
      ]
    };
  }

  const stagedOutput =
    typeof staged?.outputUrl === "string"
      ? normalizePublicUrl(runtime, staged.outputUrl)
      : defaultUrl;
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

    return { kind: "ADVANCED", fromStatus: input.expectedStatus, status: input.nextStatus };
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
      const outputUrl = inpaint.outputUrl
        ? normalizePublicUrl(runtime, inpaint.outputUrl)
        : buildDefaultResultUrl(runtime, taskId, task.mediaType as TaskMediaType, task.createdAt);
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
  retryPolicy: RetryPolicyOptions,
  metrics: WorkerMetricsState = createWorkerMetricsState()
) {
  const followupJobId = `job_followup_${taskId}`;

  for (let index = 0; index < options.maxStepIterations; index += 1) {
    let result: TaskStepResult;
    const startedAtMs = Date.now();
    try {
      result = await processTaskStep(taskId, options);
    } catch (error) {
      if (isUnrecoverableError(error)) {
        await markTaskFailed(taskId, readErrorMessage(error), "50021");
        observeTaskFailure(metrics, "50021");
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
      observeTaskTransition(metrics, result.fromStatus, result.status, Date.now() - startedAtMs);
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
    inferenceRequestTimeoutImageMs: parsePositiveInt(
      readEnv("INFERENCE_REQUEST_TIMEOUT_IMAGE_MS", readEnv("INFERENCE_REQUEST_TIMEOUT_MS", "120000")),
      120000
    ),
    inferenceRequestTimeoutVideoMs: parsePositiveInt(
      readEnv("INFERENCE_REQUEST_TIMEOUT_VIDEO_MS", readEnv("INFERENCE_REQUEST_TIMEOUT_MS", "900000")),
      900000
    ),
    inferenceRequestTimeoutDocMs: parsePositiveInt(
      readEnv("INFERENCE_REQUEST_TIMEOUT_DOC_MS", readEnv("INFERENCE_REQUEST_TIMEOUT_MS", "300000")),
      300000
    ),
    resultExpireDays: parsePositiveInt(readEnv("RESULT_EXPIRE_DAYS", "30"), 30),
    assetSourceMode: (readEnv("ASSET_SOURCE_MODE", "minio").toLowerCase() === "local" ? "local" : "minio") as
      | "minio"
      | "local",
    minioAssetBucket: readEnv("MINIO_BUCKET_ASSETS", "remove-waterremark"),
    minioResultBucket: readEnv("MINIO_BUCKET_RESULTS", "remove-waterremark"),
    minioSourcePrefix: normalizeObjectPrefix(readEnv("MINIO_SOURCE_PREFIX", "source"), "source"),
    minioResultPrefix: normalizeObjectPrefix(readEnv("MINIO_RESULT_PREFIX", "result"), "result"),
    minioPublicEndpoint: trimTrailingSlash(readEnv("MINIO_PUBLIC_ENDPOINT", "http://127.0.0.1:9000"))
  };
  const workerConcurrency = parsePositiveInt(readEnv("ORCHESTRATOR_WORKER_CONCURRENCY", "4"), 4);
  const metricsPort = toMetricPort(readEnv("ORCHESTRATOR_METRICS_PORT", "0"));
  const metrics = createWorkerMetricsState();
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
      await processQueueJob(queue, job.data.taskId, runtimeOptions, retryPolicy, metrics);
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

      const failureCode = resolveTaskFailureCode(error);
      observeTaskFailure(metrics, failureCode);
      try {
        await markTaskFailed(job.data.taskId, readErrorMessage(error), failureCode);
      } catch (markError) {
        logger.error(
          {
            taskId: job.data.taskId,
            markError
          },
          "failed to mark task as failed on final worker error"
        );
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
      metricsPort,
      runtimeOptions: {
        stepDelayMs: runtimeOptions.stepDelayMs,
        waitMaskDelayMs: runtimeOptions.waitMaskDelayMs,
        maxStepIterations: runtimeOptions.maxStepIterations,
        followupDelayMs: runtimeOptions.followupDelayMs,
        inferenceGatewayUrl: runtimeOptions.inferenceGatewayUrl,
        inferenceRequestTimeoutImageMs: runtimeOptions.inferenceRequestTimeoutImageMs,
        inferenceRequestTimeoutVideoMs: runtimeOptions.inferenceRequestTimeoutVideoMs,
        inferenceRequestTimeoutDocMs: runtimeOptions.inferenceRequestTimeoutDocMs,
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

  let metricsServer: Server | undefined;
  if (metricsPort > 0) {
    metricsServer = startMetricsServer(metricsPort, metrics);
  }

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
    if (metricsServer) {
      await new Promise<void>((resolve, reject) => {
        metricsServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      metricsServer = undefined;
    }
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
      setOutboxBatch(metrics, result);
      const queueCounts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
      setQueueDepth(metrics, {
        waiting: queueCounts.waiting || 0,
        active: queueCounts.active || 0,
        delayed: queueCounts.delayed || 0,
        failed: queueCounts.failed || 0
      });
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
