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

export async function listTasks() {
  return request<TaskListData>("/v1/tasks");
}

export async function replayTask(taskId: string) {
  return request<RetryTaskData>(`/v1/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: "POST",
    idempotencyKey: buildIdempotencyKey("adm_task_retry")
  });
}
