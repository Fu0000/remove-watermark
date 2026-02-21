import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type WebhookDelivery as DbWebhookDelivery, type WebhookEndpoint as DbWebhookEndpoint } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

type EndpointStatus = "ACTIVE" | "PAUSED" | "DELETED";
type DeliveryStatus = "SUCCESS" | "FAILED";
type DeliveryFailureCode =
  | "SIMULATED_DISPATCH_FAILURE"
  | "SIGNATURE_VERIFY_FAILED"
  | "DISPATCH_HTTP_NON_2XX"
  | "DISPATCH_TIMEOUT"
  | "DISPATCH_NETWORK_ERROR"
  | "DISPATCH_SECRET_MISSING"
  | "DISPATCH_PAYLOAD_BUILD_FAILED";

const WEBHOOK_SIGNATURE_VERSION = "v1";
const WEBHOOK_REPLAY_WINDOW_SECONDS = 300;
const WEBHOOK_REPLAY_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_KEY_ID = "k1";

interface EndpointRecord {
  endpointId: string;
  userId: string;
  name: string;
  url: string;
  status: EndpointStatus;
  events: string[];
  timeoutMs: number;
  maxRetries: number;
  activeKeyId: string;
  secretByKeyId: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface DeliveryRecord {
  deliveryId: string;
  userId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: DeliveryStatus;
  attempt: number;
  requestHeaders: Record<string, string>;
  payloadSha256: string;
  signatureValidated: boolean;
  failureCode?: DeliveryFailureCode;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  responseStatus?: number;
}

interface SignedDeliveryDraft {
  deliveryId: string;
  eventId: string;
  requestHeaders: Record<string, string>;
  payloadSha256: string;
  signatureValidated: boolean;
  failureCode?: DeliveryFailureCode;
  status: DeliveryStatus;
  errorMessage?: string;
  responseStatus?: number;
}

export interface CreateEndpointInput {
  name: string;
  url: string;
  events: string[];
  timeoutMs: number;
  maxRetries: number;
}

export interface UpdateEndpointInput {
  name?: string;
  url?: string;
  events?: string[];
  status?: "ACTIVE" | "PAUSED";
  timeoutMs?: number;
  maxRetries?: number;
}

export interface EndpointView {
  endpointId: string;
  name: string;
  url: string;
  status: "ACTIVE" | "PAUSED";
  events: string[];
  timeoutMs: number;
  maxRetries: number;
  createdAt: string;
}

export interface DeliveryView {
  deliveryId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: DeliveryStatus;
  attempt: number;
  requestHeaders: Record<string, string>;
  payloadSha256: string;
  signatureValidated: boolean;
  failureCode?: DeliveryFailureCode;
  createdAt: string;
  errorMessage?: string;
  responseStatus?: number;
}

export interface ListDeliveriesInput {
  endpointId?: string;
  eventType?: string;
  status?: DeliveryStatus;
  page: number;
  pageSize: number;
}

export type RetryResult =
  | { kind: "SUCCESS"; deliveryId: string }
  | { kind: "NOT_FOUND" }
  | { kind: "ENDPOINT_NOT_FOUND" }
  | { kind: "INVALID_STATUS"; status: DeliveryStatus };

@Injectable()
export class WebhooksService {
  private readonly endpoints = new Map<string, EndpointRecord>();
  private readonly deliveries = new Map<string, DeliveryRecord>();
  private readonly replayCache = new Map<string, number>();

