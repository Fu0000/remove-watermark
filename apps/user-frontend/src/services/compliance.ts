import { request } from "./http";

export type DeleteRequestStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";

export interface CreateDeleteRequestPayload {
  reason: string;
  confirm: true;
}

export interface AccountDeleteRequestItem {
  requestId: string;
  status: DeleteRequestStatus;
  reason: string;
  eta: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  auditId: string;
  traceId: string;
  requestId: string;
  ip: string;
  userAgent: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function createAccountDeleteRequest(payload: CreateDeleteRequestPayload, idempotencyKey: string) {
  return request<{ requestId: string; status: "PENDING"; eta: string }>("/v1/account/delete-request", {
    method: "POST",
    idempotencyKey,
    data: payload
  });
}

export function listAccountDeleteRequests(params: {
  status?: DeleteRequestStatus;
  page?: number;
  pageSize?: number;
}) {
  const query = toQueryString({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || 20),
    status: params.status
  });

  return request<PaginationResult<AccountDeleteRequestItem>>(`/v1/account/delete-requests?${query}`, {
    method: "GET"
  });
}

export function getAccountDeleteRequest(requestId: string) {
  return request<AccountDeleteRequestItem>(`/v1/account/delete-requests/${requestId}`, {
    method: "GET"
  });
}

export function listAuditLogs(params: {
  action?: string;
  resourceType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = toQueryString({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || 20),
    action: params.action,
    resourceType: params.resourceType,
    from: params.from,
    to: params.to
  });

  return request<PaginationResult<AuditLogItem>>(`/v1/account/audit-logs?${query}`, {
    method: "GET"
  });
}

function toQueryString(params: Record<string, string | undefined>) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
    .join("&");
}
