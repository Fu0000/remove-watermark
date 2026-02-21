import { createHash, createHmac, randomUUID } from "node:crypto";
import { PrismaClient, type Prisma, type WebhookDelivery as DbWebhookDelivery } from "@prisma/client";

const WEBHOOK_SIGNATURE_VERSION = "v1";
const DEFAULT_KEY_ID = "k1";
const SUPPORTED_EVENT_TYPES = new Set([
  "task.succeeded",
  "task.failed",
  "task.canceled",
  "subscription.activated"
]);

export interface DispatcherRuntimeOptions {
  batchSize: number;
  retryScheduleMs: number[];
  defaultTimeoutMs: number;
}

export interface DispatchBatchResult {
  scanned: number;
  published: number;
  pending: number;
  dead: number;
  deliveriesCreated: number;
  deliverySuccesses: number;
  deliveryFailures: number;
}

type EndpointStatus = "ACTIVE" | "PAUSED" | "DELETED";
type DeliveryFailureCode =
  | "DISPATCH_HTTP_NON_2XX"
  | "DISPATCH_TIMEOUT"
  | "DISPATCH_NETWORK_ERROR"
  | "DISPATCH_SECRET_MISSING"
  | "DISPATCH_PAYLOAD_BUILD_FAILED";

interface EndpointRecord {
  endpointId: string;
  userId: string;
  url: string;
  events: string[];
  timeoutMs: number;
  maxRetries: number;
  activeKeyId: string;
  secretByKeyId: Record<string, string>;
  status: EndpointStatus;
}

interface EventContext {
  userId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

type DeliveryAttemptDecision =
  | { kind: "SKIP_SUCCESS" }
  | { kind: "EXHAUSTED" }
  | { kind: "DEFERRED" }
  | { kind: "ATTEMPT"; attempt: number };

interface DeliveryAttemptResult {
  kind: "SUCCESS" | "FAILED_RETRYABLE" | "FAILED_EXHAUSTED" | "DEFERRED" | "SKIP_SUCCESS";
  deliveryCreated: boolean;
  responseStatus?: number;
  failureCode?: DeliveryFailureCode;
}

export function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function parseBoolean(value: string, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function parseRetryScheduleMs(value: string) {
  const fallback = [60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);

  if (parsed.length === 0) {
    return fallback;
  }

  return parsed;
}

export async function dispatchPendingEvents(
  prisma: PrismaClient,
  options: DispatcherRuntimeOptions
): Promise<DispatchBatchResult> {
  const events = await prisma.outboxEvent.findMany({
    where: {
      status: "PENDING",
      eventType: { in: [...SUPPORTED_EVENT_TYPES] }
    },
    orderBy: [{ createdAt: "asc" }],
    take: options.batchSize
  });

  let published = 0;
  let pending = 0;
  let dead = 0;
  let deliveriesCreated = 0;
  let deliverySuccesses = 0;
  let deliveryFailures = 0;

  for (const event of events) {
    const handled = await handleOutboxEvent(prisma, event, options);
    published += handled.status === "PUBLISHED" ? 1 : 0;
    pending += handled.status === "PENDING" ? 1 : 0;
    dead += handled.status === "DEAD" ? 1 : 0;
    deliveriesCreated += handled.deliveriesCreated;
    deliverySuccesses += handled.deliverySuccesses;
    deliveryFailures += handled.deliveryFailures;
  }

  return {
    scanned: events.length,
    published,
    pending,
    dead,
    deliveriesCreated,
    deliverySuccesses,
    deliveryFailures
  };
}

async function handleOutboxEvent(
  prisma: PrismaClient,
  event: {
    eventId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    retryCount: number;
    createdAt: Date;
  },
  options: DispatcherRuntimeOptions
): Promise<{
  status: "PUBLISHED" | "PENDING" | "DEAD";
  deliveriesCreated: number;
  deliverySuccesses: number;
  deliveryFailures: number;
}> {
  const context = await resolveEventContext(prisma, event);
  if (!context) {
    await prisma.outboxEvent.update({
      where: { eventId: event.eventId },
      data: {
        status: "DEAD",
        retryCount: event.retryCount + 1
      }
    });
    return {
      status: "DEAD",
      deliveriesCreated: 0,
      deliverySuccesses: 0,
      deliveryFailures: 0
    };
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      userId: context.userId,
      status: "ACTIVE"
    }
  });
  const normalizedEndpoints = endpoints
    .map((item) => normalizeEndpoint(item))
    .filter((item) => item.status === "ACTIVE")
    .filter((item) => item.events.includes(event.eventType));

