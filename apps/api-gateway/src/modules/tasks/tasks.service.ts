import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

const CANCELABLE_STATUS = new Set<TaskStatus>(["QUEUED", "PREPROCESSING", "DETECTING"]);
const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

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

  constructor(options: TasksServiceOptions = {}) {
    const configuredPath = options.persistenceFilePath || process.env.TASKS_STATE_FILE;
    this.persistenceFilePath = configuredPath
      ? resolve(process.cwd(), configuredPath)
      : resolve(process.cwd(), ".runtime/api-gateway/tasks-state.json");
    this.persistenceEnabled = options.disablePersistence !== true && process.env.NODE_ENV !== "test";

    if (this.persistenceEnabled) {
      this.hydrateFromDisk();
    }
  }

  createTask(userId: string, idempotencyKey: string, input: CreateTaskInput): { task: TaskRecord; created: boolean } {
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

  listByUser(userId: string): TaskRecord[] {
    const tasks = [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    tasks.forEach((task) => this.maybeAdvanceForSimulation(task.taskId));

    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getByUser(userId: string, taskId: string, options: GetTaskOptions = {}): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }

    if (options.advance !== false) {
      this.maybeAdvanceForSimulation(taskId);
    }

    return this.tasks.get(taskId);
  }

  cancel(userId: string, taskId: string, idempotencyKey: string): TaskActionResult {
    return this.applyTaskAction(userId, taskId, idempotencyKey, "CANCEL");
  }

  retry(userId: string, taskId: string, idempotencyKey: string): TaskActionResult {
    return this.applyTaskAction(userId, taskId, idempotencyKey, "RETRY");
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

  advanceTaskStatus(userId: string, taskId: string, input: AdvanceTaskStatusInput): AdvanceTaskStatusResult {
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

  seedFailedTask(userId: string, taskId: string): void {
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
    return {
      taskCount: this.tasks.size,
      idempotencyCount: this.idempotency.size,
      actionIdempotencyCount: this.actionIdempotency.size,
      taskMaskCount: this.taskMasks.size,
      usageLedgerCount: this.usageLedgers.size,
      outboxEventCount: this.outboxEvents.size
    };
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
      const task = this.getByUser(userId, taskId, { advance: false });
      const now = new Date().toISOString();

      if (!task) {
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
