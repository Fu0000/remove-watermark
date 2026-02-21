import { request } from "@/services/http";

export interface PlanItem {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListPlansResult {
  items: PlanItem[];
  page: number;
  pageSize: number;
  total: number;
}

interface ListPlansInput {
  keyword?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

interface UpsertPlanInput {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
  isActive: boolean;
}

interface UpdatePlanInput {
  name?: string;
  price?: number;
  monthlyQuota?: number;
  features?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

export async function listPlans(input: ListPlansInput = {}) {
  return request<ListPlansResult>("/admin/plans", {
    query: {
      keyword: input.keyword,
      isActive: input.isActive === undefined ? undefined : String(input.isActive),
      page: input.page || 1,
      pageSize: input.pageSize || 20
    }
  });
}

export async function createPlan(input: UpsertPlanInput) {
  return request<PlanItem>("/admin/plans", {
    method: "POST",
    data: input
  });
}

export async function updatePlan(planId: string, input: UpdatePlanInput) {
  return request<PlanItem>(`/admin/plans/${encodeURIComponent(planId)}`, {
    method: "PATCH",
    data: input
  });
}
