import { BadRequestException, Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import type { TaskPolicy } from "@packages/contracts";

interface CreateTaskRequest {
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy?: TaskPolicy;
}

@Controller("v1/tasks")
export class TasksController {
  @Post()
  @HttpCode(200)
  createTask(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateTaskRequest
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 40001,
        message: "Idempotency-Key is required"
      });
    }

    return {
      code: 0,
      message: "ok",
      requestId: crypto.randomUUID(),
      data: {
        taskId: `tsk_${Date.now()}`,
        status: "QUEUED",
        input: {
          assetId: body.assetId,
          mediaType: body.mediaType,
          taskPolicy: body.taskPolicy || "FAST"
        }
      }
    };
  }
}
