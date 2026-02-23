import type { TaskMediaType, TaskStatus } from "@packages/contracts";

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

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

export interface SimulationAdvancePlan {
  nextStatus: TaskStatus;
  progress: number;
  needsResultUrl: boolean;
}

export interface PostTransitionPlan {
  usageLedger?: {
    status: "COMMITTED" | "RELEASED";
    source: "task_succeeded" | "task_canceled";
  };
  outboxEvent?: "task.succeeded" | "task.canceled" | "task.retried";
  needsResultArtifacts: boolean;
}

export function canTransit(from: TaskStatus, to: TaskStatus) {
  return STATUS_TRANSITION_MAP[from].includes(to);
}

export function isTerminalTaskStatus(status: TaskStatus) {
  return TERMINAL_STATUS.has(status);
}

export function planSimulationAdvance(input: {
  status: TaskStatus;
  progress: number;
  hasDetectionInput: boolean;
}): SimulationAdvancePlan | undefined {
  if (input.status === "DETECTING" && !input.hasDetectionInput) {
    return undefined;
  }
  if (isTerminalTaskStatus(input.status)) {
    return undefined;
  }

  switch (input.status) {
    case "QUEUED":
      return { nextStatus: "PREPROCESSING", progress: 15, needsResultUrl: false };
    case "PREPROCESSING":
      return { nextStatus: "DETECTING", progress: 35, needsResultUrl: false };
    case "DETECTING":
      return { nextStatus: "INPAINTING", progress: 60, needsResultUrl: false };
    case "INPAINTING":
      return { nextStatus: "PACKAGING", progress: 85, needsResultUrl: false };
    case "PACKAGING":
      return { nextStatus: "SUCCEEDED", progress: 100, needsResultUrl: true };
    default:
      return undefined;
  }
}

export function planPostTransition(fromStatus: TaskStatus, toStatus: TaskStatus): PostTransitionPlan {
  if (toStatus === "SUCCEEDED") {
    return {
      usageLedger: {
        status: "COMMITTED",
        source: "task_succeeded"
      },
      outboxEvent: "task.succeeded",
      needsResultArtifacts: true
    };
  }

  if (toStatus === "CANCELED") {
    return {
      usageLedger: {
        status: "RELEASED",
        source: "task_canceled"
      },
      outboxEvent: "task.canceled",
      needsResultArtifacts: false
    };
  }

  if (fromStatus === "FAILED" && toStatus === "QUEUED") {
    return {
      outboxEvent: "task.retried",
      needsResultArtifacts: false
    };
  }

  return {
    needsResultArtifacts: false
  };
}

export function buildDefaultResultArtifacts(mediaType: TaskMediaType, resultUrl: string) {
  return {
    artifacts: [
      {
        type: mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
        url: resultUrl,
        expireAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      }
    ]
  } as const;
}
