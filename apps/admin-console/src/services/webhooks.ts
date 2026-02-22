import { request } from "@/services/http";

type DeliveryStatus = "SUCCESS" | "FAILED";

export interface DeliveryItem {
  deliveryId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: DeliveryStatus;
  attempt: number;
  payloadSha256: string;
  signatureValidated: boolean;
  createdAt: string;
  failureCode?: string;
  errorMessage?: string;
  responseStatus?: number;
}

interface DeliveryListData {
  page: number;
  pageSize: number;
  total: number;
  items: DeliveryItem[];
}

interface ListDeliveriesInput {
  endpointId?: string;
  eventType?: string;
  status?: DeliveryStatus;
  page?: number;
  pageSize?: number;
}

interface RetryDeliveryData {
  deliveryId: string;
}

export async function listDeliveries(input: ListDeliveriesInput) {
  return request<DeliveryListData>("/admin/webhooks/deliveries", {
    query: {
      endpointId: input.endpointId,
      eventType: input.eventType,
      status: input.status,
      page: input.page || 1,
      pageSize: input.pageSize || 20
    }
  });
}

export async function retryDelivery(deliveryId: string) {
  return request<RetryDeliveryData>(`/admin/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
    method: "POST"
  });
}
