import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

type EndpointStatus = "ACTIVE" | "PAUSED" | "DELETED";
type DeliveryStatus = "SUCCESS" | "FAILED";
type DeliveryFailureCode = "SIMULATED_DISPATCH_FAILURE" | "SIGNATURE_VERIFY_FAILED";

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

  async createEndpoint(userId: string, input: CreateEndpointInput) {
    const now = new Date().toISOString();
    const endpointId = this.buildId("wh_ep");
    const secret = this.buildSecret();
    const activeKeyId = DEFAULT_KEY_ID;
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
      secretByKeyId: {
        [activeKeyId]: secret
      },
      createdAt: now,
      updatedAt: now
    };
    this.endpoints.set(endpointId, record);

    return {
      endpointId,
      status: record.status,
      keyId: activeKeyId,
      secretHint: this.maskSecret(secret)
    };
  }

  async listEndpoints(userId: string): Promise<EndpointView[]> {
    return [...this.endpoints.values()]
      .filter((item) => item.userId === userId && item.status !== "DELETED")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => this.toEndpointView(item));
  }

  async updateEndpoint(userId: string, endpointId: string, input: UpdateEndpointInput): Promise<EndpointView | undefined> {
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
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint || endpoint.userId !== userId || endpoint.status === "DELETED") {
      return undefined;
    }

    const created = this.createDelivery(endpoint, "webhook.test", 1);
    return { deliveryId: created.deliveryId };
  }

  async listDeliveries(userId: string, input: ListDeliveriesInput) {
    const filtered = [...this.deliveries.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => !input.endpointId || item.endpointId === input.endpointId)
      .filter((item) => !input.eventType || item.eventType === input.eventType)
      .filter((item) => !input.status || item.status === input.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const total = filtered.length;
    const offset = (input.page - 1) * input.pageSize;
    const items = filtered.slice(offset, offset + input.pageSize).map((item) => this.toDeliveryView(item));

    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      items
    };
  }

  async retryDelivery(userId: string, deliveryId: string): Promise<RetryResult> {
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

    const retried = this.createDelivery(endpoint, delivery.eventType, delivery.attempt + 1);
    return {
      kind: "SUCCESS",
      deliveryId: retried.deliveryId
    };
  }

  private createDelivery(endpoint: EndpointRecord, eventType: string, attempt: number): DeliveryRecord {
    const now = new Date().toISOString();
    const createdAt = new Date(now);
    const eventId = this.buildId("evt");
    const deliveryId = this.buildId("wh_dl");
    const traceId = this.buildId("req");
    const payload = {
      eventId,
      eventType,
      version: 1,
      occurredAt: now,
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
    const timestamp = Math.floor(createdAt.getTime() / 1000).toString();
    const signature = this.signPayload(endpoint.secretByKeyId[endpoint.activeKeyId], `${timestamp}.${rawBody}`);
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
    const shouldFail = Boolean(failureCode);

    const record: DeliveryRecord = {
      deliveryId,
      userId: endpoint.userId,
      endpointId: endpoint.endpointId,
      eventId,
      eventType,
      status: shouldFail ? "FAILED" : "SUCCESS",
      attempt,
      requestHeaders,
      payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
      signatureValidated: verified.ok,
      failureCode,
      createdAt: now,
      updatedAt: now,
      errorMessage: simulatedDispatchFailure
        ? "simulated webhook dispatch failure"
        : verified.ok
          ? undefined
          : `signature verification failed: ${verified.reason}`
    };
    this.deliveries.set(record.deliveryId, record);
    this.cleanupReplayCache(Number.parseInt(timestamp, 10));
    return record;
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
      errorMessage: record.errorMessage
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
