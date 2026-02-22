import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type { TaskStatus } from "@packages/contracts";
import { ensureAdminPermission } from "../../common/admin-rbac";
import { badRequest, conflict, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { TASK_STATUS } from "../../common/task-status";
import { ComplianceService } from "../compliance/compliance.service";
import { PlansService } from "../plans/plans.service";
import { TasksService } from "../tasks/tasks.service";
import { WebhooksService } from "../webhooks/webhooks.service";

interface ReplayTaskRequest {
  reason: string;
}

interface CreatePlanRequest {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
  isActive?: boolean;
}

interface UpdatePlanRequest {
  name?: string;
  price?: number;
  monthlyQuota?: number;
  features?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

@Controller("admin")
export class AdminController {
  constructor(
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(PlansService) private readonly plansService: PlansService,
    @Inject(ComplianceService) private readonly complianceService: ComplianceService,
    @Inject(WebhooksService) private readonly webhooksService: WebhooksService
  ) {}

  @Get("tasks")
  async listTasks(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Query("taskId") taskId: string | undefined,
    @Query("userId") userId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined
  ) {
    ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:task:read",
      requestId: requestIdHeader
    });

    const normalizedStatus = parseTaskStatus(status, requestIdHeader);
    validateDateTime("from", from, requestIdHeader);
    validateDateTime("to", to, requestIdHeader);

    const result = await this.tasksService.listForAdmin({
      taskId: taskId || undefined,
      userId: userId || undefined,
      status: normalizedStatus,
      from: from || undefined,
      to: to || undefined,
      page: parsePositiveInt(pageRaw, 1, "page", requestIdHeader),
      pageSize: parsePositiveInt(pageSizeRaw, 20, "pageSize", requestIdHeader)
    });

    return ok(result, requestIdHeader);
  }

  @Post("tasks/:taskId/replay")
  @HttpCode(200)
  async replayTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Param("taskId") taskId: string,
    @Body() body: ReplayTaskRequest
  ) {
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:task:replay",
      requestId: requestIdHeader
    });

    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }
    if (!taskId) {
      badRequest(40001, "参数非法：taskId", requestIdHeader);
    }
    const reason = (body.reason || "").trim();
    if (!reason) {
      badRequest(40001, "参数非法：reason", requestIdHeader);
    }

    const existing = await this.tasksService.getByTaskId(taskId, { advance: false });
    if (!existing) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const result = await this.tasksService.retry(existing.userId, taskId, idempotencyKey);
    if (result.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在", requestIdHeader);
    }
    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }
    if (result.kind === "INVALID_TRANSITION") {
      unprocessableEntity(42201, "状态机非法迁移", requestIdHeader);
    }

    await this.complianceService.appendAdminAuditLog(existing.userId, {
      action: "admin.task.replay",
      resourceType: "task",
      resourceId: taskId,
      role,
      reason,
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent
    });

    return ok(
      {
        taskId: result.taskId,
        status: result.status
      },
      requestIdHeader
    );
  }

  @Get("plans")
  async listPlans(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Query("keyword") keyword: string | undefined,
    @Query("isActive") isActiveRaw: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined
  ) {
    ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:plan:read",
      requestId: requestIdHeader
    });

    const result = await this.plansService.listPlansForAdmin({
      keyword: keyword || undefined,
      isActive: parseBoolean(isActiveRaw, "isActive", requestIdHeader),
      page: parsePositiveInt(pageRaw, 1, "page", requestIdHeader),
      pageSize: parsePositiveInt(pageSizeRaw, 20, "pageSize", requestIdHeader)
    });

    return ok(result, requestIdHeader);
  }

  @Get("webhooks/deliveries")
  async listWebhookDeliveries(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Query("userId") userIdRaw: string | undefined,
    @Query("endpointId") endpointId: string | undefined,
    @Query("eventType") eventType: string | undefined,
    @Query("status") status: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined
  ) {
    ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:webhook:read",
      requestId: requestIdHeader
    });

    const result = await this.webhooksService.listDeliveries(parseAdminUserId(userIdRaw, requestIdHeader), {
      endpointId: endpointId || undefined,
      eventType: eventType || undefined,
      status: parseDeliveryStatus(status, requestIdHeader),
      page: parsePositiveInt(pageRaw, 1, "page", requestIdHeader),
      pageSize: parsePositiveInt(pageSizeRaw, 20, "pageSize", requestIdHeader)
    });

    return ok(result, requestIdHeader);
  }

  @Post("webhooks/deliveries/:deliveryId/retry")
  @HttpCode(200)
  async retryWebhookDelivery(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Param("deliveryId") deliveryId: string,
    @Query("userId") userIdRaw: string | undefined
  ) {
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:webhook:retry",
      requestId: requestIdHeader
    });

    if (!deliveryId) {
      badRequest(40001, "参数非法：deliveryId", requestIdHeader);
    }

    const userId = parseAdminUserId(userIdRaw, requestIdHeader);
    const retried = await this.webhooksService.retryDelivery(userId, deliveryId);

    if (retried.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在：delivery", requestIdHeader);
    }
    if (retried.kind === "ENDPOINT_NOT_FOUND") {
      notFound(40401, "资源不存在：endpoint", requestIdHeader);
    }
    if (retried.kind === "INVALID_STATUS") {
      unprocessableEntity(42201, `状态机非法迁移：当前状态=${retried.status}`, requestIdHeader);
    }

    await this.complianceService.appendAdminAuditLog(userId, {
      action: "admin.webhook.retry",
      resourceType: "webhook_delivery",
      resourceId: deliveryId,
      role,
      reason: `retry ${deliveryId}`,
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent,
      meta: {
        retriedDeliveryId: retried.deliveryId
      }
    });

    return ok({ deliveryId: retried.deliveryId }, requestIdHeader);
  }

  @Post("plans")
  @HttpCode(200)
  async createPlan(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Body() body: CreatePlanRequest
  ) {
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:plan:write",
      requestId: requestIdHeader
    });

    assertCreatePlanPayload(body, requestIdHeader);
    const result = await this.plansService.createPlan({
      planId: body.planId,
      name: body.name,
      price: body.price,
      monthlyQuota: body.monthlyQuota,
      features: body.features,
      sortOrder: body.sortOrder,
      isActive: body.isActive ?? true
    });

    if (result === "CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    await this.complianceService.appendAdminAuditLog("admin_console", {
      action: "admin.plan.create",
      resourceType: "plan",
      resourceId: result.planId,
      role,
      reason: `create ${result.planId}`,
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent,
      meta: {
        name: result.name,
        monthlyQuota: result.monthlyQuota,
        price: result.price
      }
    });

    return ok(result, requestIdHeader);
  }

  @Patch("plans/:planId")
  @HttpCode(200)
  async updatePlan(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Param("planId") planId: string,
    @Body() body: UpdatePlanRequest
  ) {
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:plan:write",
      requestId: requestIdHeader
    });

    if (!planId) {
      badRequest(40001, "参数非法：planId", requestIdHeader);
    }
    assertUpdatePlanPayload(body, requestIdHeader);

    const result = await this.plansService.updatePlan(planId, body);
    if (result === undefined) {
      notFound(40401, "资源不存在", requestIdHeader);
    }
    if (result === "CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    await this.complianceService.appendAdminAuditLog("admin_console", {
      action: "admin.plan.update",
      resourceType: "plan",
      resourceId: planId,
      role,
      reason: `update ${planId}`,
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent,
      meta: body as Record<string, unknown>
    });

    return ok(result, requestIdHeader);
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number, field: string, requestIdHeader?: string): number {
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    badRequest(40001, `参数非法：${field}`, requestIdHeader);
  }
  return value;
}