  private readonly preferPrismaStore =
    process.env.WEBHOOKS_STORE === "prisma" || process.env.TASKS_STORE === "prisma" || Boolean(process.env.DATABASE_URL);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createEndpoint(userId: string, input: CreateEndpointInput) {
    const endpointId = this.buildId("wh_ep");
    const activeKeyId = DEFAULT_KEY_ID;
    const secretByKeyId: Record<string, string> = {
      [activeKeyId]: this.buildSecret()
    };
    const now = new Date();

    if (this.preferPrismaStore) {
      try {
        await this.prisma.webhookEndpoint.create({
          data: {
            endpointId,
            userId,
            name: input.name,
            url: input.url,
            status: "ACTIVE",
            eventsJson: input.events as unknown as Prisma.InputJsonValue,
            timeoutMs: input.timeoutMs,
            maxRetries: input.maxRetries,
            activeKeyId,
            secretJson: secretByKeyId as unknown as Prisma.InputJsonValue,
            createdAt: now,
            updatedAt: now
          }
        });

        return {
          endpointId,
          status: "ACTIVE" as const,
          keyId: activeKeyId,
          secretHint: this.maskSecret(secretByKeyId[activeKeyId])
        };
      } catch {
        // no-op: fallback to memory path
      }
    }

    const record: EndpointRecord = {
      endpointId,
      userId,
      name: input.name,
      url: input.url,
      status: "ACTIVE",
      events: [...input.events],
      timeoutMs: input.timeoutMs,
      maxRetries: input.maxRetries,
      activeKeyId,
      secretByKeyId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.endpoints.set(endpointId, record);

    return {
      endpointId,
      status: record.status,
      keyId: activeKeyId,
      secretHint: this.maskSecret(secretByKeyId[activeKeyId])
    };
  }

  async listEndpoints(userId: string): Promise<EndpointView[]> {
    if (this.preferPrismaStore) {
      try {
        const rows = await this.prisma.webhookEndpoint.findMany({
          where: {
            userId,
            status: { in: ["ACTIVE", "PAUSED"] }
          },
          orderBy: [{ createdAt: "desc" }]
        });

        return rows.map((item) => this.toEndpointView(this.normalizeDbEndpoint(item)));
      } catch {
        // no-op: fallback to memory
      }
    }

    return [...this.endpoints.values()]
      .filter((item) => item.userId === userId && item.status !== "DELETED")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => this.toEndpointView(item));
  }

  async updateEndpoint(userId: string, endpointId: string, input: UpdateEndpointInput): Promise<EndpointView | undefined> {
    if (this.preferPrismaStore) {
      try {
        const payload: Prisma.WebhookEndpointUpdateManyMutationInput = {
          updatedAt: new Date()
        };

        if (input.name !== undefined) {
          payload.name = input.name;
        }
        if (input.url !== undefined) {
          payload.url = input.url;
        }
        if (input.events !== undefined) {
          payload.eventsJson = input.events as unknown as Prisma.InputJsonValue;
        }
        if (input.status !== undefined) {
          payload.status = input.status;
        }
        if (input.timeoutMs !== undefined) {
          payload.timeoutMs = input.timeoutMs;
        }
        if (input.maxRetries !== undefined) {
          payload.maxRetries = input.maxRetries;
        }

        const updated = await this.prisma.webhookEndpoint.updateMany({
          where: {
            endpointId,
            userId,
            status: { not: "DELETED" }
          },
          data: payload
        });

        if (updated.count !== 1) {
          return undefined;
        }

        const row = await this.prisma.webhookEndpoint.findUnique({ where: { endpointId } });
        if (!row) {
          return undefined;
        }

        return this.toEndpointView(this.normalizeDbEndpoint(row));
      } catch {
        // no-op: fallback to memory
      }
    }

    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint || endpoint.userId !== userId || endpoint.status === "DELETED") {
      return undefined;
    }

    if (input.name !== undefined) {
      endpoint.name = input.name;
    }
    if (input.url !== undefined) {
      endpoint.url = input.url;
    }
    if (input.events !== undefined) {
      endpoint.events = [...input.events];
    }
    if (input.status !== undefined) {
      endpoint.status = input.status;
    }
    if (input.timeoutMs !== undefined) {
      endpoint.timeoutMs = input.timeoutMs;
    }
    if (input.maxRetries !== undefined) {
      endpoint.maxRetries = input.maxRetries;
    }
    endpoint.updatedAt = new Date().toISOString();
    this.endpoints.set(endpointId, endpoint);

