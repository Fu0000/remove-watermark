import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, conflict, notFound, unprocessableEntity } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { TasksService } from "./tasks.service";
import type { TaskPolicy } from "@packages/contracts";

interface CreateTaskRequest {
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy?: TaskPolicy;
}

@Controller("v1/tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(200)
  createTask(
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

    const result = this.tasksService.createTask("u_1001", idempotencyKey, body);

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
  listTasks(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    return ok(
      {
        items: this.tasksService.listByUser("u_1001"),
        page: 1,
        pageSize: 20,
        total: this.tasksService.listByUser("u_1001").length
      },
      requestIdHeader
    );
  }

  @Get(":taskId")
  getTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    const task = this.tasksService.getByUser("u_1001", taskId);
    if (!task) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    return ok(task, requestIdHeader);
  }

  @Post(":taskId/retry")
  @HttpCode(200)
  retryTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    const task = this.tasksService.retry("u_1001", taskId);
    if (!task) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    if (task.status !== "QUEUED") {
      unprocessableEntity(42201, "状态机非法迁移", requestIdHeader);
    }

    return ok(
      {
        taskId: task.taskId,
        status: task.status
      },
      requestIdHeader
    );
  }

  @Post(":taskId/cancel")
  @HttpCode(200)
  cancelTask(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    if (!idempotencyKey) {
      badRequest(40001, "Idempotency-Key is required", requestIdHeader);
    }

    const before = this.tasksService.getByUser("u_1001", taskId);
    if (!before) {
      notFound(40401, "资源不存在", requestIdHeader);
    }

    const task = this.tasksService.cancel("u_1001", taskId)!;
    if (task.status !== "CANCELED") {
      unprocessableEntity(42201, "状态机非法迁移", requestIdHeader);
    }

    return ok(
      {
        taskId: task.taskId,
        status: task.status
      },
      requestIdHeader
    );
  }

  @Get(":taskId/result")
  getTaskResult(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Param("taskId") taskId: string
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    const task = this.tasksService.getByUser("u_1001", taskId);
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
