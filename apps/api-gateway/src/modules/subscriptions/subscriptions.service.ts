import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { PlansService } from "../plans/plans.service";

type SubscriptionStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "REFUNDED";

export interface CheckoutInput {
  planId: string;
  channel: "wechat_pay";
  clientReturnUrl: string;
}

export interface CheckoutPayload {
  orderId: string;
  paymentPayload: {
    nonceStr: string;
    timeStamp: string;
    sign: string;
  };
}

interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  planId: string;
  effectiveAt: Date | null;
  expireAt: Date | null;
  autoRenew: boolean;
}

interface StoredSubscriptionRecord extends SubscriptionSnapshot {
  subscriptionId: string;
  userId: string;
  orderId: string;
  createdAt: Date;
}

export interface SubscriptionView {
  status: SubscriptionStatus;
  planId: string;
  effectiveAt: string | null;
  expireAt: string | null;
  autoRenew: boolean;
}

export interface UsageLedgerView {
  ledgerId: string;
  userId: string;
  taskId: string;
  consumeUnit: number;
  status: "HELD" | "COMMITTED" | "RELEASED";
  source: string;
  consumeAt: string;
}

export interface UsageView {
  quotaTotal: number;
  quotaLeft: number;
  periodStart: string;
  periodEnd: string;
  ledgerItems: UsageLedgerView[];
}

