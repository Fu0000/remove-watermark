import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type { TaskStatus } from "@packages/contracts";
import { ensureAdminPermission } from "../../common/admin-rbac";
import { badRequest, conflict, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { parseForwardedIp } from "../../common/network";
import { requireIdempotencyKey } from "../../common/request-headers";
import { parseRequestBody, parseRequestParams, parseRequestQuery } from "../../common/request-validation";
import { TASK_STATUS } from "../../common/task-status";
import { ComplianceService } from "../compliance/compliance.service";
import { PlansService } from "../plans/plans.service";
import { TasksService } from "../tasks/tasks.service";
import { type WebhookScope, WebhooksService } from "../webhooks/webhooks.service";
import { z } from "zod";

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

const ReplayTaskRequestSchema = z.object({
  reason: z.string().trim().min(1)
});

const CreatePlanRequestSchema = z.object({
  planId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().int().min(0),
  monthlyQuota: z.number().int().min(0),
  features: z.array(z.string()),
  sortOrder: z.number().int(),
  isActive: z.boolean().optional()
});

const UpdatePlanRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    price: z.number().int().min(0).optional(),
    monthlyQuota: z.number().int().min(0).optional(),
    features: z.array(z.string()).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0);

const OptionalTrimmedStringSchema = z.preprocess((raw) => {
  if (typeof raw !== "string") {
    return raw;
  }
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}, z.string().min(1).optional());

const PositiveIntFromQueryWithDefault = (fallback: number) =>
  z.preprocess((raw) => {
    if (raw === undefined || raw === null || raw === "") {
      return undefined;
    }
    if (typeof raw === "number") {
      return raw;
    }
    if (typeof raw === "string") {
      return Number.parseInt(raw, 10);
    }
    return raw;
  }, z.number().int().positive().default(fallback));

const OptionalDateTimeSchema = z.preprocess((raw) => {
  if (typeof raw !== "string") {
    return raw;
  }
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}, z.string().refine((value) => !Number.isNaN(new Date(value).getTime())).optional());

const OptionalTaskStatusSchema = z.custom<TaskStatus>(
  (raw) => typeof raw === "string" && TASK_STATUS.includes(raw as TaskStatus)
).optional();

const OptionalBooleanFromQuerySchema = z.preprocess((raw) => {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return raw;
}, z.boolean().optional());

const OptionalDeliveryStatusFromQuerySchema = z.preprocess((raw) => {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw !== "string") {
    return raw;
  }
  return raw.trim().toUpperCase();
}, z.enum(["SUCCESS", "FAILED"]).optional());

const TaskIdParamSchema = z.object({
  taskId: z.string().trim().min(1)
});

const PlanIdParamSchema = z.object({
  planId: z.string().trim().min(1)
});

const DeliveryIdParamSchema = z.object({
  deliveryId: z.string().trim().min(1)
});

const ListTasksQuerySchema = z.object({
  taskId: OptionalTrimmedStringSchema,
  userId: OptionalTrimmedStringSchema,
  status: OptionalTaskStatusSchema,
  from: OptionalDateTimeSchema,
  to: OptionalDateTimeSchema,
  page: PositiveIntFromQueryWithDefault(1),
  pageSize: PositiveIntFromQueryWithDefault(20)
});

const ListPlansQuerySchema = z.object({
  keyword: OptionalTrimmedStringSchema,
  isActive: OptionalBooleanFromQuerySchema,
  page: PositiveIntFromQueryWithDefault(1),
  pageSize: PositiveIntFromQueryWithDefault(20)
});

const ListWebhookDeliveriesQuerySchema = z.object({
  scopeType: OptionalTrimmedStringSchema,
  scopeId: OptionalTrimmedStringSchema,
  userId: OptionalTrimmedStringSchema,
  tenantId: OptionalTrimmedStringSchema,
  endpointId: OptionalTrimmedStringSchema,
  eventType: OptionalTrimmedStringSchema,
  status: OptionalDeliveryStatusFromQuerySchema,
  page: PositiveIntFromQueryWithDefault(1),
  pageSize: PositiveIntFromQueryWithDefault(20)
});

