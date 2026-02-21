import { request } from "./http";

export interface CreateTaskPayload {
  assetId: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy?: "FAST" | "QUALITY" | "LOW_COST";
}

export interface TaskListItem {
  taskId: string;
  status: string;
  mediaType: "IMAGE" | "VIDEO";
  taskPolicy: "FAST" | "QUALITY" | "LOW_COST";
  progress: number;
  createdAt: string;
}

export interface UpsertTaskMaskPayload {
  imageWidth: number;
  imageHeight: number;
  polygons: number[][][];
  brushStrokes: number[][][];
  version: number;
}

export function createTask(payload: CreateTaskPayload, idempotencyKey: string) {
  return request<{ taskId: string; status: string }>("/v1/tasks", {
    method: "POST",
    idempotencyKey,
    data: payload
  });
}

export function upsertTaskMask(taskId: string, payload: UpsertTaskMaskPayload, idempotencyKey: string) {
  return request<{ taskId: string; maskId: string; version: number }>(`/v1/tasks/${taskId}/mask`, {
    method: "POST",
    idempotencyKey,
    data: payload
  });
}

export function listTasks() {
  return request<{ items: TaskListItem[]; page: number; pageSize: number; total: number }>("/v1/tasks", {
    method: "GET"
  });
}

export function cancelTask(taskId: string, idempotencyKey: string) {
  return request<{ taskId: string; status: string }>(`/v1/tasks/${taskId}/cancel`, {
    method: "POST",
    idempotencyKey
  });
}

export function retryTask(taskId: string, idempotencyKey: string) {
  return request<{ taskId: string; status: string }>(`/v1/tasks/${taskId}/retry`, {
    method: "POST",
    idempotencyKey
  });
}