  if (normalizedEndpoints.length === 0) {
    await prisma.outboxEvent.update({
      where: { eventId: event.eventId },
      data: { status: "PUBLISHED" }
    });
    return {
      status: "PUBLISHED",
      deliveriesCreated: 0,
      deliverySuccesses: 0,
      deliveryFailures: 0
    };
  }

  const previousAttempts = await prisma.webhookDelivery.findMany({
    where: {
      eventId: event.eventId,
      endpointId: { in: normalizedEndpoints.map((item) => item.endpointId) }
    },
    orderBy: [{ endpointId: "asc" }, { attempt: "desc" }]
  });
  const latestAttemptsByEndpoint = new Map<string, DbWebhookDelivery>();
  for (const item of previousAttempts) {
    if (!latestAttemptsByEndpoint.has(item.endpointId)) {
      latestAttemptsByEndpoint.set(item.endpointId, item);
    }
  }

  const deliveryResults: DeliveryAttemptResult[] = [];
  for (const endpoint of normalizedEndpoints) {
    const latestAttempt = latestAttemptsByEndpoint.get(endpoint.endpointId);
    const decision = decideNextAttempt(latestAttempt, endpoint.maxRetries, options);

    if (decision.kind === "SKIP_SUCCESS") {
      deliveryResults.push({ kind: "SKIP_SUCCESS", deliveryCreated: false });
      continue;
    }
    if (decision.kind === "DEFERRED") {
      deliveryResults.push({ kind: "DEFERRED", deliveryCreated: false });
      continue;
    }
    if (decision.kind === "EXHAUSTED") {
      deliveryResults.push({ kind: "FAILED_EXHAUSTED", deliveryCreated: false });
      continue;
    }

    const result = await sendDeliveryAttempt(prisma, {
      endpoint,
      eventId: event.eventId,
      eventType: event.eventType,
      context,
      attempt: decision.attempt,
      defaultTimeoutMs: options.defaultTimeoutMs
    });
    deliveryResults.push(result);
  }

  const hasRetryable = deliveryResults.some(
    (item) => item.kind === "FAILED_RETRYABLE" || item.kind === "DEFERRED"
  );
  const hasExhausted = deliveryResults.some((item) => item.kind === "FAILED_EXHAUSTED");
  const nextStatus: "PUBLISHED" | "PENDING" | "DEAD" = hasRetryable ? "PENDING" : hasExhausted ? "DEAD" : "PUBLISHED";
  const shouldIncreaseRetryCount = deliveryResults.some((item) => item.kind === "FAILED_RETRYABLE" || item.kind === "FAILED_EXHAUSTED");

  await prisma.outboxEvent.update({
    where: { eventId: event.eventId },
    data: {
      status: nextStatus,
      retryCount: shouldIncreaseRetryCount ? event.retryCount + 1 : event.retryCount
    }
  });

  return {
    status: nextStatus,
    deliveriesCreated: deliveryResults.filter((item) => item.deliveryCreated).length,
    deliverySuccesses: deliveryResults.filter((item) => item.kind === "SUCCESS").length,
    deliveryFailures: deliveryResults.filter(
      (item) => item.kind === "FAILED_RETRYABLE" || item.kind === "FAILED_EXHAUSTED"
    ).length
  };
}

