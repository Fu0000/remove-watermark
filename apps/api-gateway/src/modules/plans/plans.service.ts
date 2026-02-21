import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

export interface PlanView {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
}

const DEFAULT_PLANS: PlanView[] = [
  {
    planId: "free",
    name: "Free",
    price: 0,
    monthlyQuota: 20,
    features: ["standard_quality", "basic_queue"],
    sortOrder: 10
  },
  {
    planId: "pro_month",
    name: "Pro 月付",
    price: 39,
    monthlyQuota: 300,
    features: ["high_quality", "priority_queue"],
    sortOrder: 20
  },
  {
    planId: "pro_year",
    name: "Pro 年付",
    price: 299,
    monthlyQuota: 3600,
    features: ["high_quality", "priority_queue"],
    sortOrder: 30
  }
];

@Injectable()
export class PlansService {
  private readonly preferPrismaStore =
    process.env.PLANS_STORE === "prisma" || process.env.TASKS_STORE === "prisma" || Boolean(process.env.DATABASE_URL);

  constructor(private readonly prisma: PrismaService) {}

  async listPlans(): Promise<PlanView[]> {
    if (!this.preferPrismaStore) {
      return DEFAULT_PLANS;
    }

    try {
      const plans = await this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { planId: "asc" }]
      });

      if (plans.length === 0) {
        return DEFAULT_PLANS;
      }

      return plans.map((plan) => ({
        planId: plan.planId,
        name: plan.name,
        price: plan.price,
        monthlyQuota: plan.monthlyQuota,
        features: normalizeFeatures(plan.features),
        sortOrder: plan.sortOrder
      }));
    } catch {
      return DEFAULT_PLANS;
    }
  }
}

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((feature): feature is string => typeof feature === "string");
}
