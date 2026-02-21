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

interface GetTaskOptions {
  advance?: boolean;
}

interface TaskMaskRecord {
  taskId: string;
  maskId: string;
  version: number;
  polygons: number[][][];
  brushStrokes: number[][][];
  updatedAt: string;
}

export interface UpsertMaskInput {
  imageWidth: number;
  imageHeight: number;
  polygons: number[][][];
  brushStrokes: number[][][];
  version: number;
}

const CANCELABLE_STATUS = new Set<TaskStatus>(["QUEUED", "PREPROCESSING", "DETECTING"]);
const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly taskMasks = new Map<string, TaskMaskRecord>();

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
    const tasks = [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    tasks.forEach((task) => this.maybeAdvanceForSimulation(task));
    return tasks;
  }

  getByUser(userId: string, taskId: string, options: GetTaskOptions = {}): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }

    if (options.advance !== false) {
      this.maybeAdvanceForSimulation(task);
    }
    return task;
  }

  cancel(userId: string, taskId: string): TaskRecord | undefined {
    const task = this.getByUser(userId, taskId, { advance: false });
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
    const task = this.getByUser(userId, taskId, { advance: false });
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

  upsertMask(
    userId: string,
    taskId: string,
    input: UpsertMaskInput
  ): { conflict: false; maskId: string; version: number } | { conflict: true; version: number } | undefined {
    const task = this.getByUser(userId, taskId, { advance: false });
    if (!task) {
      return undefined;
    }

    const currentMask = this.taskMasks.get(taskId);
    if (currentMask && input.version !== currentMask.version) {
      return {
        conflict: true,
        version: currentMask.version
      };
    }

    const nextVersion = currentMask ? currentMask.version + 1 : input.version + 1;
    const maskId = currentMask?.maskId || `msk_${Date.now()}`;
    const now = new Date().toISOString();

    this.taskMasks.set(taskId, {
      taskId,
      maskId,
      version: nextVersion,
      polygons: input.polygons,
      brushStrokes: input.brushStrokes,
      updatedAt: now
    });

    if (!TERMINAL_STATUS.has(task.status)) {
      task.status = "PREPROCESSING";
      task.progress = 15;
    }
    task.updatedAt = now;

    return {
      conflict: false,
      maskId,
      version: nextVersion
    };
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

  private maybeAdvanceForSimulation(task: TaskRecord) {
    if (!this.taskMasks.has(task.taskId)) {
      return;
    }

    if (TERMINAL_STATUS.has(task.status)) {
      return;
    }

    switch (task.status) {
      case "QUEUED":
        task.status = "PREPROCESSING";
        task.progress = 15;
        break;
      case "PREPROCESSING":
        task.status = "DETECTING";
        task.progress = 35;
        break;
      case "DETECTING":
        task.status = "INPAINTING";
        task.progress = 60;
        break;
      case "INPAINTING":
        task.status = "PACKAGING";
        task.progress = 85;
        break;
      case "PACKAGING":
        task.status = "SUCCEEDED";
        task.progress = 100;
        task.resultUrl = `https://minio.local/result/${task.taskId}.png`;
        break;
      default:
        break;
    }

    task.updatedAt = new Date().toISOString();
  }
}
