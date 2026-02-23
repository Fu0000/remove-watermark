import { resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import type { TaskArtifactType, TaskMediaType, TaskPolicy, TaskStatus } from "@packages/contracts";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { TaskQuotaService, type MemoryUsageLedgerRecord } from "./task-quota.service";
import { MemoryTransactionStore } from "./task-memory-transaction";
import {
  buildTaskActionPayloadHash,
  parseTaskActionResult,
  planTaskActionTransition,
  resolveTaskActionIdempotencyReplay,
  type TaskActionIdempotencyRecord,
  type TaskActionResult,
  type TaskActionType
} from "./task-action.service";
import {
  buildDefaultResultArtifacts,
  canTransit,
  isTerminalTaskStatus,
  planPostTransition,
  planSimulationAdvance
} from "./task-lifecycle.service";

export interface CreateTaskInput {
  assetId: string;
  mediaType: TaskMediaType;
  taskPolicy?: TaskPolicy;
}

export interface TaskArtifact {
  type: TaskArtifactType;
  url: string;
  expireAt: string;
}

export interface TaskRecord {
  taskId: string;
  userId: string;
  assetId: string;
  mediaType: TaskMediaType;
  taskPolicy: TaskPolicy;
  status: TaskStatus;
  progress: number;
  version: number;
  errorCode?: string;
  errorMessage?: string;
  resultUrl?: string;
  resultJson?: {
    artifacts: TaskArtifact[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminListTasksInput {
  taskId?: string;
  userId?: string;
  status?: TaskStatus;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface AdminListTasksResult {
  items: TaskRecord[];
  page: number;
  pageSize: number;
  total: number;
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

interface TaskRegionRecord {
  taskId: string;
  regionId: string;
  mediaType: TaskMediaType;
  schemaVersion: string;
  version: number;
  regions: Array<Record<string, unknown>>;
  updatedAt: string;
}

interface UsageLedgerRecord extends MemoryUsageLedgerRecord {
  ledgerId: string;
  source: string;
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

export interface UpsertRegionsInput {
  version: number;
  mediaType: TaskMediaType;
  schemaVersion: string;
  regions: Array<Record<string, unknown>>;
}

export interface AdvanceTaskStatusInput {
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  expectedVersion: number;
  progress?: number;
  resultUrl?: string;
  resultJson?: {
    artifacts: TaskArtifact[];
  };
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
  taskRegions: TaskRegionRecord[];
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

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeObjectPrefix(prefix: string, fallback: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function buildDatePathFromDate(reference: Date | string | undefined): string {
  let date = new Date();
  if (reference instanceof Date) {
    date = reference;
  } else if (typeof reference === "string") {
    const parsed = new Date(reference);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function buildResultExt(mediaType: TaskMediaType): "png" | "mp4" | "pdf" {
  if (mediaType === "VIDEO") {
    return "mp4";
  }
  if (mediaType === "PDF" || mediaType === "PPT") {
    return "pdf";
  }
  return "png";
}

const MEDIA_MIME_PREFIX: Record<TaskMediaType, string[]> = {
  IMAGE: ["image/"],
  VIDEO: ["video/"],
  PDF: ["application/pdf"],
  PPT: [
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ]
};

function normalizeMediaType(raw: string): TaskMediaType | undefined {
  if (raw === "IMAGE" || raw === "VIDEO" || raw === "PDF" || raw === "PPT") {
    return raw;
  }
  return undefined;
}

function isMimeCompatible(mediaType: TaskMediaType, mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  const allowlist = MEDIA_MIME_PREFIX[mediaType] || [];
  return allowlist.some((rule) => (rule.endsWith("/") ? normalized.startsWith(rule) : normalized === rule));
}

export class InvalidTaskAssetError extends Error {
  constructor(public readonly reason: "NOT_FOUND" | "FORBIDDEN" | "INVALID_MEDIA") {
    super(`invalid task asset: ${reason}`);
    this.name = "InvalidTaskAssetError";
  }
}

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly actionIdempotency = new Map<string, TaskActionIdempotencyRecord>();
  private readonly taskMasks = new Map<string, TaskMaskRecord>();
  private readonly taskRegions = new Map<string, TaskRegionRecord>();
  private readonly usageLedgers = new Map<string, UsageLedgerRecord>();
  private readonly outboxEvents = new Map<string, OutboxEventRecord>();

  private readonly persistenceEnabled: boolean;
  private readonly persistenceFilePath: string;
  private readonly prismaService?: PrismaService;
  private readonly usePrismaStore: boolean;
  private readonly simulationEnabled: boolean;
  private readonly memoryTransactionStore: MemoryTransactionStore<PersistedTaskState>;
  private readonly quotaService = new TaskQuotaService(FREE_MONTHLY_QUOTA);
  private readonly minioPublicEndpoint = trimTrailingSlash(
    process.env.MINIO_PUBLIC_ENDPOINT || "http://127.0.0.1:9000"
  );
  private readonly minioResultBucket = process.env.MINIO_BUCKET_RESULTS || "remove-waterremark";
  private readonly minioResultPrefix = normalizeObjectPrefix(process.env.MINIO_RESULT_PREFIX || "result", "result");

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
    this.simulationEnabled = parseBoolEnv(process.env.TASKS_SIMULATION_ENABLED, !this.usePrismaStore);

    this.persistenceEnabled = options.disablePersistence !== true && process.env.NODE_ENV !== "test" && !this.usePrismaStore;

    this.memoryTransactionStore = new MemoryTransactionStore<PersistedTaskState>({
      persistenceEnabled: this.persistenceEnabled,
      persistenceFilePath: this.persistenceFilePath,
      snapshot: () => this.snapshotState(),
      restore: (snapshot) => this.restoreState(snapshot),
      revive: (raw) => this.revivePersistedState(raw)
    });
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

    if (this.simulationEnabled) {
      tasks.forEach((task) => this.maybeAdvanceForSimulation(task.taskId));
    }

    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getByTaskId(taskId: string, options: GetTaskOptions = {}): Promise<TaskRecord | undefined> {
    if (this.usePrismaStore) {
      return this.getByTaskIdWithPrisma(taskId, options);
    }

    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    if (this.simulationEnabled && options.advance !== false) {
      this.maybeAdvanceForSimulation(taskId);
    }

    return this.tasks.get(taskId);
  }

  async listForAdmin(input: AdminListTasksInput): Promise<AdminListTasksResult> {
    if (this.usePrismaStore) {
      return this.listForAdminWithPrisma(input);
    }

    const page = Math.max(1, input.page);
    const pageSize = Math.min(100, Math.max(1, input.pageSize));
    const fromTime = input.from ? new Date(input.from).getTime() : undefined;
    const toTime = input.to ? new Date(input.to).getTime() : undefined;

    const filtered = [...this.tasks.values()]
      .filter((task) => (input.taskId ? task.taskId === input.taskId : true))
      .filter((task) => (input.userId ? task.userId === input.userId : true))
      .filter((task) => (input.status ? task.status === input.status : true))
      .filter((task) => {
        const createdAtTime = new Date(task.createdAt).getTime();
        if (fromTime !== undefined && createdAtTime < fromTime) {
          return false;
        }
        if (toTime !== undefined && createdAtTime > toTime) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      page,
      pageSize,
      total: filtered.length
    };
  }

  async getByUser(userId: string, taskId: string, options: GetTaskOptions = {}): Promise<TaskRecord | undefined> {
    if (this.usePrismaStore) {
      return this.getByUserWithPrisma(userId, taskId, options);
    }

    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }

    if (this.simulationEnabled && options.advance !== false) {
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

      if (!isTerminalTaskStatus(latestTask.status)) {
        if (this.simulationEnabled) {
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
        this.appendOutboxEventUnsafe(taskId, "task.masked");
      }

      return {
        conflict: false,
        maskId,
        version: nextVersion
      };
    });
  }

  async upsertRegions(
    userId: string,
    taskId: string,
    input: UpsertRegionsInput
  ): Promise<{ conflict: false; regionId: string; version: number } | { conflict: true; version: number } | undefined> {
    if (this.usePrismaStore) {
      return this.upsertRegionsWithPrisma(userId, taskId, input);
    }

    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }
    if (task.mediaType !== input.mediaType) {
      return {
        conflict: true,
        version: task.version
      };
    }

    const currentRegion = this.taskRegions.get(taskId);
    if (currentRegion && input.version !== currentRegion.version) {
      return {
        conflict: true,
        version: currentRegion.version
      };
    }

    return this.runInTransaction(() => {
      const latestTask = this.tasks.get(taskId);
      if (!latestTask || latestTask.userId !== userId) {
        return undefined;
      }

      const activeRegion = this.taskRegions.get(taskId);
      const nextVersion = activeRegion ? activeRegion.version + 1 : input.version + 1;
      const regionId = activeRegion?.regionId || this.buildId("reg");
      const now = new Date().toISOString();

      this.taskRegions.set(taskId, {
        taskId,
        regionId,
        mediaType: input.mediaType,
        schemaVersion: input.schemaVersion,
        version: nextVersion,
        regions: input.regions,
        updatedAt: now
      });

      if (!isTerminalTaskStatus(latestTask.status)) {
        if (this.simulationEnabled) {
          if (latestTask.status === "QUEUED") {
            const transitionResult = this.transitionTaskUnsafe(taskId, "PREPROCESSING", latestTask.version, {
              progress: 15
            });

            if (!transitionResult.ok) {
              return { conflict: true, version: latestTask.version };
            }
          } else {
            const updateResult = this.updateTaskUnsafe(taskId, latestTask.version, (currentTask) => {
              currentTask.progress = Math.max(currentTask.progress, 35);
            });

            if (!updateResult.ok) {
              return { conflict: true, version: latestTask.version };
            }
          }
        }
        this.appendOutboxEventUnsafe(taskId, "task.masked");
      }

      return {
        conflict: false,
        regionId,
        version: nextVersion
      };
    });
  }

  async isWaitingForRegions(userId: string, taskId: string): Promise<boolean> {
    const task = await this.getByUser(userId, taskId, { advance: false });
    if (!task || task.status !== "DETECTING") {
      return false;
    }

    const hasInput = await this.hasDetectionInput(taskId, task.mediaType);
    return !hasInput;
  }

  async findTasksWaitingForRegions(userId: string, taskIds: string[]): Promise<Set<string>> {
    if (taskIds.length === 0) {
      return new Set();
    }

    if (this.usePrismaStore) {
      return this.findTasksWaitingForRegionsWithPrisma(userId, taskIds);
    }

    const waiting = new Set<string>();
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (!task || task.userId !== userId || task.status !== "DETECTING") {
        continue;
      }
      const hasRegion = this.taskRegions.has(taskId);
      const hasMask = task.mediaType === "IMAGE" && this.taskMasks.has(taskId);
      if (!hasRegion && !hasMask) {
        waiting.add(taskId);
      }
    }

    return waiting;
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
        resultJson: input.resultJson,
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
        taskRegionCount: 0,
        usageLedgerCount: 0,
        outboxEventCount: 0
      };
    }

    return {
      taskCount: this.tasks.size,
      idempotencyCount: this.idempotency.size,
      actionIdempotencyCount: this.actionIdempotency.size,
      taskMaskCount: this.taskMasks.size,
      taskRegionCount: this.taskRegions.size,
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
    resultJson: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): TaskRecord {
    const parsedResultJson =
      task.resultJson && typeof task.resultJson === "object"
        ? (task.resultJson as unknown as TaskRecord["resultJson"])
        : undefined;

    return {
      taskId: task.taskId,
      userId: task.userId,
      assetId: task.assetId,
      mediaType: task.mediaType as TaskMediaType,
      taskPolicy: task.taskPolicy as TaskPolicy,
      status: task.status as TaskStatus,
      progress: task.progress,
      version: task.version,
      errorCode: task.errorCode || undefined,
      errorMessage: task.errorMessage || undefined,
      resultUrl: task.resultUrl || undefined,
      resultJson: parsedResultJson,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
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

      const asset = await tx.asset.findUnique({
        where: { assetId: input.assetId },
        select: {
          assetId: true,
          userId: true,
          mediaType: true,
          mimeType: true,
          status: true,
          deletedAt: true
        }
      });
      if (!asset || asset.deletedAt || asset.status === "DELETED") {
        throw new InvalidTaskAssetError("NOT_FOUND");
      }
      if (asset.userId !== userId) {
        throw new InvalidTaskAssetError("FORBIDDEN");
      }
      const assetMediaType = normalizeMediaType(asset.mediaType);
      if (!assetMediaType || assetMediaType !== input.mediaType || !isMimeCompatible(input.mediaType, asset.mimeType)) {
        throw new InvalidTaskAssetError("INVALID_MEDIA");
      }

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

  private async getByTaskIdWithPrisma(taskId: string, options: GetTaskOptions = {}): Promise<TaskRecord | undefined> {
    const prisma = this.ensurePrismaService();
    const task = await prisma.task.findUnique({
      where: { taskId }
    });
    if (!task) {
      return undefined;
    }

    if (this.simulationEnabled && options.advance !== false) {
      await this.maybeAdvanceForSimulationWithPrisma(taskId);
    }

    return this.mapDbTask(task);
  }

  private async listForAdminWithPrisma(input: AdminListTasksInput): Promise<AdminListTasksResult> {
    const prisma = this.ensurePrismaService();
    const page = Math.max(1, input.page);
    const pageSize = Math.min(100, Math.max(1, input.pageSize));
    const where: Prisma.TaskWhereInput = {};

    if (input.taskId) {
      where.taskId = input.taskId;
    }
    if (input.userId) {
      where.userId = input.userId;
    }
    if (input.status) {
      where.status = input.status;
    }
    if (input.from || input.to) {
      where.createdAt = {};
      if (input.from) {
        where.createdAt.gte = new Date(input.from);
      }
      if (input.to) {
        where.createdAt.lte = new Date(input.to);
      }
    }

    const [total, rows] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      items: rows.map((item) => this.mapDbTask(item)),
      page,
      pageSize,
      total
    };
  }

  private async getByUserWithPrisma(
    userId: string,
    taskId: string,
    options: GetTaskOptions = {}
  ): Promise<TaskRecord | undefined> {
    const prisma = this.ensurePrismaService();
    let task = await prisma.task.findUnique({
      where: { taskId }
    });

    if (!task || task.userId !== userId) {
      return undefined;
    }

    if (this.simulationEnabled && options.advance !== false) {
      await this.maybeAdvanceForSimulationWithPrisma(taskId);
      task = await prisma.task.findUnique({
        where: { taskId }
      });
      if (!task || task.userId !== userId) {
        return undefined;
      }
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
    const payloadHash = buildTaskActionPayloadHash(action, taskId);

    const existing = await prisma.taskActionIdempotency.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey
        }
      }
    });

    if (existing) {
      const parsed = parseTaskActionResult(existing.resultJson);
      if (!parsed) {
        return { kind: "IDEMPOTENCY_CONFLICT" };
      }
      return resolveTaskActionIdempotencyReplay(
        {
          payloadHash: existing.payloadHash,
          result: parsed
        },
        payloadHash
      );
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
      const actionPlan = planTaskActionTransition(action, fromStatus, CANCELABLE_STATUS);
      if (actionPlan.kind === "INVALID") {
        await this.persistActionIdempotencyWithPrisma(
          tx,
          userId,
          idempotencyKey,
          payloadHash,
          actionPlan.result,
          now
        );
        return actionPlan.result;
      }

      const transitionResult = await this.transitionTaskWithPrisma(tx, taskId, actionPlan.nextStatus, task.version, {
        progress: 0,
        clearError: actionPlan.clearError
      });

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

      if (!isTerminalTaskStatus(latestTask.status as TaskStatus)) {
        if (this.simulationEnabled) {
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
        await this.appendOutboxEventWithPrisma(tx, taskId, "task.masked");
      }

      return {
        conflict: false,
        maskId,
        version: nextVersion
      };
    });
  }

  private async upsertRegionsWithPrisma(
    userId: string,
    taskId: string,
    input: UpsertRegionsInput
  ): Promise<{ conflict: false; regionId: string; version: number } | { conflict: true; version: number } | undefined> {
    const prisma = this.ensurePrismaService();
    const task = await prisma.task.findUnique({
      where: { taskId }
    });
    if (!task || task.userId !== userId) {
      return undefined;
    }
    if (task.mediaType !== input.mediaType) {
      return {
        conflict: true,
        version: task.version
      };
    }

    const currentRegion = await prisma.taskRegion.findUnique({
      where: { taskId }
    });
    if (currentRegion && input.version !== currentRegion.version) {
      return {
        conflict: true,
        version: currentRegion.version
      };
    }

    return prisma.$transaction(async (tx) => {
      const latestTask = await tx.task.findUnique({
        where: { taskId }
      });
      if (!latestTask || latestTask.userId !== userId) {
        return undefined;
      }

      const activeRegion = await tx.taskRegion.findUnique({
        where: { taskId }
      });
      const nextVersion = activeRegion ? activeRegion.version + 1 : input.version + 1;
      const regionId = activeRegion?.regionId || this.buildId("reg");
      const now = new Date();

      await tx.taskRegion.upsert({
        where: { taskId },
        create: {
          taskId,
          regionId,
          mediaType: input.mediaType,
          schemaVersion: input.schemaVersion,
          version: nextVersion,
          regionsJson: input.regions as unknown as Prisma.InputJsonValue,
          updatedAt: now
        },
        update: {
          regionId,
          mediaType: input.mediaType,
          schemaVersion: input.schemaVersion,
          version: nextVersion,
          regionsJson: input.regions as unknown as Prisma.InputJsonValue,
          updatedAt: now
        }
      });

      if (!isTerminalTaskStatus(latestTask.status as TaskStatus)) {
        if (this.simulationEnabled) {
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
            const updateResult = await this.bumpTaskProgressWithPrisma(tx, taskId, latestTask.version, 35);
            if (!updateResult.ok) {
              return {
                conflict: true,
                version: latestTask.version
              };
            }
          }
        }
        await this.appendOutboxEventWithPrisma(tx, taskId, "task.masked");
      }

      return {
        conflict: false,
        regionId,
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
        resultJson: input.resultJson as unknown as Prisma.InputJsonValue,
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

  private async hasDetectionInput(taskId: string, mediaType: TaskMediaType): Promise<boolean> {
    if (this.usePrismaStore) {
      return this.hasDetectionInputWithPrisma(taskId, mediaType);
    }

    if (this.taskRegions.has(taskId)) {
      return true;
    }

    if (mediaType === "IMAGE") {
      return this.taskMasks.has(taskId);
    }

    return false;
  }

  private async hasDetectionInputWithPrisma(taskId: string, mediaType: TaskMediaType): Promise<boolean> {
    const prisma = this.ensurePrismaService();
    const region = await prisma.taskRegion.findUnique({
      where: { taskId },
      select: { taskId: true }
    });
    if (region) {
      return true;
    }

    if (mediaType === "IMAGE") {
      const mask = await prisma.taskMask.findUnique({
        where: { taskId },
        select: { taskId: true }
      });
      return Boolean(mask);
    }

    return false;
  }

  private async findTasksWaitingForRegionsWithPrisma(userId: string, taskIds: string[]): Promise<Set<string>> {
    const prisma = this.ensurePrismaService();
    const targets = await prisma.task.findMany({
      where: {
        userId,
        taskId: { in: taskIds },
        status: "DETECTING"
      },
      select: {
        taskId: true,
        mediaType: true
      }
    });
    if (targets.length === 0) {
      return new Set();
    }

    const targetTaskIds = targets.map((item) => item.taskId);
    const imageTaskIds = targets
      .filter((item) => (item.mediaType as TaskMediaType) === "IMAGE")
      .map((item) => item.taskId);

    const [regions, imageMasks] = await Promise.all([
      prisma.taskRegion.findMany({
        where: { taskId: { in: targetTaskIds } },
        select: { taskId: true }
      }),
      imageTaskIds.length > 0
        ? prisma.taskMask.findMany({
            where: { taskId: { in: imageTaskIds } },
            select: { taskId: true }
          })
        : Promise.resolve([])
    ]);

    const regionTaskIds = new Set(regions.map((item) => item.taskId));
    const imageMaskTaskIds = new Set(imageMasks.map((item) => item.taskId));
    const waiting = new Set<string>();
    for (const target of targets) {
      if (regionTaskIds.has(target.taskId)) {
        continue;
      }
      const mediaType = target.mediaType as TaskMediaType;
      if (mediaType === "IMAGE" && imageMaskTaskIds.has(target.taskId)) {
        continue;
      }
      waiting.add(target.taskId);
    }
    return waiting;
  }

  private async maybeAdvanceForSimulationWithPrisma(taskId: string) {
    const prisma = this.ensurePrismaService();
    const current = await prisma.task.findUnique({
      where: { taskId }
    });
    if (!current) {
      return;
    }

    const initialHasDetectionInput = await this.hasDetectionInputWithPrisma(taskId, current.mediaType as TaskMediaType);
    const initialPlan = planSimulationAdvance({
      status: current.status as TaskStatus,
      progress: current.progress,
      hasDetectionInput: initialHasDetectionInput
    });
    if (!initialPlan) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      const latest = await tx.task.findUnique({ where: { taskId } });
      if (!latest) {
        return;
      }

      const latestHasDetectionInput = await this.hasDetectionInputWithPrisma(taskId, latest.mediaType as TaskMediaType);
      const plan = planSimulationAdvance({
        status: latest.status as TaskStatus,
        progress: latest.progress,
        hasDetectionInput: latestHasDetectionInput
      });
      if (!plan) {
        return;
      }

      const fromStatus = latest.status as TaskStatus;
      const transitionResult = await this.transitionTaskWithPrisma(tx, taskId, plan.nextStatus, latest.version, {
        progress: plan.progress,
        resultUrl: plan.needsResultUrl
          ? this.buildDefaultResultUrl(taskId, latest.mediaType as TaskMediaType, latest.createdAt)
          : undefined
      });

      if (transitionResult.ok) {
        await this.handlePostTransitionWithPrisma(
          tx,
          transitionResult.task,
          transitionResult.task.userId,
          fromStatus,
          plan.nextStatus
        );
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
    const postPlan = planPostTransition(fromStatus, toStatus);
    if (postPlan.needsResultArtifacts) {
      const ensuredResult = this.ensureTaskResultPayload(task);
      if (ensuredResult.changed) {
        await tx.task.update({
          where: { taskId: task.taskId },
          data: {
            resultUrl: ensuredResult.resultUrl,
            resultJson: ensuredResult.resultJson as unknown as Prisma.InputJsonValue,
            updatedAt: new Date()
          }
        });
      }
    }

    if (postPlan.usageLedger) {
      await this.appendUsageLedgerWithPrisma(
        tx,
        userId,
        task.taskId,
        postPlan.usageLedger.status,
        postPlan.usageLedger.source
      );
    }

    if (postPlan.outboxEvent) {
      await this.appendOutboxEventWithPrisma(tx, task.taskId, postPlan.outboxEvent);
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
      resultJson?: Prisma.InputJsonValue;
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

    if (options.resultJson) {
      updatePayload.resultJson = options.resultJson;
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

  private rememberActionIdempotency(
    key: string,
    payloadHash: string,
    result: TaskActionResult,
    updatedAt: string
  ): TaskActionResult {
    this.actionIdempotency.set(key, {
      payloadHash,
      result,
      updatedAt
    });
    return result;
  }

  private applyTaskAction(userId: string, taskId: string, idempotencyKey: string, action: TaskActionType): TaskActionResult {
    const key = `${userId}:${idempotencyKey}`;
    const payloadHash = buildTaskActionPayloadHash(action, taskId);
    const existing = this.actionIdempotency.get(key);

    if (existing) {
      return resolveTaskActionIdempotencyReplay(existing, payloadHash);
    }

    return this.runInTransaction(() => {
      const now = new Date().toISOString();
      const task = this.tasks.get(taskId);
      if (!task || task.userId !== userId) {
        return this.rememberActionIdempotency(key, payloadHash, { kind: "NOT_FOUND" }, now);
      }

      const fromStatus = task.status;
      const actionPlan = planTaskActionTransition(action, task.status, CANCELABLE_STATUS);
      if (actionPlan.kind === "INVALID") {
        return this.rememberActionIdempotency(key, payloadHash, actionPlan.result, now);
      }

      const transitionResult = this.transitionTaskUnsafe(taskId, actionPlan.nextStatus, task.version, {
        progress: 0,
        clearError: actionPlan.clearError
      });

      if (!transitionResult.ok) {
        const currentStatus = this.tasks.get(taskId)?.status || task.status;
        return this.rememberActionIdempotency(key, payloadHash, {
          kind: "INVALID_TRANSITION",
          status: currentStatus
        }, now);
      }

      this.handlePostTransitionUnsafe(transitionResult.task, userId, fromStatus, transitionResult.task.status);

      return this.rememberActionIdempotency(key, payloadHash, {
        kind: "SUCCESS",
        taskId: transitionResult.task.taskId,
        status: transitionResult.task.status,
        replayed: false
      }, now);
    });
  }

  private maybeAdvanceForSimulation(taskId: string) {
    const current = this.tasks.get(taskId);
    if (!current) {
      return;
    }

    const initialHasDetectionInput = this.taskRegions.has(taskId) || (current.mediaType === "IMAGE" && this.taskMasks.has(taskId));
    const initialPlan = planSimulationAdvance({
      status: current.status,
      progress: current.progress,
      hasDetectionInput: initialHasDetectionInput
    });
    if (!initialPlan) {
      return;
    }

    this.runInTransaction(() => {
      const latest = this.tasks.get(taskId);
      const latestHasDetectionInput = this.taskRegions.has(taskId) || (latest?.mediaType === "IMAGE" && this.taskMasks.has(taskId));
      if (!latest) {
        return;
      }

      const plan = planSimulationAdvance({
        status: latest.status,
        progress: latest.progress,
        hasDetectionInput: latestHasDetectionInput
      });
      if (!plan) {
        return;
      }

      const fromStatus = latest.status;
      const transitionResult = this.transitionTaskUnsafe(taskId, plan.nextStatus, latest.version, {
        progress: plan.progress,
        resultUrl: plan.needsResultUrl ? this.buildDefaultResultUrl(taskId, latest.mediaType, latest.createdAt) : undefined
      });

      if (transitionResult.ok) {
        this.handlePostTransitionUnsafe(transitionResult.task, transitionResult.task.userId, fromStatus, plan.nextStatus);
      }
    });
  }

  private handlePostTransitionUnsafe(task: TaskRecord, userId: string, fromStatus: TaskStatus, toStatus: TaskStatus) {
    const postPlan = planPostTransition(fromStatus, toStatus);
    if (postPlan.needsResultArtifacts) {
      this.ensureTaskResultPayload(task);
    }
    if (postPlan.usageLedger) {
      this.appendUsageLedgerUnsafe(userId, task.taskId, postPlan.usageLedger.status, postPlan.usageLedger.source);
    }
    if (postPlan.outboxEvent) {
      this.appendOutboxEventUnsafe(task.taskId, postPlan.outboxEvent);
    }
  }

  private transitionTaskUnsafe(
    taskId: string,
    nextStatus: TaskStatus,
    expectedVersion: number,
    options: {
      progress?: number;
      resultUrl?: string;
      resultJson?: TaskRecord["resultJson"];
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

    if (options.resultJson) {
      current.resultJson = options.resultJson;
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
    const result = this.quotaService.checkInMemory(userId, this.usageLedgers.values());
    if (result.exceeded) {
      throw new QuotaExceededError(result.quotaTotal, result.usedUnits);
    }
  }

  private async assertQuotaAvailableWithPrisma(tx: DbTransactionClient, userId: string, now: Date) {
    const result = await this.quotaService.checkWithPrisma(tx, userId, now);
    if (result.exceeded) {
      throw new QuotaExceededError(result.quotaTotal, result.usedUnits);
    }
  }

  private buildId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }

  private buildDefaultResultUrl(taskId: string, mediaType: TaskMediaType, createdAt?: Date | string): string {
    const datePath = buildDatePathFromDate(createdAt);
    const ext = buildResultExt(mediaType);
    return `${this.minioPublicEndpoint}/${this.minioResultBucket}/${this.minioResultPrefix}/${datePath}/${taskId}.${ext}`;
  }

  private ensureTaskResultPayload(task: TaskRecord) {
    const resultUrl = task.resultUrl || this.buildDefaultResultUrl(task.taskId, task.mediaType, task.createdAt);
    const resultJson = task.resultJson || buildDefaultResultArtifacts(task.mediaType, resultUrl);
    const changed = !task.resultUrl || !task.resultJson;
    if (changed) {
      task.resultUrl = resultUrl;
      task.resultJson = {
        artifacts: [...resultJson.artifacts]
      };
    }

    return {
      changed,
      resultUrl,
      resultJson
    };
  }

  private runInTransaction<T>(runner: () => T): T {
    return this.memoryTransactionStore.runInTransaction(runner);
  }

  private snapshotState(): PersistedTaskState {
    return {
      tasks: [...this.tasks.values()].map((task) => structuredClone(task)),
      idempotency: [...this.idempotency.entries()].map(([key, value]) => [key, structuredClone(value)]),
      actionIdempotency: [...this.actionIdempotency.entries()].map(([key, value]) => [key, structuredClone(value)]),
      taskMasks: [...this.taskMasks.values()].map((mask) => structuredClone(mask)),
      taskRegions: [...this.taskRegions.values()].map((region) => structuredClone(region)),
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

    this.taskRegions.clear();
    snapshot.taskRegions.forEach((region) => this.taskRegions.set(region.taskId, region));

    this.usageLedgers.clear();
    snapshot.usageLedgers.forEach((ledger) => this.usageLedgers.set(ledger.ledgerId, ledger));

    this.outboxEvents.clear();
    snapshot.outboxEvents.forEach((event) => this.outboxEvents.set(event.eventId, event));
  }

  private revivePersistedState(raw: unknown): PersistedTaskState {
    const parsed = raw && typeof raw === "object" ? (raw as Partial<PersistedTaskState>) : {};
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const idempotency = Array.isArray(parsed.idempotency) ? parsed.idempotency : [];
    const actionIdempotency = Array.isArray(parsed.actionIdempotency) ? parsed.actionIdempotency : [];
    const taskMasks = Array.isArray(parsed.taskMasks) ? parsed.taskMasks : [];
    const taskRegions = Array.isArray(parsed.taskRegions) ? parsed.taskRegions : [];
    const usageLedgers = Array.isArray(parsed.usageLedgers) ? parsed.usageLedgers : [];
    const outboxEvents = Array.isArray(parsed.outboxEvents) ? parsed.outboxEvents : [];

    return {
      tasks: tasks.map((task) => ({
        ...(task as TaskRecord),
        version: typeof (task as TaskRecord).version === "number" ? (task as TaskRecord).version : 0
      })),
      idempotency: idempotency as PersistedTaskState["idempotency"],
      actionIdempotency: actionIdempotency as PersistedTaskState["actionIdempotency"],
      taskMasks: taskMasks as PersistedTaskState["taskMasks"],
      taskRegions: taskRegions as PersistedTaskState["taskRegions"],
      usageLedgers: usageLedgers as PersistedTaskState["usageLedgers"],
      outboxEvents: outboxEvents as PersistedTaskState["outboxEvents"]
    };
  }
}