async function resolveEventContext(
  prisma: PrismaClient,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    createdAt: Date;
  }
): Promise<EventContext | undefined> {
  if (event.aggregateType === "task") {
    const task = await prisma.task.findUnique({
      where: { taskId: event.aggregateId },
      select: {
        taskId: true,
        userId: true,
        status: true,
        resultUrl: true,
        errorCode: true,
        errorMessage: true,
        updatedAt: true
      }
    });
    if (!task) {
      return undefined;
    }

    if (event.eventType === "task.succeeded") {
      return {
        userId: task.userId,
        occurredAt: task.updatedAt.toISOString(),
        data: {
          taskId: task.taskId,
          userId: task.userId,
          status: task.status,
          resultUrl: task.resultUrl
        }
      };
    }

    if (event.eventType === "task.failed" || event.eventType === "task.canceled") {
      return {
        userId: task.userId,
        occurredAt: task.updatedAt.toISOString(),
        data: {
          taskId: task.taskId,
          userId: task.userId,
          status: task.status,
          errorCode: task.errorCode,
          errorMessage: task.errorMessage
        }
      };
    }

    return undefined;
  }

  if (event.aggregateType === "subscription" && event.eventType === "subscription.activated") {
    const subscription = await prisma.subscription.findUnique({
      where: { subscriptionId: event.aggregateId },
      select: {
        subscriptionId: true,
        userId: true,
        planId: true,
        status: true,
        effectiveAt: true,
        updatedAt: true
      }
    });
    if (!subscription) {
      return undefined;
    }

    return {
      userId: subscription.userId,
      occurredAt: (subscription.effectiveAt || subscription.updatedAt || event.createdAt).toISOString(),
      data: {
        subscriptionId: subscription.subscriptionId,
        userId: subscription.userId,
        planId: subscription.planId,
        status: subscription.status,
        effectiveAt: subscription.effectiveAt?.toISOString() || null
      }
    };
  }

  return undefined;
}

function normalizeEndpoint(record: {
  endpointId: string;
  userId: string;
  url: string;
  status: string;
  eventsJson: Prisma.JsonValue;
  timeoutMs: number;
  maxRetries: number;
  activeKeyId: string;
  secretJson: Prisma.JsonValue;
}): EndpointRecord {
  return {
    endpointId: record.endpointId,
    userId: record.userId,
    url: record.url,
    status: normalizeEndpointStatus(record.status),
    events: normalizeEvents(record.eventsJson),
    timeoutMs: record.timeoutMs,
    maxRetries: Math.max(0, record.maxRetries),
    activeKeyId: record.activeKeyId || DEFAULT_KEY_ID,
    secretByKeyId: normalizeSecretMap(record.secretJson)
  };
}

function normalizeEndpointStatus(value: string): EndpointStatus {
  if (value === "PAUSED") {
    return "PAUSED";
  }
  if (value === "DELETED") {
    return "DELETED";
  }
  return "ACTIVE";
}

function normalizeEvents(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0 && SUPPORTED_EVENT_TYPES.has(item)
  );
}

function normalizeSecretMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.length > 0) {
      output[key] = item;
    }
  }
  return output;
}

function decideNextAttempt(
  latestAttempt: DbWebhookDelivery | undefined,
  maxRetries: number,
  options: DispatcherRuntimeOptions
): DeliveryAttemptDecision {
  if (!latestAttempt) {
    return { kind: "ATTEMPT", attempt: 1 };
  }

  if (latestAttempt.status === "SUCCESS") {
    return { kind: "SKIP_SUCCESS" };
  }

  const maxAttempts = maxRetries + 1;
  if (latestAttempt.attempt >= maxAttempts) {
    return { kind: "EXHAUSTED" };
  }

  const retryAfterMs = computeRetryDelayMs(options.retryScheduleMs, latestAttempt.attempt);
  const dueAtMs = latestAttempt.createdAt.getTime() + retryAfterMs;
  if (Date.now() < dueAtMs) {
    return { kind: "DEFERRED" };
  }

  return { kind: "ATTEMPT", attempt: latestAttempt.attempt + 1 };
}

function computeRetryDelayMs(schedule: number[], failedAttempt: number) {
  const index = Math.max(0, Math.min(failedAttempt - 1, schedule.length - 1));
  return schedule[index];
}

