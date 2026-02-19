export const TASK_STATUS_FLOW = [
  "UPLOADED",
  "QUEUED",
  "PREPROCESSING",
  "DETECTING",
  "INPAINTING",
  "PACKAGING"
] as const;

export const TASK_TERMINAL_STATUS = ["SUCCEEDED", "FAILED", "CANCELED"] as const;

export type TaskStatus = (typeof TASK_STATUS_FLOW)[number] | (typeof TASK_TERMINAL_STATUS)[number];

export const TASK_POLICY = ["FAST", "QUALITY", "LOW_COST"] as const;
export type TaskPolicy = (typeof TASK_POLICY)[number];
