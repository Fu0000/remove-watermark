import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import type { TaskPolicy, TaskStatus } from "@packages/contracts";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

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
  version: number;
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

interface UsageLedgerRecord {
  ledgerId: string;
  userId: string;
  taskId: string;
  status: "HELD" | "COMMITTED" | "RELEASED";
  source: string;
  consumeUnit: number;
  consumeAt: string;
}

interface OutboxEventRecord {
  eventId: string;
  eventType: string;
  aggregateType: "task";
  aggregateId: string;
  status: "PENDING" | "PUBLISHED" | "FAILED" | "DEAD";
  retryCount: number;
  createdAt: string;
}

export interface UpsertMaskInput {
  imageWidth: number;
  imageHeight: number;
  polygons: number[][][];
  brushStrokes: number[][][];
  version: number;
}

type TaskActionType = "CANCEL" | "RETRY";

interface TaskActionIdempotencyRecord {
  payloadHash: string;
  result: TaskActionResult;
  updatedAt: string;
}

type TaskActionResult =
  | { kind: "SUCCESS"; taskId: string; status: TaskStatus; replayed: boolean }
  | { kind: "NOT_FOUND" }
  | { kind: "INVALID_TRANSITION"; status: TaskStatus }
  | { kind: "IDEMPOTENCY_CONFLICT" };

export interface AdvanceTaskStatusInput {
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  expectedVersion: number;
  progress?: number;
  resultUrl?: string;
}

export type AdvanceTaskStatusResult =
  | { kind: "SUCCESS"; task: TaskRecord }
  | { kind: "NOT_FOUND" }
  | { kind: "FORBIDDEN" }
  | { kind: "STATUS_MISMATCH"; status: TaskStatus }
  | { kind: "VERSION_CONFLICT"; currentVersion: number }
  | { kind: "INVALID_TRANSITION"; status: TaskStatus };

interface PersistedTaskState {
  tasks: TaskRecord[];
  idempotency: Array<[string, IdempotencyRecord]>;
  actionIdempotency: Array<[string, TaskActionIdempotencyRecord]>;
  taskMasks: TaskMaskRecord[];
  usageLedgers: UsageLedgerRecord[];
  outboxEvents: OutboxEventRecord[];
}

interface TasksServiceOptions {
  disablePersistence?: boolean;
  persistenceFilePath?: string;
}

type TaskMutationResult =
  | { ok: true; task: TaskRecord }
  | { ok: false; reason: "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSITION" };

type DbTransactionClient = Prisma.TransactionClient;

const CANCELABLE_STATUS = new Set<TaskStatus>(["QUEUED", "PREPROCESSING", "DETECTING"]);
const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);
const FREE_MONTHLY_QUOTA = 20;

export class QuotaExceededError extends Error {
  readonly quotaTotal: number;
  readonly usedUnits: number;

  constructor(quotaTotal: number, usedUnits: number) {
    super("quota exceeded");
    this.name = "QuotaExceededError";
    this.quotaTotal = quotaTotal;
    this.usedUnits = usedUnits;
  }
}

const STATUS_TRANSITION_MAP: Record<TaskStatus, TaskStatus[]> = {
  UPLOADED: ["QUEUED", "FAILED", "CANCELED"],
  QUEUED: ["PREPROCESSING", "FAILED", "CANCELED"],
  PREPROCESSING: ["DETECTING", "FAILED", "CANCELED"],
  DETECTING: ["INPAINTING", "FAILED", "CANCELED"],
  INPAINTING: ["PACKAGING", "FAILED"],
  PACKAGING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: ["QUEUED"],
  CANCELED: []
};