async function sendDeliveryAttempt(
  prisma: PrismaClient,
  input: {
    endpoint: EndpointRecord;
    eventId: string;
    eventType: string;
    context: EventContext;
    attempt: number;
    defaultTimeoutMs: number;
  }
): Promise<DeliveryAttemptResult> {
  const deliveryId = buildId("wh_dl");
  const traceId = buildId("req");
  const keyId = input.endpoint.activeKeyId || DEFAULT_KEY_ID;
  const secret = input.endpoint.secretByKeyId[keyId];

  const payload = {
    eventId: input.eventId,
    eventType: input.eventType,
    version: 1,
    occurredAt: input.context.occurredAt,
    traceId,
    data: input.context.data
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  if (!secret) {
    await createFailedDelivery(prisma, {
      deliveryId,
      eventId: input.eventId,
      userId: input.endpoint.userId,
      endpointId: input.endpoint.endpointId,
      eventType: input.eventType,
      attempt: input.attempt,
      rawBody,
      requestHeaders: {
        "X-Webhook-Id": deliveryId,
        "X-Webhook-Event": input.eventType,
        "X-Webhook-Version": "1",
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Key-Id": keyId,
        "X-Webhook-Trace-Id": traceId
      },
      failureCode: "DISPATCH_SECRET_MISSING",
      errorMessage: "webhook secret missing",
      responseStatus: 500
    });
    return {
      kind: "FAILED_EXHAUSTED",
      deliveryCreated: true,
      failureCode: "DISPATCH_SECRET_MISSING",
      responseStatus: 500
    };
  }

  const signature = signPayload(secret, `${timestamp}.${rawBody}`);
  const requestHeaders = {
    "Content-Type": "application/json",
    "X-Webhook-Id": deliveryId,
    "X-Webhook-Event": input.eventType,
    "X-Webhook-Version": "1",
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Key-Id": keyId,
    "X-Webhook-Trace-Id": traceId,
    "X-Webhook-Signature": `${WEBHOOK_SIGNATURE_VERSION}=${signature}`
  };

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, input.endpoint.timeoutMs || input.defaultTimeoutMs);
  const timeoutRef = setTimeout(() => controller.abort(), timeoutMs);

  let responseStatus: number | undefined;
  let errorMessage: string | undefined;
  let failureCode: DeliveryFailureCode | undefined;
  let success = false;

  try {
    const response = await fetch(input.endpoint.url, {
      method: "POST",
      headers: requestHeaders,
      body: rawBody,
      signal: controller.signal
    });
    responseStatus = response.status;
    success = response.ok;
    if (!response.ok) {
      failureCode = "DISPATCH_HTTP_NON_2XX";
      errorMessage = `webhook response status=${response.status}`;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      failureCode = "DISPATCH_TIMEOUT";
      errorMessage = `webhook dispatch timeout after ${timeoutMs}ms`;
      responseStatus = 408;
    } else {
      failureCode = "DISPATCH_NETWORK_ERROR";
      errorMessage = readErrorMessage(error);
      responseStatus = 503;
    }
  } finally {
    clearTimeout(timeoutRef);
  }

  try {
    await prisma.webhookDelivery.create({
      data: {
        deliveryId,
        eventId: input.eventId,
        userId: input.endpoint.userId,
        endpointId: input.endpoint.endpointId,
        eventType: input.eventType,
        status: success ? "SUCCESS" : "FAILED",
        attempt: input.attempt,
        requestHeaders: requestHeaders as unknown as Prisma.InputJsonValue,
        payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
        signatureValidated: true,
        failureCode,
        errorMessage,
        responseStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    // concurrent workers may race on unique(endpointId,eventId,attempt)
    if (!isUniqueViolation(error)) {
      throw error;
    }
    return {
      kind: "DEFERRED",
      deliveryCreated: false
    };
  }

  if (success) {
    return {
      kind: "SUCCESS",
      deliveryCreated: true,
      responseStatus
    };
  }

  return {
    kind: "FAILED_RETRYABLE",
    deliveryCreated: true,
    responseStatus,
    failureCode
  };
}

async function createFailedDelivery(
  prisma: PrismaClient,
  input: {
    deliveryId: string;
    eventId: string;
    userId: string;
    endpointId: string;
    eventType: string;
    attempt: number;
    requestHeaders: Record<string, string>;
    rawBody: string;
    failureCode: DeliveryFailureCode;
    errorMessage: string;
    responseStatus: number;
  }
) {
  try {
    await prisma.webhookDelivery.create({
      data: {
        deliveryId: input.deliveryId,
        eventId: input.eventId,
        userId: input.userId,
        endpointId: input.endpointId,
        eventType: input.eventType,
        status: "FAILED",
        attempt: input.attempt,
        requestHeaders: input.requestHeaders as unknown as Prisma.InputJsonValue,
        payloadSha256: createHash("sha256").update(input.rawBody).digest("hex"),
        signatureValidated: false,
        failureCode: input.failureCode,
        errorMessage: input.errorMessage,
        responseStatus: input.responseStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
}

function signPayload(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function buildId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
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

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "P2002";
}