    return this.toEndpointView(endpoint);
  }

  async deleteEndpoint(userId: string, endpointId: string): Promise<boolean> {
    if (this.preferPrismaStore) {
      try {
        const now = new Date();
        const updated = await this.prisma.webhookEndpoint.updateMany({
          where: {
            endpointId,
            userId,
            status: { not: "DELETED" }
          },
          data: {
            status: "DELETED",
            deletedAt: now,
            updatedAt: now
          }
        });
        if (updated.count === 1) {
          return true;
        }
      } catch {
        // no-op: fallback to memory
      }
    }

    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint || endpoint.userId !== userId || endpoint.status === "DELETED") {
      return false;
    }

    endpoint.status = "DELETED";
    endpoint.deletedAt = new Date().toISOString();
    endpoint.updatedAt = endpoint.deletedAt;
    this.endpoints.set(endpointId, endpoint);
    return true;
  }

  async sendTestDelivery(userId: string, endpointId: string): Promise<{ deliveryId: string } | undefined> {
    if (this.preferPrismaStore) {
      try {
        const endpoint = await this.loadActiveEndpointWithPrisma(userId, endpointId);
        if (!endpoint) {
          return undefined;
        }

        const created = await this.createDeliveryWithPrisma(endpoint, "webhook.test", 1);
        return { deliveryId: created.deliveryId };
      } catch {
        // no-op: fallback to memory
      }
    }

    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint || endpoint.userId !== userId || endpoint.status === "DELETED") {
      return undefined;
    }

    const created = this.createDeliveryInMemory(endpoint, "webhook.test", 1);
    return { deliveryId: created.deliveryId };
  }

  async listDeliveries(userId: string, input: ListDeliveriesInput) {
    if (this.preferPrismaStore) {
      try {
        const where: Prisma.WebhookDeliveryWhereInput = {
          userId
        };
        if (input.endpointId) {
          where.endpointId = input.endpointId;
        }
        if (input.eventType) {
          where.eventType = input.eventType;
        }
        if (input.status) {
          where.status = input.status;
        }

        const [items, total] = await Promise.all([
          this.prisma.webhookDelivery.findMany({
            where,
            orderBy: [{ createdAt: "desc" }],
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize
          }),
          this.prisma.webhookDelivery.count({ where })
        ]);

        return {
          page: input.page,
          pageSize: input.pageSize,
          total,
          items: items.map((item) => this.toDeliveryView(this.normalizeDbDelivery(item)))
        };
      } catch {
        // no-op: fallback to memory
      }
    }

    const filtered = [...this.deliveries.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => !input.endpointId || item.endpointId === input.endpointId)
      .filter((item) => !input.eventType || item.eventType === input.eventType)
      .filter((item) => !input.status || item.status === input.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const total = filtered.length;
    const offset = (input.page - 1) * input.pageSize;

    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      items: filtered.slice(offset, offset + input.pageSize).map((item) => this.toDeliveryView(item))
    };
  }

  async retryDelivery(userId: string, deliveryId: string): Promise<RetryResult> {
    if (this.preferPrismaStore) {
      try {
        const delivery = await this.prisma.webhookDelivery.findUnique({ where: { deliveryId } });
        if (!delivery || delivery.userId !== userId) {
          return { kind: "NOT_FOUND" };
        }

        const normalizedDelivery = this.normalizeDbDelivery(delivery);
        if (normalizedDelivery.status !== "FAILED") {
          return { kind: "INVALID_STATUS", status: normalizedDelivery.status };
        }

        const endpoint = await this.loadActiveEndpointWithPrisma(userId, delivery.endpointId);
        if (!endpoint) {
          return { kind: "ENDPOINT_NOT_FOUND" };
        }

        const nextAttempt = Math.max(1, normalizedDelivery.attempt + 1);
        const created = await this.createDeliveryWithPrisma(endpoint, normalizedDelivery.eventType, nextAttempt, normalizedDelivery.eventId);
        return {
          kind: "SUCCESS",
          deliveryId: created.deliveryId
        };
      } catch {
        // no-op: fallback to memory
      }
    }

    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.userId !== userId) {
      return { kind: "NOT_FOUND" };
    }

    if (delivery.status !== "FAILED") {
      return { kind: "INVALID_STATUS", status: delivery.status };
    }

    const endpoint = this.endpoints.get(delivery.endpointId);
    if (!endpoint || endpoint.userId !== userId || endpoint.status === "DELETED") {
      return { kind: "ENDPOINT_NOT_FOUND" };
    }

    const retried = this.createDeliveryInMemory(endpoint, delivery.eventType, delivery.attempt + 1, delivery.eventId);
    return {
      kind: "SUCCESS",
      deliveryId: retried.deliveryId
    };
  }

  private async loadActiveEndpointWithPrisma(userId: string, endpointId: string): Promise<EndpointRecord | undefined> {
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: {
        endpointId,
        userId,
        status: { not: "DELETED" }
      }
    });

    if (!row) {
      return undefined;
    }

    return this.normalizeDbEndpoint(row);
  }

  private async createDeliveryWithPrisma(
    endpoint: EndpointRecord,
    eventType: string,
    attempt: number,
    eventId?: string
  ): Promise<DeliveryRecord> {
    const draft = this.buildSignedDeliveryDraft(endpoint, eventType, attempt, eventId);
    const now = new Date();

    const created = await this.prisma.webhookDelivery.create({
      data: {
        deliveryId: draft.deliveryId,
        eventId: draft.eventId,
        userId: endpoint.userId,
        endpointId: endpoint.endpointId,
        eventType,
        status: draft.status,
        attempt,
        requestHeaders: draft.requestHeaders as unknown as Prisma.InputJsonValue,
        payloadSha256: draft.payloadSha256,
        signatureValidated: draft.signatureValidated,
        failureCode: draft.failureCode,
        errorMessage: draft.errorMessage,
        responseStatus: draft.responseStatus,
        createdAt: now,
        updatedAt: now
      }
    });

    return this.normalizeDbDelivery(created);
  }

  private createDeliveryInMemory(endpoint: EndpointRecord, eventType: string, attempt: number, eventId?: string) {
    const draft = this.buildSignedDeliveryDraft(endpoint, eventType, attempt, eventId);
    const now = new Date().toISOString();

    const record: DeliveryRecord = {
      deliveryId: draft.deliveryId,
      userId: endpoint.userId,
      endpointId: endpoint.endpointId,
      eventId: draft.eventId,
      eventType,
      status: draft.status,
      attempt,
      requestHeaders: draft.requestHeaders,
      payloadSha256: draft.payloadSha256,
      signatureValidated: draft.signatureValidated,
      failureCode: draft.failureCode,
      createdAt: now,
      updatedAt: now,
      errorMessage: draft.errorMessage,
      responseStatus: draft.responseStatus
    };

    this.deliveries.set(record.deliveryId, record);
    return record;
  }

  private buildSignedDeliveryDraft(
    endpoint: EndpointRecord,
    eventType: string,
    attempt: number,
    eventId?: string
  ): SignedDeliveryDraft {
    const now = new Date();
    const occurredAt = now.toISOString();
    const deliveryId = this.buildId("wh_dl");
    const resolvedEventId = eventId || this.buildId("evt");
    const traceId = this.buildId("req");

    const payload = {
      eventId: resolvedEventId,
      eventType,
      version: 1,
      occurredAt,
      traceId,
      data: {
        deliveryId,
        endpointId: endpoint.endpointId,
        attempt,
        source: "api-gateway",
        mode: "local-smoke"
      }
    };

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(now.getTime() / 1000).toString();
    const secret = endpoint.secretByKeyId[endpoint.activeKeyId] || "";
    const signature = this.signPayload(secret, `${timestamp}.${rawBody}`);

    const requestHeaders = {
      "X-Webhook-Id": deliveryId,
      "X-Webhook-Event": eventType,
      "X-Webhook-Version": "1",
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Key-Id": endpoint.activeKeyId,
      "X-Webhook-Trace-Id": traceId,
      "X-Webhook-Signature": `${WEBHOOK_SIGNATURE_VERSION}=${signature}`
    };

    const verified = this.verifySignature({
      endpoint,
      requestHeaders,
      rawBody,
      nowEpochSeconds: Number.parseInt(timestamp, 10)
    });

    const simulatedDispatchFailure = endpoint.status !== "ACTIVE" || endpoint.url.includes("fail");
    const failureCode: DeliveryFailureCode | undefined = simulatedDispatchFailure
      ? "SIMULATED_DISPATCH_FAILURE"
      : verified.ok
        ? undefined
        : "SIGNATURE_VERIFY_FAILED";

    return {
      deliveryId,
      eventId: resolvedEventId,
      requestHeaders,
      payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
      signatureValidated: verified.ok,
      failureCode,
      status: failureCode ? "FAILED" : "SUCCESS",
      errorMessage: simulatedDispatchFailure
        ? "simulated webhook dispatch failure"
        : verified.ok
          ? undefined
          : `signature verification failed: ${verified.reason}`,
      responseStatus: simulatedDispatchFailure ? 503 : verified.ok ? 200 : 401
    };
  }

  private normalizeDbEndpoint(record: DbWebhookEndpoint): EndpointRecord {
    return {
      endpointId: record.endpointId,
      userId: record.userId,
      name: record.name,
      url: record.url,
      status: normalizeEndpointStatus(record.status),
      events: normalizeEvents(record.eventsJson),
      timeoutMs: record.timeoutMs,
      maxRetries: record.maxRetries,
      activeKeyId: record.activeKeyId,
      secretByKeyId: normalizeSecretMap(record.secretJson),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deletedAt: record.deletedAt ? record.deletedAt.toISOString() : undefined
    };
  }

  private normalizeDbDelivery(record: DbWebhookDelivery): DeliveryRecord {
    return {
      deliveryId: record.deliveryId,
      userId: record.userId,
      endpointId: record.endpointId,
      eventId: record.eventId,
      eventType: record.eventType,
      status: normalizeDeliveryStatus(record.status),
      attempt: record.attempt,
      requestHeaders: normalizeHeaders(record.requestHeaders),
      payloadSha256: record.payloadSha256,
      signatureValidated: record.signatureValidated,
      failureCode: normalizeFailureCode(record.failureCode),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      errorMessage: record.errorMessage || undefined,
      responseStatus: record.responseStatus || undefined
    };
  }

  private toEndpointView(record: EndpointRecord): EndpointView {
    return {
      endpointId: record.endpointId,
      name: record.name,
      url: record.url,
      status: record.status === "PAUSED" ? "PAUSED" : "ACTIVE",
      events: [...record.events],
      timeoutMs: record.timeoutMs,
      maxRetries: record.maxRetries,
      createdAt: record.createdAt
    };
  }

  private toDeliveryView(record: DeliveryRecord): DeliveryView {
    return {
      deliveryId: record.deliveryId,
      endpointId: record.endpointId,
      eventId: record.eventId,
      eventType: record.eventType,
      status: record.status,
      attempt: record.attempt,
      requestHeaders: { ...record.requestHeaders },
      payloadSha256: record.payloadSha256,
      signatureValidated: record.signatureValidated,
      failureCode: record.failureCode,
      createdAt: record.createdAt,
      errorMessage: record.errorMessage,
      responseStatus: record.responseStatus
    };
  }

  private buildId(prefix: string) {
    return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }

  private buildSecret() {
    return randomUUID().replace(/-/g, "");
  }

  private maskSecret(value: string) {
    const suffix = value.slice(-4);
    return `****${suffix}`;
  }

  private signPayload(secret: string, payload: string) {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  private verifySignature(input: {
    endpoint: EndpointRecord;
    requestHeaders: Record<string, string>;
    rawBody: string;
    nowEpochSeconds: number;
  }): { ok: boolean; reason?: string } {
    const webhookId = input.requestHeaders["X-Webhook-Id"];
    const signatureHeader = input.requestHeaders["X-Webhook-Signature"];
    const keyId = input.requestHeaders["X-Webhook-Key-Id"];
    const timestampRaw = input.requestHeaders["X-Webhook-Timestamp"];

    if (!webhookId || !signatureHeader || !keyId || !timestampRaw) {
      return { ok: false, reason: "missing required webhook signature headers" };
    }

    const timestamp = Number.parseInt(timestampRaw, 10);
    if (!Number.isInteger(timestamp)) {
      return { ok: false, reason: "invalid timestamp" };
    }
    if (Math.abs(input.nowEpochSeconds - timestamp) > WEBHOOK_REPLAY_WINDOW_SECONDS) {
      return { ok: false, reason: "timestamp out of replay window" };
    }
    if (this.replayCacheHas(webhookId, input.nowEpochSeconds)) {
      return { ok: false, reason: "replayed webhook id" };
    }

    const secret = input.endpoint.secretByKeyId[keyId];
    if (!secret) {
      return { ok: false, reason: "unknown key id" };
    }

    const expected = `${WEBHOOK_SIGNATURE_VERSION}=${this.signPayload(secret, `${timestampRaw}.${input.rawBody}`)}`;
    if (!this.safeCompare(signatureHeader, expected)) {
      return { ok: false, reason: "signature mismatch" };
    }

    this.replayCache.set(webhookId, input.nowEpochSeconds + WEBHOOK_REPLAY_CACHE_TTL_SECONDS);
    this.cleanupReplayCache(input.nowEpochSeconds);
    return { ok: true };
  }

  private safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.byteLength !== rightBuffer.byteLength) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private replayCacheHas(webhookId: string, nowEpochSeconds: number) {
    const expiresAt = this.replayCache.get(webhookId);
    return typeof expiresAt === "number" && expiresAt > nowEpochSeconds;
  }

  private cleanupReplayCache(nowEpochSeconds: number) {
    if (this.replayCache.size < 1000) {
      return;
    }
    for (const [key, expiresAt] of this.replayCache.entries()) {
      if (expiresAt <= nowEpochSeconds) {
        this.replayCache.delete(key);
      }
    }
  }
}

function normalizeEvents(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeSecretMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      [DEFAULT_KEY_ID]: randomUUID().replace(/-/g, "")
    };
  }

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.length > 0) {
      result[key] = item;
    }
  }

  if (Object.keys(result).length === 0) {
    result[DEFAULT_KEY_ID] = randomUUID().replace(/-/g, "");
  }
  return result;
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      output[key] = item;
    }
  }
  return output;
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

function normalizeDeliveryStatus(value: string): DeliveryStatus {
  return value === "SUCCESS" ? "SUCCESS" : "FAILED";
}

function normalizeFailureCode(value: string | null): DeliveryFailureCode | undefined {
  if (
    value === "SIMULATED_DISPATCH_FAILURE" ||
    value === "SIGNATURE_VERIFY_FAILED" ||
    value === "DISPATCH_HTTP_NON_2XX" ||
    value === "DISPATCH_TIMEOUT" ||
    value === "DISPATCH_NETWORK_ERROR" ||
    value === "DISPATCH_SECRET_MISSING" ||
    value === "DISPATCH_PAYLOAD_BUILD_FAILED"
  ) {
    return value;
  }
  return undefined;
}