function canTransit(from: TaskStatus, to: TaskStatus) {
  return STATUS_TRANSITION_MAP[from].includes(to);
}

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly actionIdempotency = new Map<string, TaskActionIdempotencyRecord>();
  private readonly taskMasks = new Map<string, TaskMaskRecord>();
  private readonly usageLedgers = new Map<string, UsageLedgerRecord>();
  private readonly outboxEvents = new Map<string, OutboxEventRecord>();

  private readonly persistenceEnabled: boolean;
  private readonly persistenceFilePath: string;
  private readonly prismaService?: PrismaService;
  private readonly usePrismaStore: boolean;

  constructor(options: TasksServiceOptions = {}, prismaService?: PrismaService) {
    this.prismaService = prismaService;
    const configuredPath = options.persistenceFilePath || process.env.TASKS_STATE_FILE;
    this.persistenceFilePath = configuredPath
      ? resolve(process.cwd(), configuredPath)
      : resolve(process.cwd(), ".runtime/api-gateway/tasks-state.json");
    const preferPrismaStore = process.env.TASKS_STORE === "prisma" || Boolean(process.env.DATABASE_URL);
    this.usePrismaStore =
      options.disablePersistence !== true &&
      process.env.NODE_ENV !== "test" &&
      preferPrismaStore &&
      Boolean(this.prismaService);

    this.persistenceEnabled = options.disablePersistence !== true && process.env.NODE_ENV !== "test" && !this.usePrismaStore;

    if (this.persistenceEnabled) {
      this.hydrateFromDisk();
    }
  }

  async createTask(
    userId: string,
    idempotencyKey: string,
    input: CreateTaskInput
  ): Promise<{ task: TaskRecord; created: boolean }> {
    if (this.usePrismaStore) {
      return this.createTaskWithPrisma(userId, idempotencyKey, input);
    }

    const payloadHash = JSON.stringify(input);
    const existing = this.idempotency.get(`${userId}:${idempotencyKey}`);

    if (existing) {
      const existingTask = this.tasks.get(existing.taskId);
      if (existingTask) {
        return {
          task: existingTask,
          created: false
        };
      }

      this.idempotency.delete(`${userId}:${idempotencyKey}`);
    }

    this.assertQuotaAvailableInMemory(userId);

    return this.runInTransaction(() => {
      const now = new Date().toISOString();
      const taskId = this.buildId("tsk");
      const task: TaskRecord = {
        taskId,
        userId,
        assetId: input.assetId,
        mediaType: input.mediaType,
        taskPolicy: input.taskPolicy || "FAST",
        status: "QUEUED",
        progress: 0,
        version: 1,
        createdAt: now,
        updatedAt: now
      };

      this.tasks.set(taskId, task);
      this.idempotency.set(`${userId}:${idempotencyKey}`, {
        payloadHash,
        taskId
      });

      this.appendUsageLedgerUnsafe(userId, taskId, "HELD", "task_create");
      this.appendOutboxEventUnsafe(taskId, "task.created");

      return { task, created: true };
    });
  }

  async listByUser(userId: string): Promise<TaskRecord[]> {
    if (this.usePrismaStore) {
      return this.listByUserWithPrisma(userId);
    }

    const tasks = [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    tasks.forEach((task) => this.maybeAdvanceForSimulation(task.taskId));

    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getByUser(userId: string, taskId: string, options: GetTaskOptions = {}): Promise<TaskRecord | undefined> {
    if (this.usePrismaStore) {
      return this.getByUserWithPrisma(userId, taskId, options);
    }

    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }

    if (options.advance !== false) {
      this.maybeAdvanceForSimulation(taskId);
    }

    return this.tasks.get(taskId);
  }

  async cancel(userId: string, taskId: string, idempotencyKey: string): Promise<TaskActionResult> {
    if (this.usePrismaStore) {
      return this.applyTaskActionWithPrisma(userId, taskId, idempotencyKey, "CANCEL");
    }

    return this.applyTaskAction(userId, taskId, idempotencyKey, "CANCEL");
  }

  async retry(userId: string, taskId: string, idempotencyKey: string): Promise<TaskActionResult> {
    if (this.usePrismaStore) {
      return this.applyTaskActionWithPrisma(userId, taskId, idempotencyKey, "RETRY");
    }

    return this.applyTaskAction(userId, taskId, idempotencyKey, "RETRY");
  }

  async upsertMask(
    userId: string,
    taskId: string,
    input: UpsertMaskInput
  ): Promise<{ conflict: false; maskId: string; version: number } | { conflict: true; version: number } | undefined> {
    if (this.usePrismaStore) {
      return this.upsertMaskWithPrisma(userId, taskId, input);
    }

    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }

    const currentMask = this.taskMasks.get(taskId);
    if (currentMask && input.version !== currentMask.version) {
      return {
        conflict: true,
        version: currentMask.version
      };
    }

    return this.runInTransaction(() => {
      const latestTask = this.tasks.get(taskId);
      if (!latestTask || latestTask.userId !== userId) {
        return undefined;
      }

      const activeMask = this.taskMasks.get(taskId);
      const nextVersion = activeMask ? activeMask.version + 1 : input.version + 1;
      const maskId = activeMask?.maskId || this.buildId("msk");
      const now = new Date().toISOString();

      this.taskMasks.set(taskId, {
        taskId,
        maskId,
        version: nextVersion,
        polygons: input.polygons,
        brushStrokes: input.brushStrokes,
        updatedAt: now
      });

      if (!TERMINAL_STATUS.has(latestTask.status)) {
        if (latestTask.status === "QUEUED") {
          const transitionResult = this.transitionTaskUnsafe(taskId, "PREPROCESSING", latestTask.version, {
            progress: 15
          });

          if (!transitionResult.ok) {
            return { conflict: true, version: latestTask.version };
          }
        } else {
          const updateResult = this.updateTaskUnsafe(taskId, latestTask.version, (currentTask) => {
            currentTask.progress = Math.max(currentTask.progress, 15);
          });

          if (!updateResult.ok) {
            return { conflict: true, version: latestTask.version };
          }
        }
      }

      return {
        conflict: false,
        maskId,
        version: nextVersion
      };
    });
  }

  async advanceTaskStatus(userId: string, taskId: string, input: AdvanceTaskStatusInput): Promise<AdvanceTaskStatusResult> {
    if (this.usePrismaStore) {
      return this.advanceTaskStatusWithPrisma(userId, taskId, input);
    }

    return this.runInTransaction(() => {
      const task = this.tasks.get(taskId);
      if (!task) {
        return { kind: "NOT_FOUND" };
      }

      if (task.userId !== userId) {
        return { kind: "FORBIDDEN" };
      }

      if (task.version !== input.expectedVersion) {
        return {
          kind: "VERSION_CONFLICT",
          currentVersion: task.version
        };
      }

      if (task.status !== input.fromStatus) {
        return {
          kind: "STATUS_MISMATCH",
          status: task.status
        };
      }

      const transitionResult = this.transitionTaskUnsafe(taskId, input.toStatus, input.expectedVersion, {
        progress: input.progress,
        resultUrl: input.resultUrl,
        clearError: input.toStatus === "QUEUED"
      });

      if (!transitionResult.ok) {
        if (transitionResult.reason === "VERSION_CONFLICT") {
          return {
            kind: "VERSION_CONFLICT",
            currentVersion: this.tasks.get(taskId)?.version || input.expectedVersion
          };
        }

        if (transitionResult.reason === "INVALID_TRANSITION") {
          return {
            kind: "INVALID_TRANSITION",
            status: this.tasks.get(taskId)?.status || input.fromStatus
          };
        }

        return { kind: "NOT_FOUND" };
      }

      this.handlePostTransitionUnsafe(transitionResult.task, userId, input.fromStatus, input.toStatus);

      return {
        kind: "SUCCESS",
        task: transitionResult.task
      };
    });
  }

  async seedFailedTask(userId: string, taskId: string): Promise<void> {
    if (this.usePrismaStore) {
      await this.seedFailedTaskWithPrisma(userId, taskId);
      return;
    }

    this.runInTransaction(() => {
      const now = new Date().toISOString();
      this.tasks.set(taskId, {
        taskId,
        userId,
        assetId: "ast_failed",
        mediaType: "IMAGE",
        taskPolicy: "FAST",
        status: "FAILED",
        progress: 100,
        version: 1,
        errorCode: "50001",
        errorMessage: "model timeout",
        createdAt: now,
        updatedAt: now
      });
    });
  }

  getDebugSnapshot() {
    if (this.usePrismaStore) {
      return {
        taskCount: 0,
        idempotencyCount: 0,
        actionIdempotencyCount: 0,
        taskMaskCount: 0,
        usageLedgerCount: 0,
        outboxEventCount: 0
      };
    }

    return {
      taskCount: this.tasks.size,
      idempotencyCount: this.idempotency.size,
      actionIdempotencyCount: this.actionIdempotency.size,
      taskMaskCount: this.taskMasks.size,
      usageLedgerCount: this.usageLedgers.size,
      outboxEventCount: this.outboxEvents.size
    };
  }

  private ensurePrismaService(): PrismaService {
    if (!this.prismaService) {
      throw new Error("PrismaService is not configured");
    }

    return this.prismaService;
  }

  private mapDbTask(task: {
    taskId: string;
    userId: string;
    assetId: string;
    mediaType: string;
    taskPolicy: string;
    status: string;
    progress: number;
    version: number;
    errorCode: string | null;
    errorMessage: string | null;
    resultUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): TaskRecord {
    return {
      taskId: task.taskId,
      userId: task.userId,
      assetId: task.assetId,
      mediaType: task.mediaType as "IMAGE" | "VIDEO",
      taskPolicy: task.taskPolicy as TaskPolicy,
      status: task.status as TaskStatus,
      progress: task.progress,
      version: task.version,
      errorCode: task.errorCode || undefined,
      errorMessage: task.errorMessage || undefined,
      resultUrl: task.resultUrl || undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
  }

  private parseActionResult(value: Prisma.JsonValue): TaskActionResult | undefined {
    if (!value || typeof value !== "object" || !("kind" in value)) {
      return undefined;
    }

    return value as unknown as TaskActionResult;
  }

  private async createTaskWithPrisma(
    userId: string,
    idempotencyKey: string,
    input: CreateTaskInput
  ): Promise<{ task: TaskRecord; created: boolean }> {
    const prisma = this.ensurePrismaService();
    const payloadHash = JSON.stringify(input);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.taskIdempotencyKey.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey
          }
        }
      });

      if (existing) {
        const existingTask = await tx.task.findUnique({
          where: { taskId: existing.taskId }
        });

        if (existingTask) {
          return {
            task: this.mapDbTask(existingTask),
            created: false
          };
        }

        await tx.taskIdempotencyKey.delete({
          where: { id: existing.id }
        });
      }

      const now = new Date();
      const taskId = this.buildId("tsk");
      const taskPolicy = input.taskPolicy || "FAST";
      await this.assertQuotaAvailableWithPrisma(tx, userId, now);

      await tx.task.create({
        data: {
          taskId,
          userId,
          assetId: input.assetId,
          mediaType: input.mediaType,
          taskPolicy,
          status: "QUEUED",
          progress: 0,
          version: 1,
          createdAt: now,
          updatedAt: now
        }
      });

      await tx.taskIdempotencyKey.create({
        data: {
          id: this.buildId("idp"),
          userId,
          idempotencyKey,
          payloadHash,
          taskId,
          createdAt: now,
          updatedAt: now
        }
      });

      await this.appendUsageLedgerWithPrisma(tx, userId, taskId, "HELD", "task_create");
      await this.appendOutboxEventWithPrisma(tx, taskId, "task.created");

      const createdTask = await tx.task.findUnique({
        where: { taskId }
      });

      if (!createdTask) {
        throw new Error(`Task not found after create: ${taskId}`);
      }

      return {
        task: this.mapDbTask(createdTask),
        created: true
      };
    });
  }

  private async listByUserWithPrisma(userId: string): Promise<TaskRecord[]> {
    const prisma = this.ensurePrismaService();
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });

    return tasks.map((task) => this.mapDbTask(task));
  }

  private async getByUserWithPrisma(
    userId: string,
    taskId: string,
    options: GetTaskOptions = {}
  ): Promise<TaskRecord | undefined> {
    void options;
    const prisma = this.ensurePrismaService();
    const task = await prisma.task.findUnique({
      where: { taskId }
    });

    if (!task || task.userId !== userId) {
      return undefined;
    }

    return this.mapDbTask(task);
  }

  private async applyTaskActionWithPrisma(
    userId: string,
    taskId: string,
    idempotencyKey: string,
    action: TaskActionType
  ): Promise<TaskActionResult> {
    const prisma = this.ensurePrismaService();
    const payloadHash = `${action}:${taskId}`;

    const existing = await prisma.taskActionIdempotency.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey
        }
      }
    });

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return { kind: "IDEMPOTENCY_CONFLICT" };
      }

      const parsed = this.parseActionResult(existing.resultJson);
      if (!parsed) {
        return { kind: "IDEMPOTENCY_CONFLICT" };
      }

      if (parsed.kind === "SUCCESS") {
        return {
          ...parsed,
          replayed: true
        };
      }

      return parsed;
    }

    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const task = await tx.task.findUnique({
        where: { taskId }
      });

      if (!task || task.userId !== userId) {
        const notFound: TaskActionResult = { kind: "NOT_FOUND" };
        await this.persistActionIdempotencyWithPrisma(tx, userId, idempotencyKey, payloadHash, notFound, now);
        return notFound;
      }

      const fromStatus = task.status as TaskStatus;
      let transitionResult: TaskMutationResult;

      if (action === "CANCEL") {
        if (!CANCELABLE_STATUS.has(fromStatus)) {
          const invalid: TaskActionResult = { kind: "INVALID_TRANSITION", status: fromStatus };
          await this.persistActionIdempotencyWithPrisma(tx, userId, idempotencyKey, payloadHash, invalid, now);
          return invalid;
        }

        transitionResult = await this.transitionTaskWithPrisma(tx, taskId, "CANCELED", task.version, {
          progress: 0
        });
      } else {
        if (fromStatus !== "FAILED") {
          const invalid: TaskActionResult = { kind: "INVALID_TRANSITION", status: fromStatus };
          await this.persistActionIdempotencyWithPrisma(tx, userId, idempotencyKey, payloadHash, invalid, now);
          return invalid;
        }

        transitionResult = await this.transitionTaskWithPrisma(tx, taskId, "QUEUED", task.version, {
          progress: 0,
          clearError: true
        });
      }

      if (!transitionResult.ok) {
        const latest = await tx.task.findUnique({ where: { taskId } });
        const invalid: TaskActionResult = {
          kind: "INVALID_TRANSITION",
          status: (latest?.status as TaskStatus) || fromStatus
        };
        await this.persistActionIdempotencyWithPrisma(tx, userId, idempotencyKey, payloadHash, invalid, now);
        return invalid;
      }

      await this.handlePostTransitionWithPrisma(tx, transitionResult.task, userId, fromStatus, transitionResult.task.status);

      const success: TaskActionResult = {
        kind: "SUCCESS",
        taskId: transitionResult.task.taskId,
        status: transitionResult.task.status,
        replayed: false
      };
      await this.persistActionIdempotencyWithPrisma(tx, userId, idempotencyKey, payloadHash, success, now);
      return success;
    });
  }

  private async upsertMaskWithPrisma(
    userId: string,
    taskId: string,
    input: UpsertMaskInput
  ): Promise<{ conflict: false; maskId: string; version: number } | { conflict: true; version: number } | undefined> {
    const prisma = this.ensurePrismaService();
    const task = await prisma.task.findUnique({
      where: { taskId }
    });
    if (!task || task.userId !== userId) {
      return undefined;
    }

    const currentMask = await prisma.taskMask.findUnique({
      where: { taskId }
    });
    if (currentMask && input.version !== currentMask.version) {
      return {
        conflict: true,
        version: currentMask.version
      };
    }

    return prisma.$transaction(async (tx) => {
      const latestTask = await tx.task.findUnique({
        where: { taskId }
      });
      if (!latestTask || latestTask.userId !== userId) {
        return undefined;
      }

      const activeMask = await tx.taskMask.findUnique({
        where: { taskId }
      });

      const nextVersion = activeMask ? activeMask.version + 1 : input.version + 1;
      const maskId = activeMask?.maskId || this.buildId("msk");
      const now = new Date();

      await tx.taskMask.upsert({
        where: { taskId },
        create: {
          taskId,
          maskId,
          version: nextVersion,
          polygons: input.polygons as unknown as Prisma.InputJsonValue,
          brushStrokes: input.brushStrokes as unknown as Prisma.InputJsonValue,
          updatedAt: now
        },
        update: {
          maskId,
          version: nextVersion,
          polygons: input.polygons as unknown as Prisma.InputJsonValue,
          brushStrokes: input.brushStrokes as unknown as Prisma.InputJsonValue,
          updatedAt: now
        }
      });

      if (!TERMINAL_STATUS.has(latestTask.status as TaskStatus)) {
        if (latestTask.status === "QUEUED") {
          const transitionResult = await this.transitionTaskWithPrisma(tx, taskId, "PREPROCESSING", latestTask.version, {
            progress: 15
          });

          if (!transitionResult.ok) {
            return {
              conflict: true,
              version: latestTask.version
            };
          }
        } else {
          const updateResult = await this.bumpTaskProgressWithPrisma(tx, taskId, latestTask.version, 15);
          if (!updateResult.ok) {
            return {
              conflict: true,
              version: latestTask.version
            };
          }
        }
      }

      return {
        conflict: false,
        maskId,
        version: nextVersion
      };
    });
  }

  private async advanceTaskStatusWithPrisma(
    userId: string,
    taskId: string,
    input: AdvanceTaskStatusInput
  ): Promise<AdvanceTaskStatusResult> {
    const prisma = this.ensurePrismaService();

    return prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { taskId }
      });
      if (!task) {
        return { kind: "NOT_FOUND" };
      }

      if (task.userId !== userId) {
        return { kind: "FORBIDDEN" };
      }

      if (task.version !== input.expectedVersion) {
        return {
          kind: "VERSION_CONFLICT",
          currentVersion: task.version
        };
      }

      if (task.status !== input.fromStatus) {
        return {
          kind: "STATUS_MISMATCH",
          status: task.status as TaskStatus
        };
      }

      const transitionResult = await this.transitionTaskWithPrisma(tx, taskId, input.toStatus, input.expectedVersion, {
        progress: input.progress,
        resultUrl: input.resultUrl,
        clearError: input.toStatus === "QUEUED"
      });

      if (!transitionResult.ok) {
        if (transitionResult.reason === "VERSION_CONFLICT") {
          const latest = await tx.task.findUnique({ where: { taskId } });
          return {
            kind: "VERSION_CONFLICT",
            currentVersion: latest?.version || input.expectedVersion
          };
        }

        if (transitionResult.reason === "INVALID_TRANSITION") {
          const latest = await tx.task.findUnique({ where: { taskId } });
          return {
            kind: "INVALID_TRANSITION",
            status: (latest?.status as TaskStatus) || input.fromStatus
          };
        }

        return { kind: "NOT_FOUND" };
      }

      await this.handlePostTransitionWithPrisma(tx, transitionResult.task, userId, input.fromStatus, input.toStatus);

      return {
        kind: "SUCCESS",
        task: transitionResult.task
      };
    });
  }

  private async seedFailedTaskWithPrisma(userId: string, taskId: string) {
    const prisma = this.ensurePrismaService();
    const now = new Date();

    await prisma.task.upsert({
      where: { taskId },
      create: {
        taskId,
        userId,
        assetId: "ast_failed",
        mediaType: "IMAGE",
        taskPolicy: "FAST",
        status: "FAILED",
        progress: 100,
        version: 1,
        errorCode: "50001",
        errorMessage: "model timeout",
        createdAt: now,
        updatedAt: now
      },
      update: {
        userId,
        assetId: "ast_failed",
        mediaType: "IMAGE",
        taskPolicy: "FAST",
        status: "FAILED",
        progress: 100,
        version: 1,
        errorCode: "50001",
        errorMessage: "model timeout",
        updatedAt: now
      }
    });
  }

  private async maybeAdvanceForSimulationWithPrisma(taskId: string) {
    const prisma = this.ensurePrismaService();
    const current = await prisma.task.findUnique({
      where: { taskId }
    });
    if (!current) {
      return;
    }

    const hasMask = await prisma.taskMask.findUnique({
      where: { taskId },
      select: { taskId: true }
    });
    if (!hasMask) {
      return;
    }

    if (TERMINAL_STATUS.has(current.status as TaskStatus)) {
      return;
    }

    let nextStatus: TaskStatus | undefined;
    let progress = current.progress;
    let resultUrl: string | undefined;

    switch (current.status as TaskStatus) {
      case "QUEUED":
        nextStatus = "PREPROCESSING";
        progress = 15;
        break;
      case "PREPROCESSING":
        nextStatus = "DETECTING";
        progress = 35;
        break;
      case "DETECTING":
        nextStatus = "INPAINTING";
        progress = 60;
        break;
      case "INPAINTING":
        nextStatus = "PACKAGING";
        progress = 85;
        break;
      case "PACKAGING":
        nextStatus = "SUCCEEDED";
        progress = 100;
        resultUrl = `https://minio.local/result/${taskId}.png`;
        break;
      default:
        break;
    }

    if (!nextStatus) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      const latest = await tx.task.findUnique({ where: { taskId } });
      const latestMask = await tx.taskMask.findUnique({ where: { taskId }, select: { taskId: true } });

      if (!latest || !latestMask || TERMINAL_STATUS.has(latest.status as TaskStatus)) {
        return;
      }

      const fromStatus = latest.status as TaskStatus;
      const transitionResult = await this.transitionTaskWithPrisma(tx, taskId, nextStatus as TaskStatus, latest.version, {
        progress,
        resultUrl
      });

      if (transitionResult.ok) {
        await this.handlePostTransitionWithPrisma(tx, transitionResult.task, transitionResult.task.userId, fromStatus, nextStatus as TaskStatus);
      }
    });
  }

  private async handlePostTransitionWithPrisma(
    tx: DbTransactionClient,
    task: TaskRecord,
    userId: string,
    fromStatus: TaskStatus,
    toStatus: TaskStatus
  ) {
    if (toStatus === "SUCCEEDED") {
      if (!task.resultUrl) {
        await tx.task.update({
          where: { taskId: task.taskId },
          data: {
            resultUrl: `https://minio.local/result/${task.taskId}.png`,
            updatedAt: new Date()
          }
        });
      }

      await this.appendUsageLedgerWithPrisma(tx, userId, task.taskId, "COMMITTED", "task_succeeded");
      await this.appendOutboxEventWithPrisma(tx, task.taskId, "task.succeeded");
      return;
    }

    if (toStatus === "CANCELED") {
      await this.appendUsageLedgerWithPrisma(tx, userId, task.taskId, "RELEASED", "task_canceled");
      await this.appendOutboxEventWithPrisma(tx, task.taskId, "task.canceled");
      return;
    }

    if (fromStatus === "FAILED" && toStatus === "QUEUED") {
      await this.appendOutboxEventWithPrisma(tx, task.taskId, "task.retried");
    }
  }

  private async transitionTaskWithPrisma(
    tx: DbTransactionClient,
    taskId: string,
    nextStatus: TaskStatus,
    expectedVersion: number,
    options: {
      progress?: number;
      resultUrl?: string;
      clearError?: boolean;
    } = {}
  ): Promise<TaskMutationResult> {
    const current = await tx.task.findUnique({
      where: { taskId }
    });
    if (!current) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (current.version !== expectedVersion) {
      return { ok: false, reason: "VERSION_CONFLICT" };
    }

    if (!canTransit(current.status as TaskStatus, nextStatus)) {
      return { ok: false, reason: "INVALID_TRANSITION" };
    }

    const updatePayload: Prisma.TaskUpdateManyMutationInput = {
      status: nextStatus,
      version: { increment: 1 },
      updatedAt: new Date()
    };

    if (typeof options.progress === "number") {
      updatePayload.progress = options.progress;
    }

    if (options.clearError) {
      updatePayload.errorCode = null;
      updatePayload.errorMessage = null;
    }

    if (options.resultUrl) {
      updatePayload.resultUrl = options.resultUrl;
    }

    const updated = await tx.task.updateMany({
      where: {
        taskId,
        version: expectedVersion,
        status: current.status
      },
      data: updatePayload
    });

    if (updated.count !== 1) {
      return { ok: false, reason: "VERSION_CONFLICT" };
    }

    const latest = await tx.task.findUnique({
      where: { taskId }
    });

    if (!latest) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    return {
      ok: true,
      task: this.mapDbTask(latest)
    };
  }

  private async bumpTaskProgressWithPrisma(
    tx: DbTransactionClient,
    taskId: string,
    expectedVersion: number,
    minProgress: number
  ): Promise<TaskMutationResult> {
    const current = await tx.task.findUnique({
      where: { taskId }
    });
    if (!current) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (current.version !== expectedVersion) {
      return { ok: false, reason: "VERSION_CONFLICT" };
    }

    const updated = await tx.task.updateMany({
      where: {
        taskId,
        version: expectedVersion
      },
      data: {
        progress: Math.max(current.progress, minProgress),
        version: { increment: 1 },
        updatedAt: new Date()
      }
    });

    if (updated.count !== 1) {
      return { ok: false, reason: "VERSION_CONFLICT" };
    }

    const latest = await tx.task.findUnique({
      where: { taskId }
    });
    if (!latest) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    return {
      ok: true,
      task: this.mapDbTask(latest)
    };
  }

  private async appendUsageLedgerWithPrisma(
    tx: DbTransactionClient,
    userId: string,
    taskId: string,
    status: UsageLedgerRecord["status"],
    source: string
  ) {
    await tx.usageLedger.createMany({
      data: [
        {
          ledgerId: this.buildId("led"),
          userId,
          taskId,
          status,
          source,
          consumeUnit: 1,
          consumeAt: new Date()
        }
      ],
      skipDuplicates: true
    });
  }

  private async appendOutboxEventWithPrisma(tx: DbTransactionClient, taskId: string, eventType: string) {
    await tx.outboxEvent.create({
      data: {
        eventId: this.buildId("evt"),
        eventType,
        aggregateType: "task",
        aggregateId: taskId,
        status: "PENDING",
        retryCount: 0,
        createdAt: new Date()
      }
    });
  }

  private async persistActionIdempotencyWithPrisma(
    tx: DbTransactionClient,
    userId: string,
    idempotencyKey: string,
    payloadHash: string,
    result: TaskActionResult,
    updatedAt: Date
  ) {
    await tx.taskActionIdempotency.upsert({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey
        }
      },
      create: {
        id: this.buildId("aid"),
        userId,
        idempotencyKey,
        payloadHash,
        resultJson: result as unknown as Prisma.InputJsonValue,
        updatedAt
      },
      update: {
        payloadHash,
        resultJson: result as unknown as Prisma.InputJsonValue,
        updatedAt
      }
    });
  }

  private applyTaskAction(userId: string, taskId: string, idempotencyKey: string, action: TaskActionType): TaskActionResult {
    const key = `${userId}:${idempotencyKey}`;
    const payloadHash = `${action}:${taskId}`;
    const existing = this.actionIdempotency.get(key);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return { kind: "IDEMPOTENCY_CONFLICT" };
      }

      if (existing.result.kind === "SUCCESS") {
        return {
          ...existing.result,
          replayed: true
        };
      }

      return existing.result;
    }

    return this.runInTransaction(() => {
      const now = new Date().toISOString();
      const task = this.tasks.get(taskId);
      if (!task || task.userId !== userId) {
        const result: TaskActionResult = { kind: "NOT_FOUND" };
        this.actionIdempotency.set(key, {
          payloadHash,
          result,
          updatedAt: now
        });
        return result;
      }

      let transitionResult: TaskMutationResult;
      const fromStatus = task.status;

      if (action === "CANCEL") {
        if (!CANCELABLE_STATUS.has(task.status)) {
          const result: TaskActionResult = {
            kind: "INVALID_TRANSITION",
            status: task.status
          };
          this.actionIdempotency.set(key, {
            payloadHash,
            result,
            updatedAt: now
          });
          return result;
        }

        transitionResult = this.transitionTaskUnsafe(taskId, "CANCELED", task.version, {
          progress: 0
        });
      } else {
        if (task.status !== "FAILED") {
          const result: TaskActionResult = {
            kind: "INVALID_TRANSITION",
            status: task.status
          };
          this.actionIdempotency.set(key, {
            payloadHash,
            result,
            updatedAt: now
          });
          return result;
        }

        transitionResult = this.transitionTaskUnsafe(taskId, "QUEUED", task.version, {
          progress: 0,
          clearError: true
        });
      }

      if (!transitionResult.ok) {
        const currentStatus = this.tasks.get(taskId)?.status || task.status;
        const result: TaskActionResult = {
          kind: "INVALID_TRANSITION",
          status: currentStatus
        };
        this.actionIdempotency.set(key, {
          payloadHash,
          result,
          updatedAt: now
        });
        return result;
      }

      this.handlePostTransitionUnsafe(transitionResult.task, userId, fromStatus, transitionResult.task.status);

      const result: TaskActionResult = {
        kind: "SUCCESS",
        taskId: transitionResult.task.taskId,
        status: transitionResult.task.status,
        replayed: false
      };

      this.actionIdempotency.set(key, {
        payloadHash,
        result,
        updatedAt: now
      });

      return result;
    });
  }

  private maybeAdvanceForSimulation(taskId: string) {
    const current = this.tasks.get(taskId);
    if (!current) {
      return;
    }

    if (!this.taskMasks.has(taskId)) {
      return;
    }

    if (TERMINAL_STATUS.has(current.status)) {
      return;
    }

    let nextStatus: TaskStatus | undefined;
    let progress = current.progress;
    let resultUrl: string | undefined;

    switch (current.status) {
      case "QUEUED":
        nextStatus = "PREPROCESSING";
        progress = 15;
        break;
      case "PREPROCESSING":
        nextStatus = "DETECTING";
        progress = 35;
        break;
      case "DETECTING":
        nextStatus = "INPAINTING";
        progress = 60;
        break;
      case "INPAINTING":
        nextStatus = "PACKAGING";
        progress = 85;
        break;
      case "PACKAGING":
        nextStatus = "SUCCEEDED";
        progress = 100;
        resultUrl = `https://minio.local/result/${taskId}.png`;
        break;
      default:
        break;
    }

    if (!nextStatus) {
      return;
    }

    this.runInTransaction(() => {
      const latest = this.tasks.get(taskId);
      if (!latest || !this.taskMasks.has(taskId) || TERMINAL_STATUS.has(latest.status)) {
        return;
      }

      const fromStatus = latest.status;
      const transitionResult = this.transitionTaskUnsafe(taskId, nextStatus as TaskStatus, latest.version, {
        progress,
        resultUrl
      });

      if (transitionResult.ok) {
        this.handlePostTransitionUnsafe(transitionResult.task, transitionResult.task.userId, fromStatus, nextStatus as TaskStatus);
      }
    });
  }

  private handlePostTransitionUnsafe(task: TaskRecord, userId: string, fromStatus: TaskStatus, toStatus: TaskStatus) {
    if (toStatus === "SUCCEEDED") {
      if (!task.resultUrl) {
        task.resultUrl = `https://minio.local/result/${task.taskId}.png`;
      }

      this.appendUsageLedgerUnsafe(userId, task.taskId, "COMMITTED", "task_succeeded");
      this.appendOutboxEventUnsafe(task.taskId, "task.succeeded");
      return;
    }

    if (toStatus === "CANCELED") {
      this.appendUsageLedgerUnsafe(userId, task.taskId, "RELEASED", "task_canceled");
      this.appendOutboxEventUnsafe(task.taskId, "task.canceled");
      return;
    }

    if (fromStatus === "FAILED" && toStatus === "QUEUED") {
      this.appendOutboxEventUnsafe(task.taskId, "task.retried");
    }
  }

  private transitionTaskUnsafe(
    taskId: string,
    nextStatus: TaskStatus,
    expectedVersion: number,
    options: {
      progress?: number;
      resultUrl?: string;
      clearError?: boolean;
    } = {}
  ): TaskMutationResult {
    const current = this.tasks.get(taskId);
    if (!current) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (current.version !== expectedVersion) {
      return { ok: false, reason: "VERSION_CONFLICT" };
    }

    if (!canTransit(current.status, nextStatus)) {
      return { ok: false, reason: "INVALID_TRANSITION" };
    }

    current.status = nextStatus;
    if (typeof options.progress === "number") {
      current.progress = options.progress;
    }

    if (options.clearError) {
      current.errorCode = undefined;
      current.errorMessage = undefined;
    }

    if (options.resultUrl) {
      current.resultUrl = options.resultUrl;
    }

    current.version += 1;
    current.updatedAt = new Date().toISOString();

    return { ok: true, task: current };
  }

  private updateTaskUnsafe(taskId: string, expectedVersion: number, updater: (task: TaskRecord) => void): TaskMutationResult {
    const current = this.tasks.get(taskId);
    if (!current) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (current.version !== expectedVersion) {
      return { ok: false, reason: "VERSION_CONFLICT" };
    }

    updater(current);
    current.version += 1;
    current.updatedAt = new Date().toISOString();

    return { ok: true, task: current };
  }

  private appendUsageLedgerUnsafe(
    userId: string,
    taskId: string,
    status: UsageLedgerRecord["status"],
    source: string
  ) {
    const ledgerId = this.buildId("led");
    this.usageLedgers.set(ledgerId, {
      ledgerId,
      userId,
      taskId,
      status,
      source,
      consumeUnit: 1,
      consumeAt: new Date().toISOString()
    });
  }

  private appendOutboxEventUnsafe(taskId: string, eventType: string) {
    const eventId = this.buildId("evt");
    this.outboxEvents.set(eventId, {
      eventId,
      eventType,
      aggregateType: "task",
      aggregateId: taskId,
      status: "PENDING",
      retryCount: 0,
      createdAt: new Date().toISOString()
    });
  }

  private assertQuotaAvailableInMemory(userId: string) {
    const { periodStart, periodEnd } = this.getCurrentPeriod();
    const usedUnits = this.countReservedUnitsInMemory(userId, periodStart, periodEnd);

    if (usedUnits >= FREE_MONTHLY_QUOTA) {
      throw new QuotaExceededError(FREE_MONTHLY_QUOTA, usedUnits);
    }
  }

  private async assertQuotaAvailableWithPrisma(tx: DbTransactionClient, userId: string, now: Date) {
    const { periodStart, periodEnd } = this.getCurrentPeriod(now);
    const quotaTotal = await this.resolveMonthlyQuotaWithPrisma(tx, userId, now);
    const usedUnits = await this.countReservedUnitsWithPrisma(tx, userId, periodStart, periodEnd);

    if (usedUnits >= quotaTotal) {
      throw new QuotaExceededError(quotaTotal, usedUnits);
    }
  }

  private async resolveMonthlyQuotaWithPrisma(tx: DbTransactionClient, userId: string, at: Date) {
    const activeSubscription = await tx.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        AND: [
          {
            OR: [{ effectiveAt: null }, { effectiveAt: { lte: at } }]
          },
          {
            OR: [{ expireAt: null }, { expireAt: { gt: at } }]
          }
        ]
      },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }]
    });

    const planId = activeSubscription?.planId || "free";
    const plan = await tx.plan.findUnique({
      where: { planId }
    });

    if (plan?.monthlyQuota && plan.monthlyQuota > 0) {
      return plan.monthlyQuota;
    }

    const freePlan = await tx.plan.findUnique({
      where: { planId: "free" }
    });
    return freePlan?.monthlyQuota || FREE_MONTHLY_QUOTA;
  }

  private async countReservedUnitsWithPrisma(
    tx: DbTransactionClient,
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ) {
    const rows = await tx.$queryRaw<Array<{ usedUnits: number }>>(Prisma.sql`
      SELECT COALESCE(
        SUM(
          CASE
            WHEN ledger.committed_units > 0 THEN ledger.committed_units
            ELSE GREATEST(ledger.held_units - ledger.released_units, 0)
          END
        ),
        0
      )::int AS "usedUnits"
      FROM (
        SELECT
          task_id,
          COALESCE(SUM(CASE WHEN status = 'COMMITTED' THEN consume_unit ELSE 0 END), 0)::int AS committed_units,
          COALESCE(SUM(CASE WHEN status = 'HELD' THEN consume_unit ELSE 0 END), 0)::int AS held_units,
          COALESCE(SUM(CASE WHEN status = 'RELEASED' THEN consume_unit ELSE 0 END), 0)::int AS released_units
        FROM usage_ledger
        WHERE user_id = ${userId}
          AND consume_at >= ${periodStart}
          AND consume_at < ${periodEnd}
        GROUP BY task_id
      ) ledger
    `);

    return rows[0]?.usedUnits || 0;
  }

  private countReservedUnitsInMemory(userId: string, periodStart: Date, periodEnd: Date) {
    const summary = new Map<string, { committed: number; held: number; released: number }>();

    for (const ledger of this.usageLedgers.values()) {
      if (ledger.userId !== userId) {
        continue;
      }

      const consumeAt = Date.parse(ledger.consumeAt);
      if (!Number.isFinite(consumeAt)) {
        continue;
      }
      if (consumeAt < periodStart.getTime() || consumeAt >= periodEnd.getTime()) {
        continue;
      }

      const current = summary.get(ledger.taskId) || { committed: 0, held: 0, released: 0 };
      if (ledger.status === "COMMITTED") {
        current.committed += ledger.consumeUnit;
      } else if (ledger.status === "HELD") {
        current.held += ledger.consumeUnit;
      } else {
        current.released += ledger.consumeUnit;
      }
      summary.set(ledger.taskId, current);
    }

    let usedUnits = 0;
    for (const item of summary.values()) {
      if (item.committed > 0) {
        usedUnits += item.committed;
      } else {
        usedUnits += Math.max(0, item.held - item.released);
      }
    }
    return usedUnits;
  }

  private getCurrentPeriod(referenceDate = new Date()) {
    const periodStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    const periodEnd = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );
    return {
      periodStart,
      periodEnd
    };
  }

  private buildId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }

  private runInTransaction<T>(runner: () => T): T {
    const snapshot = this.snapshotState();
    try {
      const result = runner();
      this.flushToDisk();
      return result;
    } catch (error) {
      this.restoreState(snapshot);
      throw error;
    }
  }

  private snapshotState(): PersistedTaskState {
    return {
      tasks: [...this.tasks.values()].map((task) => structuredClone(task)),
      idempotency: [...this.idempotency.entries()].map(([key, value]) => [key, structuredClone(value)]),
      actionIdempotency: [...this.actionIdempotency.entries()].map(([key, value]) => [key, structuredClone(value)]),
      taskMasks: [...this.taskMasks.values()].map((mask) => structuredClone(mask)),
      usageLedgers: [...this.usageLedgers.values()].map((ledger) => structuredClone(ledger)),
      outboxEvents: [...this.outboxEvents.values()].map((event) => structuredClone(event))
    };
  }

  private restoreState(snapshot: PersistedTaskState) {
    this.tasks.clear();
    snapshot.tasks.forEach((task) => this.tasks.set(task.taskId, task));

    this.idempotency.clear();
    snapshot.idempotency.forEach(([key, value]) => this.idempotency.set(key, value));

    this.actionIdempotency.clear();
    snapshot.actionIdempotency.forEach(([key, value]) => this.actionIdempotency.set(key, value));

    this.taskMasks.clear();
    snapshot.taskMasks.forEach((mask) => this.taskMasks.set(mask.taskId, mask));

    this.usageLedgers.clear();
    snapshot.usageLedgers.forEach((ledger) => this.usageLedgers.set(ledger.ledgerId, ledger));

    this.outboxEvents.clear();
    snapshot.outboxEvents.forEach((event) => this.outboxEvents.set(event.eventId, event));
  }

  private hydrateFromDisk() {
    if (!this.persistenceEnabled || !existsSync(this.persistenceFilePath)) {
      return;
    }

    const raw = readFileSync(this.persistenceFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedTaskState>;

    const snapshot: PersistedTaskState = {
      tasks: (parsed.tasks || []).map((task) => ({
        ...task,
        version: typeof task.version === "number" ? task.version : 0
      })) as TaskRecord[],
      idempotency: parsed.idempotency || [],
      actionIdempotency: parsed.actionIdempotency || [],
      taskMasks: parsed.taskMasks || [],
      usageLedgers: parsed.usageLedgers || [],
      outboxEvents: parsed.outboxEvents || []
    };

    this.restoreState(snapshot);
  }

  private flushToDisk() {
    if (!this.persistenceEnabled) {
      return;
    }

    const payload = JSON.stringify(this.snapshotState(), null, 2);
    const targetDir = dirname(this.persistenceFilePath);
    mkdirSync(targetDir, { recursive: true });

    const tempPath = `${this.persistenceFilePath}.tmp`;
    writeFileSync(tempPath, payload, "utf8");
    renameSync(tempPath, this.persistenceFilePath);
  }
}
