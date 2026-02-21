import { Injectable } from "@nestjs/common";

type EndpointStatus = "ACTIVE" | "PAUSED" | "DELETED";
type DeliveryStatus = "SUCCESS" | "FAILED";

interface EndpointRecord {
  endpointId: string;
  userId: string;
  name: string;
  url: string;
  status: EndpointStatus;
  events: string[];
  timeoutMs: number;
  maxRetries: number;
  secret: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface DeliveryRecord {
  deliveryId: string;
  userId: string;
  endpointId: string;
  eventType: string;
  status: DeliveryStatus;
  attempt: number;
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
  eventType: string;
  status: DeliveryStatus;
  attempt: number;
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

  async createEndpoint(userId: string, input: CreateEndpointInput) {
    const now = new Date().toISOString();
    const endpointId = this.buildId("wh_ep");
    const secret = this.buildSecret();
    const record: EndpointRecord = {
      endpointId,
      userId,
      name: input.name,
      url: input.url,
      status: "ACTIVE",
      events: [...input.events],
      timeoutMs: input.timeoutMs,
      maxRetries: input.maxRetries,
      secret,
      createdAt: now,
      updatedAt: now
    };
    this.endpoints.set(endpointId, record);

    return {
      endpointId,
      status: record.status,
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
    const shouldFail = endpoint.status !== "ACTIVE" || endpoint.url.includes("fail");
    const record: DeliveryRecord = {
      deliveryId: this.buildId("wh_dl"),
      userId: endpoint.userId,
      endpointId: endpoint.endpointId,
      eventType,
      status: shouldFail ? "FAILED" : "SUCCESS",
      attempt,
      createdAt: now,
      updatedAt: now,
      errorMessage: shouldFail ? "simulated webhook dispatch failure" : undefined
    };
    this.deliveries.set(record.deliveryId, record);
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
      eventType: record.eventType,
      status: record.status,
      attempt: record.attempt,
      createdAt: record.createdAt,
      errorMessage: record.errorMessage
    };
  }

  private buildId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }

  private buildSecret() {
    return crypto.randomUUID().replace(/-/g, "");
  }

  private maskSecret(value: string) {
    const suffix = value.slice(-4);
    return `****${suffix}`;
  }
}