const RetryWebhookDeliveryQuerySchema = z.object({
  scopeType: OptionalTrimmedStringSchema,
  scopeId: OptionalTrimmedStringSchema,
  userId: OptionalTrimmedStringSchema,
  tenantId: OptionalTrimmedStringSchema
});

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

    const query = parseRequestQuery(
      ListTasksQuerySchema,
      {
        taskId,
        userId,
        status,
        from,
        to,
        page: pageRaw,
        pageSize: pageSizeRaw
      },
      requestIdHeader
    );

    const result = await this.tasksService.listForAdmin({
      taskId: query.taskId,
      userId: query.userId,
      status: query.status,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize
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
    @Body() rawBody: ReplayTaskRequest
  ) {
    const body = parseRequestBody(ReplayTaskRequestSchema, rawBody, requestIdHeader);
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:task:replay",
      requestId: requestIdHeader
    });

    const idempotency = requireIdempotencyKey(idempotencyKey, requestIdHeader);
    const params = parseRequestParams(TaskIdParamSchema, { taskId }, requestIdHeader);
    const reason = body.reason;

    const existing = await this.tasksService.getByTaskId(params.taskId, { advance: false });
    if (!existing) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const result = await this.tasksService.retry(existing.userId, params.taskId, idempotency);
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
      resourceId: params.taskId,
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

    const query = parseRequestQuery(
      ListPlansQuerySchema,
      {
        keyword,
        isActive: isActiveRaw,
        page: pageRaw,
        pageSize: pageSizeRaw
      },
      requestIdHeader
    );

    const result = await this.plansService.listPlansForAdmin({
      keyword: query.keyword,
      isActive: query.isActive,
      page: query.page,
      pageSize: query.pageSize
    });

    return ok(result, requestIdHeader);
  }

  @Get("webhooks/deliveries")
  async listWebhookDeliveries(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-admin-role") adminRole: string | undefined,
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Query("scopeType") scopeTypeRaw: string | undefined,
    @Query("scopeId") scopeIdRaw: string | undefined,
    @Query("userId") userIdRaw: string | undefined,
    @Query("tenantId") tenantIdRaw: string | undefined,
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

    const query = parseRequestQuery(
      ListWebhookDeliveriesQuerySchema,
      {
        scopeType: scopeTypeRaw,
        scopeId: scopeIdRaw,
        userId: userIdRaw,
        tenantId: tenantIdRaw,
        endpointId,
        eventType,
        status,
        page: pageRaw,
        pageSize: pageSizeRaw
      },
      requestIdHeader
    );

    const scope = resolveWebhookScope(
      {
        scopeTypeRaw: query.scopeType,
        scopeIdRaw: query.scopeId,
        userIdRaw: query.userId,
        tenantIdRaw: query.tenantId
      },
      requestIdHeader
    );

    const result = await this.webhooksService.listDeliveries(scope, {
      endpointId: query.endpointId,
      eventType: query.eventType,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize
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
    @Query("scopeType") scopeTypeRaw: string | undefined,
    @Query("scopeId") scopeIdRaw: string | undefined,
    @Query("userId") userIdRaw: string | undefined,
    @Query("tenantId") tenantIdRaw: string | undefined
  ) {
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:webhook:retry",
      requestId: requestIdHeader
    });

    const params = parseRequestParams(DeliveryIdParamSchema, { deliveryId }, requestIdHeader);
    const query = parseRequestQuery(
      RetryWebhookDeliveryQuerySchema,
      {
        scopeType: scopeTypeRaw,
        scopeId: scopeIdRaw,
        userId: userIdRaw,
        tenantId: tenantIdRaw
      },
      requestIdHeader
    );

    const scope = resolveWebhookScope(
      {
        scopeTypeRaw: query.scopeType,
        scopeIdRaw: query.scopeId,
        userIdRaw: query.userId,
        tenantIdRaw: query.tenantId
      },
      requestIdHeader
    );
    const retried = await this.webhooksService.retryDelivery(scope, params.deliveryId);

    if (retried.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在：delivery", requestIdHeader);
    }
    if (retried.kind === "ENDPOINT_NOT_FOUND") {
      notFound(40401, "资源不存在：endpoint", requestIdHeader);
    }
    if (retried.kind === "INVALID_STATUS") {
      unprocessableEntity(42201, `状态机非法迁移：当前状态=${retried.status}`, requestIdHeader);
    }

    await this.complianceService.appendAdminAuditLog(resolveAuditSubject(scope), {
      action: "admin.webhook.retry",
      resourceType: "webhook_delivery",
      resourceId: params.deliveryId,
      role,
      reason: `retry ${deliveryId}`,
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent,
      meta: {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
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
    @Body() rawBody: CreatePlanRequest
  ) {
    const body = parseRequestBody(CreatePlanRequestSchema, rawBody, requestIdHeader);
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:plan:write",
      requestId: requestIdHeader
    });

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
    @Body() rawBody: UpdatePlanRequest
  ) {
    const body = parseRequestBody(UpdatePlanRequestSchema, rawBody, requestIdHeader);
    const role = ensureAdminPermission({
      authorization,
      role: adminRole,
      secret: adminSecret,
      permission: "admin:plan:write",
      requestId: requestIdHeader
    });

    const params = parseRequestParams(PlanIdParamSchema, { planId }, requestIdHeader);

    const result = await this.plansService.updatePlan(params.planId, body);
    if (result === undefined) {
      notFound(40401, "资源不存在", requestIdHeader);
    }
    if (result === "CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    await this.complianceService.appendAdminAuditLog("admin_console", {
      action: "admin.plan.update",
      resourceType: "plan",
      resourceId: params.planId,
      role,
      reason: `update ${params.planId}`,
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent,
      meta: body as Record<string, unknown>
    });

    return ok(result, requestIdHeader);
  }
}