@Injectable()
export class SubscriptionsService {
  private readonly preferPrismaStore =
    process.env.SUBSCRIPTIONS_STORE === "prisma" || process.env.TASKS_STORE === "prisma" || Boolean(process.env.DATABASE_URL);
  private readonly memorySubscriptions = new Map<string, StoredSubscriptionRecord[]>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlansService) private readonly plansService: PlansService
  ) {}

  async checkout(userId: string, input: CheckoutInput): Promise<CheckoutPayload | undefined> {
    const plans = await this.plansService.listPlans();
    const plan = plans.find((item) => item.planId === input.planId);
    if (!plan) {
      return undefined;
    }

    const orderId = this.buildId("ord");
    const payload: CheckoutPayload = {
      orderId,
      paymentPayload: {
        nonceStr: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        timeStamp: String(Math.floor(Date.now() / 1000)),
        sign: crypto.randomUUID().replace(/-/g, "")
      }
    };

    const now = new Date();
    this.appendMemorySubscription(userId, {
      subscriptionId: this.buildId("sub"),
      userId,
      orderId,
      status: "PENDING",
      planId: input.planId,
      effectiveAt: null,
      expireAt: null,
      autoRenew: false,
      createdAt: now
    });

    if (!this.preferPrismaStore) {
      return payload;
    }

    try {
      await this.prisma.subscription.create({
        data: {
          subscriptionId: this.buildId("sub"),
          userId,
          planId: input.planId,
          status: "PENDING",
          channel: "WECHAT_PAY",
          externalOrderId: orderId,
          startedAt: now,
          autoRenew: false,
          metaJson: {
            clientReturnUrl: input.clientReturnUrl
          },
          createdAt: now,
          updatedAt: now
        }
      });
    } catch {
      return payload;
    }

    return payload;
  }

  async confirmCheckout(userId: string, orderId: string): Promise<SubscriptionView | undefined> {
    if (this.preferPrismaStore) {
      const result = await this.confirmCheckoutWithPrisma(userId, orderId);
      if (result) {
        return result;
      }
    }

    return this.confirmCheckoutInMemory(userId, orderId);
  }

  async getMySubscription(userId: string): Promise<SubscriptionView> {
    const snapshot = await this.getLatestSubscription(userId);

    return {
      status: snapshot.status,
      planId: snapshot.planId,
      effectiveAt: snapshot.effectiveAt ? snapshot.effectiveAt.toISOString() : null,
      expireAt: snapshot.expireAt ? snapshot.expireAt.toISOString() : null,
      autoRenew: snapshot.autoRenew
    };
  }

  async getMyUsage(userId: string): Promise<UsageView> {
    const period = getCurrentPeriod();
    const plans = await this.plansService.listPlans();
    const currentPlanId = await this.resolveActivePlanIdForQuota(userId);
    const currentPlan = plans.find((item) => item.planId === currentPlanId) || plans.find((item) => item.planId === "free");
    const quotaTotal = currentPlan?.monthlyQuota || 20;

    if (!this.preferPrismaStore) {
      return {
        quotaTotal,
        quotaLeft: quotaTotal,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        ledgerItems: []
      };
    }

    try {
      const [ledgerItems, usedUnits] = await Promise.all([
        this.prisma.usageLedger.findMany({
          where: {
            userId,
            consumeAt: {
              gte: period.periodStart,
              lt: period.periodEnd
            }
          },
          orderBy: { consumeAt: "desc" },
          take: 20
        }),
        this.countReservedUnitsWithPrisma(userId, period.periodStart, period.periodEnd)
      ]);

      const quotaLeft = Math.max(0, quotaTotal - usedUnits);

      return {
        quotaTotal,
        quotaLeft,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        ledgerItems: ledgerItems.map((item) => ({
          ledgerId: item.ledgerId,
          userId: item.userId,
          taskId: item.taskId,
          consumeUnit: item.consumeUnit,
          status: item.status as "HELD" | "COMMITTED" | "RELEASED",
          source: item.source,
          consumeAt: item.consumeAt.toISOString()
        }))
      };
    } catch {
      return {
        quotaTotal,
        quotaLeft: quotaTotal,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        ledgerItems: []
      };
    }
  }

  private async getLatestSubscription(userId: string): Promise<SubscriptionSnapshot> {
    if (this.preferPrismaStore) {
      try {
        const subscription = await this.prisma.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" }
        });

        if (subscription) {
          return {
            status: subscription.status as SubscriptionStatus,
            planId: subscription.planId,
            effectiveAt: subscription.effectiveAt,
            expireAt: subscription.expireAt,
            autoRenew: subscription.autoRenew
          };
        }
      } catch {
        // no-op: fallback to free plan snapshot
      }
    }

    const memory = this.memorySubscriptions.get(userId) || [];
    if (memory.length > 0) {
      const latest = [...memory].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      return {
        status: latest.status,
        planId: latest.planId,
        effectiveAt: latest.effectiveAt,
        expireAt: latest.expireAt,
        autoRenew: latest.autoRenew
      };
    }

    return {
      status: "ACTIVE",
      planId: "free",
      effectiveAt: null,
      expireAt: null,
      autoRenew: false
    };
  }

  private async resolveActivePlanIdForQuota(userId: string): Promise<string> {
    const now = new Date();
    if (this.preferPrismaStore) {
      try {
        const subscription = await this.prisma.subscription.findFirst({
          where: {
            userId,
            status: "ACTIVE",
            AND: [
              {
                OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }]
              },
              {
                OR: [{ expireAt: null }, { expireAt: { gt: now } }]
              }
            ]
          },
          orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }]
        });

        if (subscription) {
          return subscription.planId;
        }
      } catch {
        // no-op: fallback to memory/free
      }
    }

    const memory = this.memorySubscriptions.get(userId) || [];
    const active = [...memory]
      .filter((item) => {
        if (item.status !== "ACTIVE") {
          return false;
        }
        if (item.effectiveAt && item.effectiveAt.getTime() > now.getTime()) {
          return false;
        }
        if (item.expireAt && item.expireAt.getTime() <= now.getTime()) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    return active?.planId || "free";
  }

  private async confirmCheckoutWithPrisma(userId: string, orderId: string): Promise<SubscriptionView | undefined> {
    try {
      const now = new Date();
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.subscription.findFirst({
          where: {
            userId,
            externalOrderId: orderId
          },
          orderBy: { createdAt: "desc" }
        });

        if (!target) {
          return undefined;
        }

        if (target.status !== "PENDING") {
          return {
            status: target.status as SubscriptionStatus,
            planId: target.planId,
            effectiveAt: target.effectiveAt ? target.effectiveAt.toISOString() : null,
            expireAt: target.expireAt ? target.expireAt.toISOString() : null,
            autoRenew: target.autoRenew
          };
        }

        await tx.subscription.updateMany({
          where: {
            userId,
            status: "ACTIVE",
            NOT: {
              subscriptionId: target.subscriptionId
            }
          },
          data: {
            status: "EXPIRED",
            expireAt: now,
            updatedAt: now
          }
        });

        const effectiveAt = now;
        const expireAt = calculateExpireAt(target.planId, effectiveAt);

        const updated = await tx.subscription.update({
          where: { subscriptionId: target.subscriptionId },
          data: {
            status: "ACTIVE",
            startedAt: target.startedAt || now,
            effectiveAt,
            expireAt,
            updatedAt: now
          }
        });

        await tx.outboxEvent.create({
          data: {
            eventId: this.buildId("evt"),
            eventType: "subscription.activated",
            aggregateType: "subscription",
            aggregateId: updated.subscriptionId,
            status: "PENDING",
            retryCount: 0,
            createdAt: now
          }
        });

        return {
          status: updated.status as SubscriptionStatus,
          planId: updated.planId,
          effectiveAt: updated.effectiveAt ? updated.effectiveAt.toISOString() : null,
          expireAt: updated.expireAt ? updated.expireAt.toISOString() : null,
          autoRenew: updated.autoRenew
        };
      });
    } catch {
      return undefined;
    }
  }

  private confirmCheckoutInMemory(userId: string, orderId: string): SubscriptionView | undefined {
    const records = this.memorySubscriptions.get(userId) || [];
    const target = [...records]
      .filter((item) => item.orderId === orderId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    if (!target) {
      return undefined;
    }

    if (target.status === "PENDING") {
      const now = new Date();
      for (const item of records) {
        if (item.subscriptionId !== target.subscriptionId && item.status === "ACTIVE") {
          item.status = "EXPIRED";
          item.expireAt = now;
        }
      }

      target.status = "ACTIVE";
      target.effectiveAt = now;
      target.expireAt = calculateExpireAt(target.planId, now);
    }

    this.memorySubscriptions.set(userId, records);
    return {
      status: target.status,
      planId: target.planId,
      effectiveAt: target.effectiveAt ? target.effectiveAt.toISOString() : null,
      expireAt: target.expireAt ? target.expireAt.toISOString() : null,
      autoRenew: target.autoRenew
    };
  }

  private appendMemorySubscription(userId: string, item: StoredSubscriptionRecord) {
    const current = this.memorySubscriptions.get(userId) || [];
    current.push(item);
    this.memorySubscriptions.set(userId, current);
  }

  private async countReservedUnitsWithPrisma(userId: string, periodStart: Date, periodEnd: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ usedUnits: number }>>(Prisma.sql`
      SELECT COALESCE(
        SUM(
          CASE
            WHEN ledger.committed_units > 0 THEN ledger.committed_units
            ELSE GREATEST(ledger.held_units - ledger.released_units, 0)
          END
        ),
        0
      )::int AS "usedUnits"
      FROM (
        SELECT
          task_id,
          COALESCE(SUM(CASE WHEN status = 'COMMITTED' THEN consume_unit ELSE 0 END), 0)::int AS committed_units,
          COALESCE(SUM(CASE WHEN status = 'HELD' THEN consume_unit ELSE 0 END), 0)::int AS held_units,
          COALESCE(SUM(CASE WHEN status = 'RELEASED' THEN consume_unit ELSE 0 END), 0)::int AS released_units
        FROM usage_ledger
        WHERE user_id = ${userId}
          AND consume_at >= ${periodStart}
          AND consume_at < ${periodEnd}
        GROUP BY task_id
      ) ledger
    `);

    return rows[0]?.usedUnits || 0;
  }

  private buildId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }
}

function calculateExpireAt(planId: string, effectiveAt: Date) {
  if (planId.includes("year")) {
    return new Date(Date.UTC(effectiveAt.getUTCFullYear() + 1, effectiveAt.getUTCMonth(), effectiveAt.getUTCDate(), 0, 0, 0, 0));
  }

  if (planId.includes("month")) {
    return new Date(Date.UTC(effectiveAt.getUTCFullYear(), effectiveAt.getUTCMonth() + 1, effectiveAt.getUTCDate(), 0, 0, 0, 0));
  }

  return null;
}

function getCurrentPeriod() {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return {
    periodStart,
    periodEnd
  };
}
