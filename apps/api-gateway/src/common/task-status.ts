import { TASK_STATUS_FLOW, TASK_TERMINAL_STATUS } from "@packages/contracts";

export const TASK_STATUS = [...TASK_STATUS_FLOW, ...TASK_TERMINAL_STATUS];