function resolveWebhookScope(
  input: {
    scopeTypeRaw: string | undefined;
    scopeIdRaw: string | undefined;
    userIdRaw: string | undefined;
    tenantIdRaw: string | undefined;
  },
  requestIdHeader?: string
): WebhookScope {
  if (input.scopeTypeRaw || input.scopeIdRaw) {
    const scopeType = normalizeScopeType(input.scopeTypeRaw, requestIdHeader);
    const scopeId = parseScopeId(input.scopeIdRaw, requestIdHeader);
    return {
      scopeType,
      scopeId
    };
  }

  if (input.userIdRaw) {
    const userId = parseScopeId(input.userIdRaw, requestIdHeader);
    return {
      scopeType: "USER",
      scopeId: userId
    };
  }

  if (input.tenantIdRaw) {
    const tenantId = parseScopeId(input.tenantIdRaw, requestIdHeader);
    return {
      scopeType: "TENANT",
      scopeId: tenantId
    };
  }

  badRequest(40001, "参数非法：scopeId", requestIdHeader);
}

function normalizeScopeType(raw: string | undefined, requestIdHeader?: string): "USER" | "TENANT" {
  const normalized = (raw || "").trim().toLowerCase();
  if (normalized === "user") {
    return "USER";
  }
  if (normalized === "tenant") {
    return "TENANT";
  }
  badRequest(40001, "参数非法：scopeType", requestIdHeader);
}

function parseScopeId(raw: string | undefined, requestIdHeader?: string): string {
  const value = (raw || "").trim();
  if (!value) {
    badRequest(40001, "参数非法：scopeId", requestIdHeader);
  }
  return value;
}

function resolveAuditSubject(scope: WebhookScope) {
  if (scope.scopeType === "TENANT") {
    return `tenant:${scope.scopeId}`;
  }
  return scope.scopeId;
}
