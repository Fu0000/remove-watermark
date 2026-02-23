import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict, forbidden, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { InvalidTaskAssetError, QuotaExceededError, TasksService } from "./tasks.service";
import type { TaskMediaType, TaskPolicy } from "@packages/contracts";
import { ComplianceService } from "../compliance/compliance.service";

interface CreateTaskRequest {
  assetId: string;
  mediaType: TaskMediaType;
  taskPolicy?: TaskPolicy;
}

interface UpsertMaskRequest {
  imageWidth: number;
  imageHeight: number;
  polygons: number[][][];
  brushStrokes: number[][][];
  version: number;
}

interface UpsertRegionsRequest {
  version: number;
  mediaType: TaskMediaType;
  schemaVersion: string;
  regions: Array<Record<string, unknown>>;
}

@Controller("v1/tasks")
export class TasksController {
  constructor(
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(ComplianceService) private readonly complianceService: ComplianceService
  ) {}

  @Post()
  @HttpCode(200)
  async createTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() body: CreateTaskRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);

    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    if (!body.assetId || !body.mediaType) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    let result: Awaited<ReturnType<TasksService["createTask"]>>;
    try {
      result = await this.tasksService.createTask(auth.userId, idempotencyKey, body);
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        forbidden(40302, `配额不足（quota=${error.quotaTotal}, used=${error.usedUnits}）`, requestIdHeader);
      }
      if (error instanceof InvalidTaskAssetError) {
        if (error.reason === "NOT_FOUND") {
          notFound(40401, "资源不存在", requestIdHeader);
        }
        if (error.reason === "FORBIDDEN") {
          forbidden(40301, "权限不足", requestIdHeader);
        }
        badRequest(40001, "参数非法：asset 与 mediaType 不匹配", requestIdHeader);
      }
      throw error;
    }

    if (!result.created) {
      const samePayload =
        result.task.assetId === body.assetId &&
        result.task.mediaType === body.mediaType &&
        result.task.taskPolicy === (body.taskPolicy || "FAST");

      if (!samePayload) {
        conflict(40901, "幂等冲突/重复任务", requestIdHeader);
      }
    }

    return ok(
      {
        taskId: result.task.taskId,
        status: result.task.status,
        input: {
          assetId: result.task.assetId,
          mediaType: result.task.mediaType,
          taskPolicy: result.task.taskPolicy
        }
      },
      requestIdHeader
    );
  }

  @Get()
  async listTasks(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const items = await this.tasksService.listByUser(auth.userId);
    const visibleItems = await this.complianceService.filterVisibleTasks(auth.userId, items);
    const waitingTaskIds = await this.tasksService.findTasksWaitingForRegions(
      auth.userId,
      visibleItems.map((item) => item.taskId)
    );
    const enhancedItems = visibleItems.map((item) =>
      waitingTaskIds.has(item.taskId)
        ? {
            ...item,
            waitReason: "WAITING_REGIONS" as const
          }
        : item
    );

    return ok(
      {
        items: enhancedItems,
        page: 1,
        pageSize: 20,
        total: enhancedItems.length
      },
      requestIdHeader
    );
  }

  @Get(":taskId")
  async getTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (await this.complianceService.isTaskDeleted(auth.userId, taskId)) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const task = await this.tasksService.getByUser(auth.userId, taskId);
    if (!task) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const waiting = await this.tasksService.isWaitingForRegions(auth.userId, taskId);
    return ok(
      waiting
        ? {
            ...task,
            waitReason: "WAITING_REGIONS"
          }
        : task,
      requestIdHeader
    );
  }

  @Post(":taskId/retry")
  @HttpCode(200)
  async retryTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }
    if (await this.complianceService.isTaskDeleted(auth.userId, taskId)) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const result = await this.tasksService.retry(auth.userId, taskId, idempotencyKey);
    if (result.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    if (result.kind === "INVALID_TRANSITION") {
      unprocessableEntity(42201, "状态机非法迁移", requestIdHeader);
    }

    return ok(
      {
        taskId: result.taskId,
        status: result.status
      },
      requestIdHeader
    );
  }

  @Post(":taskId/mask")
  @HttpCode(200)
  async upsertTaskMask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string,
    @Body() body: UpsertMaskRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }
    if (await this.complianceService.isTaskDeleted(auth.userId, taskId)) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (!body.imageWidth || !body.imageHeight || body.version < 0) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    const task = await this.tasksService.getByUser(auth.userId, taskId, { advance: false });
    if (!task) {
      notFound(40401, "资源不存在", requestIdHeader);
    }
    if (task.mediaType !== "IMAGE") {
      badRequest(40001, "仅 IMAGE 任务支持 mask 接口", requestIdHeader);
    }

    const result = await this.tasksService.upsertMask(auth.userId, taskId, body);
    if (!result) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (result.conflict) {
      conflict(40901, `版本冲突，当前版本 ${result.version}`, requestIdHeader);
    }

    return ok(
      {
        taskId,
        maskId: result.maskId,
        version: result.version
      },
      requestIdHeader
    );
  }

  @Post(":taskId/regions")
  @HttpCode(200)
  async upsertTaskRegions(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string,
    @Body() body: UpsertRegionsRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }
    if (await this.complianceService.isTaskDeleted(auth.userId, taskId)) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (!body.schemaVersion || !Array.isArray(body.regions) || body.version < 0 || !body.mediaType) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    const result = await this.tasksService.upsertRegions(auth.userId, taskId, body);
    if (!result) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (result.conflict) {
      conflict(40901, `版本冲突，当前版本 ${result.version}`, requestIdHeader);
    }

    return ok(
      {
        taskId,
        regionId: result.regionId,
        version: result.version
      },
      requestIdHeader
    );
  }

  @Post(":taskId/cancel")
  @HttpCode(200)
  async cancelTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }
    if (await this.complianceService.isTaskDeleted(auth.userId, taskId)) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const result = await this.tasksService.cancel(auth.userId, taskId, idempotencyKey);
    if (result.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    if (result.kind === "INVALID_TRANSITION") {
      unprocessableEntity(42201, "状态机非法迁移", requestIdHeader);
    }

    return ok(
      {
        taskId: result.taskId,
        status: result.status
      },
      requestIdHeader
    );
  }

  @Get(":taskId/result")
  async getTaskResult(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (await this.complianceService.isTaskDeleted(auth.userId, taskId)) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const task = await this.tasksService.getByUser(auth.userId, taskId);
    if (!task) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (task.status !== "SUCCEEDED") {
      unprocessableEntity(42201, "状态机非法迁移", requestIdHeader);
    }

    return ok(
      {
        taskId,
        status: task.status,
        resultUrl: task.resultUrl || task.resultJson?.artifacts[0]?.url,
        expireAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        artifacts: task.resultJson?.artifacts || []
      },
      requestIdHeader
    );
  }

  @Delete(":taskId")
  @HttpCode(200)
  async deleteTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Param("taskId") taskId: string
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    const result = await this.complianceService.deleteTaskView(auth.userId, taskId, idempotencyKey, {
      requestId: requestIdHeader,
      ip: parseForwardedIp(forwardedFor),
      userAgent
    });

    if (result.kind === "NOT_FOUND") {
      notFound(40401, "资源不存在", requestIdHeader);
    }
    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      conflict(40901, "幂等冲突/重复任务", requestIdHeader);
    }

    return ok(result.data, requestIdHeader);
  }
}

function parseForwardedIp(forwardedFor: string | undefined): string | undefined {
  if (!forwardedFor) {
    return undefined;
  }

  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}
