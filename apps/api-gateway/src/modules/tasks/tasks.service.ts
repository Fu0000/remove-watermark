import { Injectable } from "@nestjs/common";
import type { TaskPolicy, TaskStatus } from "@packages/contracts";

export interface CreateTaskInput {
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy?: TaskPolicy;
}

export interface TaskRecord {
  taskId: string;
  userId: string;
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy: TaskPolicy;
  status: TaskStatus;
  progress: number;
  errorCode?: string;
  errorMessage?: string;
  resultUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface IdempotencyRecord {
  payloadHash: string;
  taskId: string;
}

const CANCELABLE_STATUS = new Set<TaskStatus>(["QUEUED", "PREPROCESSING", "DETECTING"]);

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  createTask(userId: string, idempotencyKey: string, input: CreateTaskInput): { task: TaskRecord; created: boolean } {
    const payloadHash = JSON.stringify(input);
    const existing = this.idempotency.get(`${userId}:${idempotencyKey}`);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return {
          task: this.tasks.get(existing.taskId) as TaskRecord,
          created: false
        };
      }

      return {
        task: this.tasks.get(existing.taskId) as TaskRecord,
        created: false
      };
    }

    const now = new Date().toISOString();
    const taskId = `tsk_${Date.now()}`;
    const task: TaskRecord = {
      taskId,
      userId,
      assetId: input.assetId,
      mediaType: input.mediaType,
      taskPolicy: input.taskPolicy || "FAST",
      status: "QUEUED",
      progress: 0,
      createdAt: now,
      updatedAt: now
    };

    this.tasks.set(taskId, task);
    this.idempotency.set(`${userId}:${idempotencyKey}`, {
      payloadHash,
      taskId
    });

    return { task, created: true };
  }

  listByUser(userId: string): TaskRecord[] {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getByUser(userId: string, taskId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }

    return task;
  }

  cancel(userId: string, taskId: string): TaskRecord | undefined {
    const task = this.getByUser(userId, taskId);
    if (!task) {
      return undefined;
    }

    if (!CANCELABLE_STATUS.has(task.status)) {
      return task;
    }

    task.status = "CANCELED";
    task.progress = 0;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  retry(userId: string, taskId: string): TaskRecord | undefined {
    const task = this.getByUser(userId, taskId);
    if (!task) {
      return undefined;
    }

    if (task.status !== "FAILED") {
      return task;
    }

    task.status = "QUEUED";
    task.progress = 0;
    task.errorCode = undefined;
    task.errorMessage = undefined;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  seedFailedTask(userId: string, taskId: string): void {
    const now = new Date().toISOString();
    this.tasks.set(taskId, {
      taskId,
      userId,
      assetId: "ast_failed",
      mediaType: "IMAGE",
      taskPolicy: "FAST",
      status: "FAILED",
      progress: 100,
      errorCode: "50001",
      errorMessage: "model timeout",
      createdAt: now,
      updatedAt: now
    });
  }
}