function parseTaskStatus(raw: string | undefined, requestIdHeader?: string): TaskStatus | undefined {
  if (!raw) {
    return undefined;
  }
  if (!TASK_STATUS.includes(raw as TaskStatus)) {
    badRequest(40001, "参数非法：status", requestIdHeader);
  }
  return raw as TaskStatus;
}

function parseBoolean(raw: string | undefined, field: string, requestIdHeader?: string): boolean | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  badRequest(40001, `参数非法：${field}`, requestIdHeader);
}

function parseDeliveryStatus(raw: string | undefined, requestIdHeader?: string): "SUCCESS" | "FAILED" | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw === "SUCCESS" || raw === "FAILED") {
    return raw;
  }
  badRequest(40001, "参数非法：status", requestIdHeader);
}

function parseAdminUserId(raw: string | undefined, requestIdHeader?: string): string {
  if (!raw) {
    return "u_1001";
  }
  const value = raw.trim();
  if (!value) {
    badRequest(40001, "参数非法：userId", requestIdHeader);
  }
  return value;
}

function validateDateTime(field: string, raw: string | undefined, requestIdHeader?: string) {
  if (!raw) {
    return;
  }
  if (Number.isNaN(new Date(raw).getTime())) {
    badRequest(40001, `参数非法：${field}`, requestIdHeader);
  }
}

function parseForwardedIp(forwardedFor: string | undefined): string | undefined {
  if (!forwardedFor) {
    return undefined;
  }

  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

function assertCreatePlanPayload(body: CreatePlanRequest, requestIdHeader?: string) {
  if (!body.planId || !body.name) {
    badRequest(40001, "参数非法", requestIdHeader);
  }
  if (!Number.isInteger(body.price) || body.price < 0) {
    badRequest(40001, "参数非法：price", requestIdHeader);
  }
  if (!Number.isInteger(body.monthlyQuota) || body.monthlyQuota < 0) {
    badRequest(40001, "参数非法：monthlyQuota", requestIdHeader);
  }
  if (!Number.isInteger(body.sortOrder)) {
    badRequest(40001, "参数非法：sortOrder", requestIdHeader);
  }
  if (!Array.isArray(body.features) || body.features.some((item) => typeof item !== "string")) {
    badRequest(40001, "参数非法：features", requestIdHeader);
  }
}

function assertUpdatePlanPayload(body: UpdatePlanRequest, requestIdHeader?: string) {
  if (!body || Object.keys(body).length === 0) {
    badRequest(40001, "参数非法：empty patch body", requestIdHeader);
  }
  if (body.name !== undefined && body.name.trim().length === 0) {
    badRequest(40001, "参数非法：name", requestIdHeader);
  }
  if (body.price !== undefined && (!Number.isInteger(body.price) || body.price < 0)) {
    badRequest(40001, "参数非法：price", requestIdHeader);
  }
  if (body.monthlyQuota !== undefined && (!Number.isInteger(body.monthlyQuota) || body.monthlyQuota < 0)) {
    badRequest(40001, "参数非法：monthlyQuota", requestIdHeader);
  }
  if (body.sortOrder !== undefined && !Number.isInteger(body.sortOrder)) {
    badRequest(40001, "参数非法：sortOrder", requestIdHeader);
  }
  if (body.features !== undefined && (!Array.isArray(body.features) || body.features.some((item) => typeof item !== "string"))) {
    badRequest(40001, "参数非法：features", requestIdHeader);
  }
}
