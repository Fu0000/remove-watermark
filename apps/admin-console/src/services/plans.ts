import { request } from "@/services/http";

export interface PlanItem {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
}

export async function listPlans() {
  return request<PlanItem[]>("/v1/plans");
}
