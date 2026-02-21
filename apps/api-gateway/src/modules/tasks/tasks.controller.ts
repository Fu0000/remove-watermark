import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict, forbidden, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { QuotaExceededError, TasksService } from "./tasks.service";
import type { TaskPolicy } from "@packages/contracts";

interface CreateTaskRequest {
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy?: TaskPolicy;
}

interface UpsertMaskRequest {
  imageWidth: number;
  imageHeight: number;
  polygons: number[][][];
  brushStrokes: number[][][];
  version: number;
}

@Controller("v1/tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(200)
  async createTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() body: CreateTaskRequest
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    if (!body.assetId || !body.mediaType) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    let result: Awaited<ReturnType<TasksService["createTask"]>>;
    try {
      result = await this.tasksService.createTask("u_1001", idempotencyKey, body);
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        forbidden(40302, `配额不足（quota=${error.quotaTotal}, used=${error.usedUnits}）`, requestIdHeader);
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
    ensureAuthorization(authorization, requestIdHeader);
    const items = await this.tasksService.listByUser("u_1001");

    return ok(
      {
        items,
        page: 1,
        pageSize: 20,
        total: items.length
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
    ensureAuthorization(authorization, requestIdHeader);

    const task = await this.tasksService.getByUser("u_1001", taskId);
    if (!task) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    return ok(task, requestIdHeader);
  }

  @Post(":taskId/retry")
  @HttpCode(200)
  async retryTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    const result = await this.tasksService.retry("u_1001", taskId, idempotencyKey);
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
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    if (!body.imageWidth || !body.imageHeight || body.version < 0) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    const result = await this.tasksService.upsertMask("u_1001", taskId, body);
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

  @Post(":taskId/cancel")
  @HttpCode(200)
  async cancelTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    const result = await this.tasksService.cancel("u_1001", taskId, idempotencyKey);
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
    ensureAuthorization(authorization, requestIdHeader);

    const task = await this.tasksService.getByUser("u_1001", taskId);
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
        resultUrl: task.resultUrl,
        expireAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      },
      requestIdHeader
    );
  }
}
