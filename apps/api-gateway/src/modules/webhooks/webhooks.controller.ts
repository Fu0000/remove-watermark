import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { parseRequestBody } from "../../common/request-validation";
import type { WebhookScope } from "./webhooks.service";
import { WebhooksService } from "./webhooks.service";
import { z } from "zod";

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
const HttpUrlSchema = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
});

const CreateEndpointRequestSchema = z.object({
  name: z.string().trim().min(1),
  url: HttpUrlSchema,
  events: z.array(z.string().trim().min(1)).min(1),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS),
  maxRetries: z.number().int().min(0).max(MAX_RETRIES)
});

const UpdateEndpointRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    url: HttpUrlSchema.optional(),
    events: z.array(z.string().trim().min(1)).min(1).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
    maxRetries: z.number().int().min(0).max(MAX_RETRIES).optional()
  })
  .refine((payload) => Object.keys(payload).length > 0);

@Controller("v1/webhooks")
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooksService: WebhooksService) {}

  @Post("endpoints")
  @HttpCode(200)
  async createEndpoint(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-tenant-id") tenantIdHeader: string | undefined,
    @Body() rawBody: CreateEndpointRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const body = parseRequestBody(CreateEndpointRequestSchema, rawBody, requestIdHeader);

    const result = await this.webhooksService.createEndpoint(auth.userId, body, {
      tenantId: normalizeTenantIdHeader(tenantIdHeader) || auth.tenantId
    });
    return ok(result, requestIdHeader);
  }

  @Get("endpoints")
  async listEndpoints(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const result = await this.webhooksService.listEndpoints(auth.userId);
    return ok(result, requestIdHeader);
  }

  @Patch("endpoints/:endpointId")
  @HttpCode(200)
  async updateEndpoint(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("endpointId") endpointId: string,
    @Body() rawBody: UpdateEndpointRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const body = parseRequestBody(UpdateEndpointRequestSchema, rawBody, requestIdHeader);
    if (!endpointId) {
      badRequest(40001, "参数非法：endpointId", requestIdHeader);
    }

    const result = await this.webhooksService.updateEndpoint(auth.userId, endpointId, body);
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
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!endpointId) {
      badRequest(40001, "参数非法：endpointId", requestIdHeader);
    }

    const deleted = await this.webhooksService.deleteEndpoint(auth.userId, endpointId);
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
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!endpointId) {
      badRequest(40001, "参数非法：endpointId", requestIdHeader);
    }

    const result = await this.webhooksService.sendTestDelivery(auth.userId, endpointId);
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
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const normalizedStatus = this.parseDeliveryStatus(status, requestIdHeader);
    const normalizedPage = this.parsePositiveInt(page, 1, "page", requestIdHeader);
    const normalizedPageSize = this.parsePositiveInt(pageSize, 20, "pageSize", requestIdHeader);

    const result = await this.webhooksService.listDeliveries(toUserScope(auth.userId), {
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
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!deliveryId) {
      badRequest(40001, "参数非法：deliveryId", requestIdHeader);
    }

    const retried = await this.webhooksService.retryDelivery(toUserScope(auth.userId), deliveryId);
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

function toUserScope(userId: string): WebhookScope {
  return {
    scopeType: "USER",
    scopeId: userId
  };
}

function normalizeTenantIdHeader(raw: string | undefined) {
  const value = (raw || "").trim();
  return value.length > 0 ? value : undefined;
}
