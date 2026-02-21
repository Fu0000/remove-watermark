import { buildIdempotencyKey, request } from "@/services/http";

export interface TaskItem {
  taskId: string;
  userId: string;
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy: "FAST" | "QUALITY";
  status: string;
  progress: number;
  version: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskListData {
  items: TaskItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface RetryTaskData {
  taskId: string;
  status: string;
}

interface ListTasksInput {
  taskId?: string;
  userId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listTasks(input: ListTasksInput = {}) {
  return request<TaskListData>("/admin/tasks", {
    query: {
      taskId: input.taskId,
      userId: input.userId,
      status: input.status,
      from: input.from,
      to: input.to,
      page: input.page || 1,
      pageSize: input.pageSize || 20
    }
  });
}

export async function replayTask(taskId: string, reason: string) {
  return request<RetryTaskData>(`/admin/tasks/${encodeURIComponent(taskId)}/replay`, {
    method: "POST",
    idempotencyKey: buildIdempotencyKey("adm_task_retry"),
    data: {
      reason
    }
  });
}
