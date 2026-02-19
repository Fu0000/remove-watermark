import { request } from "./http";

export interface CreateTaskPayload {
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy?: "FAST" | "QUALITY" | "LOW_COST";
}

export function createTask(payload: CreateTaskPayload, idempotencyKey: string) {
  return request<{ taskId: string; status: string }>("/v1/tasks", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
}
