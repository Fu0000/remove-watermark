import type { TaskStatus } from "@packages/contracts";

export type TaskActionType = "CANCEL" | "RETRY";

export interface TaskActionIdempotencyRecord {
  payloadHash: string;
  result: TaskActionResult;
  updatedAt: string;
}

export type TaskActionResult =
  | { kind: "SUCCESS"; taskId: string; status: TaskStatus; replayed: boolean }
  | { kind: "NOT_FOUND" }
  | { kind: "INVALID_TRANSITION"; status: TaskStatus }
  | { kind: "IDEMPOTENCY_CONFLICT" };

type PlannedTaskAction =
  | {
      kind: "ALLOWED";
      nextStatus: TaskStatus;
      clearError: boolean;
    }
  | {
      kind: "INVALID";
      result: TaskActionResult;
    };

export function buildTaskActionPayloadHash(action: TaskActionType, taskId: string) {
  return `${action}:${taskId}`;
}

export function parseTaskActionResult(value: unknown): TaskActionResult | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === "NOT_FOUND" || kind === "IDEMPOTENCY_CONFLICT") {
    return { kind };
  }

  if (kind === "INVALID_TRANSITION") {
    const status = record.status;
    if (typeof status !== "string" || status.trim().length === 0) {
      return undefined;
    }
    return { kind, status: status as TaskStatus };
  }

  if (kind === "SUCCESS") {
    const taskId = record.taskId;
    const status = record.status;
    const replayed = record.replayed;
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      return undefined;
    }
    if (typeof status !== "string" || status.trim().length === 0) {
      return undefined;
    }
    if (typeof replayed !== "boolean") {
      return undefined;
    }
    return {
      kind,
      taskId,
      status: status as TaskStatus,
      replayed
    };
  }

  return undefined;
}

export function resolveTaskActionIdempotencyReplay(
  existing: Pick<TaskActionIdempotencyRecord, "payloadHash" | "result">,
  payloadHash: string
): TaskActionResult {
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

export function planTaskActionTransition(
  action: TaskActionType,
  status: TaskStatus,
  cancelableStatus: ReadonlySet<TaskStatus>
): PlannedTaskAction {
  if (action === "CANCEL") {
    if (!cancelableStatus.has(status)) {
      return {
        kind: "INVALID",
        result: {
          kind: "INVALID_TRANSITION",
          status
        }
      };
    }

    return {
      kind: "ALLOWED",
      nextStatus: "CANCELED",
      clearError: false
    };
  }

  if (status !== "FAILED") {
    return {
      kind: "INVALID",
      result: {
        kind: "INVALID_TRANSITION",
        status
      }
    };
  }

  return {
    kind: "ALLOWED",
    nextStatus: "QUEUED",
    clearError: true
  };
}
