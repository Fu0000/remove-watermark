import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { WebhooksService } from "./webhooks.service";

interface CreateEndpointRequest {
  name: string;
  url: string;
  events: string[];
  timeoutMs: number;
  maxRetries: number;
}

interface UpdateEndpointRequest {
  name?: string;
  url?: string;
  events?: string[];
  status?: "ACTIVE" | "PAUSED";
  timeoutMs?: number;
  maxRetries?: number;
}

const MAX_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 10;

@Controller("v1/webhooks")
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooksService: WebhooksService) {}

  @Post("endpoints")
  @HttpCode(200)
  async createEndpoint(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() body: CreateEndpointRequest
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    this.assertCreatePayload(body, requestIdHeader);

    const result = await this.webhooksService.createEndpoint("u_1001", body);
    return ok(result, requestIdHeader);
  }

  @Get("endpoints")
  async listEndpoints(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    const result = await this.webhooksService.listEndpoints("u_1001");
    return ok(result, requestIdHeader);
  }

  @Patch("endpoints/:endpointId")
  @HttpCode(200)
  async updateEndpoint(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("endpointId") endpointId: string,
    @Body() body: UpdateEndpointRequest
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!endpointId) {
      badRequest(40001, "参数非法：endpointId", requestIdHeader);
    }
    this.assertUpdatePayload(body, requestIdHeader);

    const result = await this.webhooksService.updateEndpoint("u_1001", endpointId, body);
    if (!result) {
      notFound(40401, "资源不存在：endpoint", requestIdHeader);
    }

    return ok(result, requestIdHeader);
  }

  @Delete("endpoints/:endpointId")
  @HttpCode(200)
  async deleteEndpoint(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("endpointId") endpointId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!endpointId) {
      badRequest(40001, "参数非法：endpointId", requestIdHeader);
    }

    const deleted = await this.webhooksService.deleteEndpoint("u_1001", endpointId);
    if (!deleted) {
      notFound(40401, "资源不存在：endpoint", requestIdHeader);
    }

    return ok(
      {
        endpointId,
        status: "DELETED"
      },
      requestIdHeader
    );
  }

  @Post("endpoints/:endpointId/test")
  @HttpCode(200)
  async sendTest(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("endpointId") endpointId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!endpointId) {
      badRequest(40001, "参数非法：endpointId", requestIdHeader);
    }

    const result = await this.webhooksService.sendTestDelivery("u_1001", endpointId);
    if (!result) {
      notFound(40401, "资源不存在：endpoint", requestIdHeader);
    }

    return ok(result, requestIdHeader);
  }

  @Get("deliveries")
  async listDeliveries(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Query("endpointId") endpointId: string | undefined,
    @Query("eventType") eventType: string | undefined,
    @Query("status") status: string | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    const normalizedStatus = this.parseDeliveryStatus(status, requestIdHeader);
    const normalizedPage = this.parsePositiveInt(page, 1, "page", requestIdHeader);
    const normalizedPageSize = this.parsePositiveInt(pageSize, 20, "pageSize", requestIdHeader);

    const result = await this.webhooksService.listDeliveries("u_1001", {
      endpointId,
      eventType,
      status: normalizedStatus,
      page: normalizedPage,
      pageSize: normalizedPageSize
    });
    return ok(result, requestIdHeader);
  }

  @Post("deliveries/:deliveryId/retry")
  @HttpCode(200)
  async retryDelivery(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("deliveryId") deliveryId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!deliveryId) {
      badRequest(40001, "参数非法：deliveryId", requestIdHeader);
    }

    const retried = await this.webhooksService.retryDelivery("u_1001", deliveryId);
    if (retried.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在：delivery", requestIdHeader);
    }
    if (retried.kind === "ENDPOINT_NOT_FOUND") {
      notFound(40401, "资源不存在：endpoint", requestIdHeader);
    }
    if (retried.kind === "INVALID_STATUS") {
      unprocessableEntity(42201, `状态机非法迁移：当前状态=${retried.status}`, requestIdHeader);
    }

    return ok({ deliveryId: retried.deliveryId }, requestIdHeader);
  }

  private assertCreatePayload(body: CreateEndpointRequest, requestIdHeader?: string) {
    if (!body.name || body.name.trim().length === 0) {
      badRequest(40001, "参数非法：name", requestIdHeader);
    }
    this.assertUrl(body.url, requestIdHeader);
    this.assertEvents(body.events, requestIdHeader);
    this.assertTimeoutMs(body.timeoutMs, requestIdHeader);
    this.assertMaxRetries(body.maxRetries, requestIdHeader);
  }

  private assertUpdatePayload(body: UpdateEndpointRequest, requestIdHeader?: string) {
    if (!body || Object.keys(body).length === 0) {
      badRequest(40001, "参数非法：empty patch body", requestIdHeader);
    }
    if (body.name !== undefined && body.name.trim().length === 0) {
      badRequest(40001, "参数非法：name", requestIdHeader);
    }
    if (body.url !== undefined) {
      this.assertUrl(body.url, requestIdHeader);
    }
    if (body.events !== undefined) {
      this.assertEvents(body.events, requestIdHeader);
    }
    if (body.status !== undefined && body.status !== "ACTIVE" && body.status !== "PAUSED") {
      badRequest(40001, "参数非法：status", requestIdHeader);
    }
    if (body.timeoutMs !== undefined) {
      this.assertTimeoutMs(body.timeoutMs, requestIdHeader);
    }
    if (body.maxRetries !== undefined) {
      this.assertMaxRetries(body.maxRetries, requestIdHeader);
    }
  }

  private assertUrl(url: string, requestIdHeader?: string) {
    if (!url) {
      badRequest(40001, "参数非法：url", requestIdHeader);
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        badRequest(40001, "参数非法：url", requestIdHeader);
      }
    } catch {
      badRequest(40001, "参数非法：url", requestIdHeader);
    }
  }

  private assertEvents(events: string[], requestIdHeader?: string) {
    if (!Array.isArray(events) || events.length === 0) {
      badRequest(40001, "参数非法：events", requestIdHeader);
    }
    if (events.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      badRequest(40001, "参数非法：events", requestIdHeader);
    }
  }

  private assertTimeoutMs(timeoutMs: number, requestIdHeader?: string) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
      badRequest(40001, "参数非法：timeoutMs", requestIdHeader);
    }
  }

  private assertMaxRetries(maxRetries: number, requestIdHeader?: string) {
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_RETRIES) {
      badRequest(40001, "参数非法：maxRetries", requestIdHeader);
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number, field: string, requestIdHeader?: string) {
    if (value === undefined || value.length === 0) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      badRequest(40001, `参数非法：${field}`, requestIdHeader);
    }
    return parsed;
  }

  private parseDeliveryStatus(value: string | undefined, requestIdHeader?: string): "SUCCESS" | "FAILED" | undefined {
    if (!value) {
      return undefined;
    }
    if (value !== "SUCCESS" && value !== "FAILED") {
      badRequest(40001, "参数非法：status", requestIdHeader);
    }
    return value;
  }
}
