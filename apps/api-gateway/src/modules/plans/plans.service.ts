import { Injectable } from "@nestjs/common";
import { Prisma, type Plan as DbPlan } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

export interface PlanView {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
}

export interface AdminPlanView extends PlanView {
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminListPlansInput {
  keyword?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface AdminListPlansResult {
  items: AdminPlanView[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminCreatePlanInput {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface AdminUpdatePlanInput {
  name?: string;
  price?: number;
  monthlyQuota?: number;
  features?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

interface MemoryPlanRecord extends AdminPlanView {}

const DEFAULT_PLANS: Array<Omit<AdminPlanView, "createdAt" | "updatedAt">> = [
  {
    planId: "free",
    name: "Free",
    price: 0,
    currency: "CNY",
    monthlyQuota: 20,
    features: ["standard_quality", "basic_queue"],
    sortOrder: 10,
    isActive: true
  },
  {
    planId: "pro_month",
    name: "Pro 月付",
    price: 39,
    currency: "CNY",
    monthlyQuota: 300,
    features: ["high_quality", "priority_queue"],
    sortOrder: 20,
    isActive: true
  },
  {
    planId: "pro_year",
    name: "Pro 年付",
    price: 299,
    currency: "CNY",
    monthlyQuota: 3600,
    features: ["high_quality", "priority_queue"],
    sortOrder: 30,
    isActive: true
  }
];

@Injectable()
export class PlansService {
  private readonly preferPrismaStore =
    process.env.PLANS_STORE === "prisma" || process.env.TASKS_STORE === "prisma" || Boolean(process.env.DATABASE_URL);

  private readonly memoryPlans = new Map<string, MemoryPlanRecord>();

  constructor(private readonly prisma: PrismaService) {
    const now = new Date().toISOString();
    DEFAULT_PLANS.forEach((item) => {
      this.memoryPlans.set(item.planId, {
        ...item,
        createdAt: now,
        updatedAt: now
      });
    });
  }

  async listPlans(): Promise<PlanView[]> {
    if (!this.preferPrismaStore) {
      return this.listPlansFromMemory();
    }

    try {
      const plans = await this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { planId: "asc" }]
      });

      if (plans.length === 0) {
        return this.listPlansFromMemory();
      }

      return plans.map((plan) => this.toPlanView(this.mapDbPlan(plan)));
    } catch {
      return this.listPlansFromMemory();
    }
  }

  async listPlansForAdmin(input: AdminListPlansInput): Promise<AdminListPlansResult> {
    if (this.preferPrismaStore) {
      try {
        return this.listPlansForAdminWithPrisma(input);
      } catch {
        // fallback to memory store
      }
    }

    const page = Math.max(1, input.page);
    const pageSize = Math.min(100, Math.max(1, input.pageSize));
    const keyword = input.keyword?.trim().toLowerCase();

    const filtered = [...this.memoryPlans.values()]
      .filter((item) => (input.isActive === undefined ? true : item.isActive === input.isActive))
      .filter((item) => {
        if (!keyword) {
          return true;
        }
        return item.planId.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword);
      })
      .sort(sortPlans);

    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      page,
      pageSize,
      total: filtered.length
    };
  }

  async createPlan(input: AdminCreatePlanInput): Promise<AdminPlanView | "CONFLICT"> {
    if (this.preferPrismaStore) {
      try {
        const created = await this.prisma.plan.create({
          data: {
            planId: input.planId,
            name: input.name,
            price: input.price,
            currency: "CNY",
            monthlyQuota: input.monthlyQuota,
            features: input.features as unknown as Prisma.InputJsonValue,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        return this.mapDbPlan(created);
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "CONFLICT";
        }
        // fallback to memory store
      }
    }

    if (this.memoryPlans.has(input.planId)) {
      return "CONFLICT";
    }

    const now = new Date().toISOString();
    const record: MemoryPlanRecord = {
      planId: input.planId,
      name: input.name,
      price: input.price,
      currency: "CNY",
      monthlyQuota: input.monthlyQuota,
      features: [...input.features],
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now
    };
    this.memoryPlans.set(record.planId, record);
    return record;
  }

  async updatePlan(planId: string, input: AdminUpdatePlanInput): Promise<AdminPlanView | undefined | "CONFLICT"> {
    if (this.preferPrismaStore) {
      try {
        const updated = await this.prisma.plan.update({
          where: { planId },
          data: {
            name: input.name,
            price: input.price,
            monthlyQuota: input.monthlyQuota,
            features: input.features as unknown as Prisma.InputJsonValue | undefined,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
            updatedAt: new Date()
          }
        });
        return this.mapDbPlan(updated);
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        if (isUniqueConflict(error)) {
          return "CONFLICT";
        }
        // fallback to memory store
      }
    }

    const existing = this.memoryPlans.get(planId);
    if (!existing) {
      return undefined;
    }

    if (input.name !== undefined) {
      const duplicated = [...this.memoryPlans.values()].some(
        (item) => item.planId !== planId && item.name.toLowerCase() === input.name!.toLowerCase()
      );
      if (duplicated) {
        return "CONFLICT";
      }
    }

    const updated: MemoryPlanRecord = {
      ...existing,
      name: input.name ?? existing.name,
      price: input.price ?? existing.price,
      monthlyQuota: input.monthlyQuota ?? existing.monthlyQuota,
      features: input.features ? [...input.features] : existing.features,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString()
    };
    this.memoryPlans.set(planId, updated);
    return updated;
  }

  private async listPlansForAdminWithPrisma(input: AdminListPlansInput): Promise<AdminListPlansResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(100, Math.max(1, input.pageSize));
    const keyword = input.keyword?.trim();
    const where: Prisma.PlanWhereInput = {};

    if (input.isActive !== undefined) {
      where.isActive = input.isActive;
    }
    if (keyword) {
      where.OR = [
        {
          planId: {
            contains: keyword,
            mode: "insensitive"
          }
        },
        {
          name: {
            contains: keyword,
            mode: "insensitive"
          }
        }
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.plan.count({ where }),
      this.prisma.plan.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { planId: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      items: rows.map((item) => this.mapDbPlan(item)),
      page,
      pageSize,
      total
    };
  }

  private listPlansFromMemory() {
    return [...this.memoryPlans.values()]
      .filter((item) => item.isActive)
      .sort(sortPlans)
      .map((item) => this.toPlanView(item));
  }

  private mapDbPlan(plan: DbPlan): AdminPlanView {
    return {
      planId: plan.planId,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      monthlyQuota: plan.monthlyQuota,
      features: normalizeFeatures(plan.features),
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString()
    };
  }

  private toPlanView(plan: AdminPlanView): PlanView {
    return {
      planId: plan.planId,
      name: plan.name,
      price: plan.price,
      monthlyQuota: plan.monthlyQuota,
      features: [...plan.features],
      sortOrder: plan.sortOrder
    };
  }
}

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((feature): feature is string => typeof feature === "string");
}

function sortPlans(left: { sortOrder: number; planId: string }, right: { sortOrder: number; planId: string }) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.planId.localeCompare(right.planId);
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
