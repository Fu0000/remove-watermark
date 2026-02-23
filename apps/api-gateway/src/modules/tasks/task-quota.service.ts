import { Prisma } from "@prisma/client";

export interface MemoryUsageLedgerRecord {
  userId: string;
  taskId: string;
  status: "HELD" | "COMMITTED" | "RELEASED";
  consumeUnit: number;
  consumeAt: string;
}

export interface QuotaCheckResult {
  quotaTotal: number;
  usedUnits: number;
  exceeded: boolean;
}

export class TaskQuotaService {
  constructor(private readonly freeMonthlyQuota: number) {}

  checkInMemory(
    userId: string,
    usageLedgers: Iterable<MemoryUsageLedgerRecord>,
    referenceDate = new Date()
  ): QuotaCheckResult {
    const { periodStart, periodEnd } = this.getCurrentPeriod(referenceDate);
    const usedUnits = this.countReservedUnitsInMemory(userId, usageLedgers, periodStart, periodEnd);
    return {
      quotaTotal: this.freeMonthlyQuota,
      usedUnits,
      exceeded: usedUnits >= this.freeMonthlyQuota
    };
  }

  async checkWithPrisma(tx: Prisma.TransactionClient, userId: string, at: Date): Promise<QuotaCheckResult> {
    const { periodStart, periodEnd } = this.getCurrentPeriod(at);
    const quotaTotal = await this.resolveMonthlyQuotaWithPrisma(tx, userId, at);
    const usedUnits = await this.countReservedUnitsWithPrisma(tx, userId, periodStart, periodEnd);
    return {
      quotaTotal,
      usedUnits,
      exceeded: usedUnits >= quotaTotal
    };
  }

  private getCurrentPeriod(referenceDate = new Date()) {
    const periodStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    const periodEnd = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );
    return {
      periodStart,
      periodEnd
    };
  }

  private async resolveMonthlyQuotaWithPrisma(tx: Prisma.TransactionClient, userId: string, at: Date) {
    const activeSubscription = await tx.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        AND: [
          {
            OR: [{ effectiveAt: null }, { effectiveAt: { lte: at } }]
          },
          {
            OR: [{ expireAt: null }, { expireAt: { gt: at } }]
          }
        ]
      },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }]
    });

    const planId = activeSubscription?.planId || "free";
    const plan = await tx.plan.findUnique({
      where: { planId }
    });

    if (plan?.monthlyQuota && plan.monthlyQuota > 0) {
      return plan.monthlyQuota;
    }

    const freePlan = await tx.plan.findUnique({
      where: { planId: "free" }
    });
    return freePlan?.monthlyQuota || this.freeMonthlyQuota;
  }

  private async countReservedUnitsWithPrisma(
    tx: Prisma.TransactionClient,
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ) {
    const rows = await tx.$queryRaw<Array<{ usedUnits: number }>>(Prisma.sql`
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

  private countReservedUnitsInMemory(
    userId: string,
    usageLedgers: Iterable<MemoryUsageLedgerRecord>,
    periodStart: Date,
    periodEnd: Date
  ) {
    const summary = new Map<string, { committed: number; held: number; released: number }>();

    for (const ledger of usageLedgers) {
      if (ledger.userId !== userId) {
        continue;
      }

      const consumeAt = Date.parse(ledger.consumeAt);
      if (!Number.isFinite(consumeAt)) {
        continue;
      }
      if (consumeAt < periodStart.getTime() || consumeAt >= periodEnd.getTime()) {
        continue;
      }

      const current = summary.get(ledger.taskId) || { committed: 0, held: 0, released: 0 };
      if (ledger.status === "COMMITTED") {
        current.committed += ledger.consumeUnit;
      } else if (ledger.status === "HELD") {
        current.held += ledger.consumeUnit;
      } else {
        current.released += ledger.consumeUnit;
      }
      summary.set(ledger.taskId, current);
    }

    let usedUnits = 0;
    for (const item of summary.values()) {
      if (item.committed > 0) {
        usedUnits += item.committed;
      } else {
        usedUnits += Math.max(0, item.held - item.released);
      }
    }
    return usedUnits;
  }
}
