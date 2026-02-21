import { Inject, Injectable } from "@nestjs/common";
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

    if (!this.preferPrismaStore) {
      return payload;
    }

    try {
      const now = new Date();
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
    const snapshot = await this.getLatestSubscription(userId);
    const plans = await this.plansService.listPlans();
    const currentPlan = plans.find((item) => item.planId === snapshot.planId) || plans.find((item) => item.planId === "free");
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
      const [ledgerItems, committedAggregate] = await Promise.all([
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
        this.prisma.usageLedger.aggregate({
          _sum: {
            consumeUnit: true
          },
          where: {
            userId,
            status: "COMMITTED",
            consumeAt: {
              gte: period.periodStart,
              lt: period.periodEnd
            }
          }
        })
      ]);

      const consumed = committedAggregate._sum.consumeUnit || 0;
      const quotaLeft = Math.max(0, quotaTotal - consumed);

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

    return {
      status: "ACTIVE",
      planId: "free",
      effectiveAt: null,
      expireAt: null,
      autoRenew: false
    };
  }

  private buildId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }
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
