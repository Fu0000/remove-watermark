import { createLogger } from "@packages/shared";
import { Prisma, PrismaClient } from "@prisma/client";

export type ReconciliationMode = "hourly-incremental" | "daily-full";
export type ReconciliationStatus = "SUCCEEDED" | "FAILED" | "MISMATCH";

export interface ReconciliationSummary {
  runId: string;
  mode: ReconciliationMode;
  status: ReconciliationStatus;
  checkpointKey: string;
  windowStart: string | null;
  windowEnd: string;
  scannedRows: number;
  impactedUsers: number;
  impactedMonths: number;
  mismatchCount: number;
  watermarkAt: string | null;
  watermarkLedgerId: string | null;
}

export interface RunReconciliationOptions {
  prisma: PrismaClient;
  mode: ReconciliationMode;
  checkpointKey?: string;
  now?: Date;
  logger?: ReturnType<typeof createLogger>;
}

interface ReconcilePeriodKey {
  monthKey: string;
  userId: string;
}

interface MonthlyAggregate extends ReconcilePeriodKey {
  committedUnits: number;
  heldUnits: number;
  releasedUnits: number;
  ledgerCount: number;
  firstConsumeAt: Date | null;
  lastConsumeAt: Date | null;
}

interface MismatchRecord extends ReconcilePeriodKey {
  expectedCommittedUnits: number;
  expectedHeldUnits: number;
  expectedReleasedUnits: number;
  expectedLedgerCount: number;
  actualCommittedUnits: number;
  actualHeldUnits: number;
  actualReleasedUnits: number;
  actualLedgerCount: number;
}

interface CheckpointMarker {
  watermarkAt: Date | null;
  watermarkLedgerId: string | null;
}

interface IncrementalWindowStats {
  scannedRows: number;
  periods: ReconcilePeriodKey[];
  nextMarker: CheckpointMarker;
}

interface ModeExecutionResult {
  windowStart: Date | null;
  windowEnd: Date;
  scannedRows: number;
  impactedUsers: number;
  impactedMonths: number;
  mismatches: MismatchRecord[];
  nextMarker: CheckpointMarker;
  summaryJson: Prisma.InputJsonValue;
}

const CHECKPOINT_KEY_DEFAULT = "usage_ledger_monthly";
const RUN_MODE_DB: Record<ReconciliationMode, "HOURLY_INCREMENTAL" | "DAILY_FULL"> = {
  "hourly-incremental": "HOURLY_INCREMENTAL",
  "daily-full": "DAILY_FULL"
};

function buildId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function normalizeMode(input: string): ReconciliationMode {
  const normalized = input.trim().toLowerCase();
  if (normalized === "hourly-incremental" || normalized === "hourly_incremental" || normalized === "hourly") {
    return "hourly-incremental";
  }
  if (normalized === "daily-full" || normalized === "daily_full" || normalized === "daily") {
    return "daily-full";
  }
  return "hourly-incremental";
}

function readCheckpointMarker(meta: Prisma.JsonValue | null | undefined, watermarkAt: Date | null): CheckpointMarker {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {
      watermarkAt,
      watermarkLedgerId: null
    };
  }

  const metaObject = meta as Record<string, unknown>;
  const watermarkLedgerId = typeof metaObject.watermarkLedgerId === "string" ? metaObject.watermarkLedgerId : null;

  return {
    watermarkAt,
    watermarkLedgerId
  };
}

function toMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthRange(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function chunkArray<T>(input: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }
  return chunks;
}

function buildPeriodScopeSql(periods: ReconcilePeriodKey[]) {
  const fragments = periods.map((period) =>
    Prisma.sql`SELECT ${period.monthKey}::char(7) AS month_key, ${period.userId}::varchar(64) AS user_id`
  );
  return Prisma.join(fragments, " UNION ALL ");
}

function buildIncrementalPredicate(marker: CheckpointMarker, windowEnd: Date) {
  if (!marker.watermarkAt) {
    return Prisma.sql`consume_at <= ${windowEnd}`;
  }

  if (!marker.watermarkLedgerId) {
    return Prisma.sql`consume_at > ${marker.watermarkAt} AND consume_at <= ${windowEnd}`;
  }

  return Prisma.sql`
    (consume_at > ${marker.watermarkAt}
    OR (consume_at = ${marker.watermarkAt} AND ledger_id > ${marker.watermarkLedgerId}))
    AND consume_at <= ${windowEnd}
  `;
}

async function queryIncrementalWindowStats(
  prisma: PrismaClient,
  marker: CheckpointMarker,
  windowEnd: Date
): Promise<IncrementalWindowStats> {
  const predicate = buildIncrementalPredicate(marker, windowEnd);
  const [periodRows, scannedRowsRaw, latestRows] = await Promise.all([
    prisma.$queryRaw<Array<{ monthKey: string; userId: string }>>(Prisma.sql`
      SELECT
        TO_CHAR((consume_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS "monthKey",
        user_id AS "userId"
      FROM usage_ledger
      WHERE ${predicate}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `),
    prisma.$queryRaw<Array<{ scannedRows: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "scannedRows"
      FROM usage_ledger
      WHERE ${predicate}
    `),
    prisma.$queryRaw<Array<{ consumeAt: Date; ledgerId: string }>>(Prisma.sql`
      SELECT consume_at AS "consumeAt", ledger_id AS "ledgerId"
      FROM usage_ledger
      WHERE ${predicate}
      ORDER BY consume_at DESC, ledger_id DESC
      LIMIT 1
    `)
  ]);

  const latest = latestRows[0];
  const nextMarker: CheckpointMarker = {
    watermarkAt: latest ? latest.consumeAt : marker.watermarkAt ?? windowEnd,
    watermarkLedgerId: latest ? latest.ledgerId : marker.watermarkLedgerId
  };

  return {
    scannedRows: scannedRowsRaw[0]?.scannedRows ?? 0,
    periods: periodRows,
    nextMarker
  };
}

async function queryMonthlyAggregatesForPeriods(
  prisma: PrismaClient,
  periods: ReconcilePeriodKey[]
): Promise<MonthlyAggregate[]> {
  if (periods.length === 0) {
    return [];
  }

  const scopeSql = buildPeriodScopeSql(periods);

  return prisma.$queryRaw<MonthlyAggregate[]>(Prisma.sql`
    WITH period_scope AS (${scopeSql})
    SELECT
      scope.month_key AS "monthKey",
      scope.user_id AS "userId",
      COALESCE(SUM(CASE WHEN usage.status = 'COMMITTED' THEN usage.consume_unit ELSE 0 END), 0)::int AS "committedUnits",
      COALESCE(SUM(CASE WHEN usage.status = 'HELD' THEN usage.consume_unit ELSE 0 END), 0)::int AS "heldUnits",
      COALESCE(SUM(CASE WHEN usage.status = 'RELEASED' THEN usage.consume_unit ELSE 0 END), 0)::int AS "releasedUnits",
      COUNT(usage.ledger_id)::int AS "ledgerCount",
      MIN(usage.consume_at) AS "firstConsumeAt",
      MAX(usage.consume_at) AS "lastConsumeAt"
    FROM period_scope scope
    LEFT JOIN usage_ledger usage
      ON usage.user_id = scope.user_id
      AND TO_CHAR((usage.consume_at AT TIME ZONE 'UTC'), 'YYYY-MM') = scope.month_key
    GROUP BY scope.month_key, scope.user_id
    ORDER BY scope.month_key, scope.user_id
  `);
}

async function queryMonthlyAggregatesGlobal(prisma: PrismaClient): Promise<MonthlyAggregate[]> {
  return prisma.$queryRaw<MonthlyAggregate[]>(Prisma.sql`
    SELECT
      TO_CHAR((consume_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS "monthKey",
      user_id AS "userId",
      COALESCE(SUM(CASE WHEN status = 'COMMITTED' THEN consume_unit ELSE 0 END), 0)::int AS "committedUnits",
      COALESCE(SUM(CASE WHEN status = 'HELD' THEN consume_unit ELSE 0 END), 0)::int AS "heldUnits",
      COALESCE(SUM(CASE WHEN status = 'RELEASED' THEN consume_unit ELSE 0 END), 0)::int AS "releasedUnits",
      COUNT(ledger_id)::int AS "ledgerCount",
      MIN(consume_at) AS "firstConsumeAt",
      MAX(consume_at) AS "lastConsumeAt"
    FROM usage_ledger
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
}

async function queryLatestLedgerMarker(prisma: PrismaClient): Promise<CheckpointMarker> {
  const rows = await prisma.$queryRaw<Array<{ consumeAt: Date; ledgerId: string }>>(Prisma.sql`
    SELECT consume_at AS "consumeAt", ledger_id AS "ledgerId"
    FROM usage_ledger
    ORDER BY consume_at DESC, ledger_id DESC
    LIMIT 1
  `);

  const latest = rows[0];
  return {
    watermarkAt: latest?.consumeAt ?? null,
    watermarkLedgerId: latest?.ledgerId ?? null
  };
}

async function queryLedgerRowCount(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ scannedRows: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "scannedRows" FROM usage_ledger
  `);
  return rows[0]?.scannedRows ?? 0;
}

async function upsertMonthlyAggregates(
  prisma: PrismaClient,
  aggregates: MonthlyAggregate[],
  reconciledAt: Date
) {
  if (aggregates.length === 0) {
    return;
  }

  for (const chunk of chunkArray(aggregates, 200)) {
    await prisma.$transaction(
      chunk.map((aggregate) =>
        prisma.billingReconcileMonthly.upsert({
          where: {
            monthKey_userId: {
              monthKey: aggregate.monthKey,
              userId: aggregate.userId
            }
          },
          create: {
            monthKey: aggregate.monthKey,
            userId: aggregate.userId,
            committedUnits: aggregate.committedUnits,
            heldUnits: aggregate.heldUnits,
            releasedUnits: aggregate.releasedUnits,
            ledgerCount: aggregate.ledgerCount,
            firstConsumeAt: aggregate.firstConsumeAt,
            lastConsumeAt: aggregate.lastConsumeAt,
            sourceUpdatedAt: aggregate.lastConsumeAt ?? reconciledAt,
            reconciledAt,
            createdAt: reconciledAt,
            updatedAt: reconciledAt
          },
          update: {
            committedUnits: aggregate.committedUnits,
            heldUnits: aggregate.heldUnits,
            releasedUnits: aggregate.releasedUnits,
            ledgerCount: aggregate.ledgerCount,
            firstConsumeAt: aggregate.firstConsumeAt,
            lastConsumeAt: aggregate.lastConsumeAt,
            sourceUpdatedAt: aggregate.lastConsumeAt ?? reconciledAt,
            reconciledAt,
            updatedAt: reconciledAt
          }
        })
      )
    );
  }
}

async function rebuildMonthlyAggregates(
  prisma: PrismaClient,
  aggregates: MonthlyAggregate[],
  reconciledAt: Date
) {
  await prisma.$transaction(async (tx) => {
    await tx.billingReconcileMonthly.deleteMany({});

    for (const chunk of chunkArray(aggregates, 500)) {
      await tx.billingReconcileMonthly.createMany({
        data: chunk.map((aggregate) => ({
          monthKey: aggregate.monthKey,
          userId: aggregate.userId,
          committedUnits: aggregate.committedUnits,
          heldUnits: aggregate.heldUnits,
          releasedUnits: aggregate.releasedUnits,
          ledgerCount: aggregate.ledgerCount,
          firstConsumeAt: aggregate.firstConsumeAt,
          lastConsumeAt: aggregate.lastConsumeAt,
          sourceUpdatedAt: aggregate.lastConsumeAt ?? reconciledAt,
          reconciledAt,
          createdAt: reconciledAt,
          updatedAt: reconciledAt
        }))
      });
    }
  });
}

async function fetchStoredAggregatesForPeriods(
  prisma: PrismaClient,
  periods: ReconcilePeriodKey[]
): Promise<MonthlyAggregate[]> {
  if (periods.length === 0) {
    return [];
  }

  const scopeSql = buildPeriodScopeSql(periods);
  return prisma.$queryRaw<MonthlyAggregate[]>(Prisma.sql`
    WITH period_scope AS (${scopeSql})
    SELECT
      monthly.month_key AS "monthKey",
      monthly.user_id AS "userId",
      monthly.committed_units AS "committedUnits",
      monthly.held_units AS "heldUnits",
      monthly.released_units AS "releasedUnits",
      monthly.ledger_count AS "ledgerCount",
      monthly.first_consume_at AS "firstConsumeAt",
      monthly.last_consume_at AS "lastConsumeAt"
    FROM billing_reconcile_monthly monthly
    INNER JOIN period_scope scope
      ON monthly.month_key = scope.month_key
      AND monthly.user_id = scope.user_id
    ORDER BY monthly.month_key, monthly.user_id
  `);
}

function buildMismatchRecords(expected: MonthlyAggregate[], actual: MonthlyAggregate[]): MismatchRecord[] {
  const expectedMap = new Map<string, MonthlyAggregate>();
  const actualMap = new Map<string, MonthlyAggregate>();

  for (const aggregate of expected) {
    expectedMap.set(`${aggregate.monthKey}:${aggregate.userId}`, aggregate);
  }
  for (const aggregate of actual) {
    actualMap.set(`${aggregate.monthKey}:${aggregate.userId}`, aggregate);
  }

  const allKeys = new Set([...expectedMap.keys(), ...actualMap.keys()]);
  const mismatches: MismatchRecord[] = [];

  for (const key of allKeys) {
    const source = expectedMap.get(key);
    const target = actualMap.get(key);
    const [monthKey, userId] = key.split(":");

    const sourceCommitted = source?.committedUnits ?? 0;
    const sourceHeld = source?.heldUnits ?? 0;
    const sourceReleased = source?.releasedUnits ?? 0;
    const sourceCount = source?.ledgerCount ?? 0;

    const targetCommitted = target?.committedUnits ?? 0;
    const targetHeld = target?.heldUnits ?? 0;
    const targetReleased = target?.releasedUnits ?? 0;
    const targetCount = target?.ledgerCount ?? 0;

    if (
      sourceCommitted !== targetCommitted ||
      sourceHeld !== targetHeld ||
      sourceReleased !== targetReleased ||
      sourceCount !== targetCount
    ) {
      mismatches.push({
        monthKey,
        userId,
        expectedCommittedUnits: sourceCommitted,
        expectedHeldUnits: sourceHeld,
        expectedReleasedUnits: sourceReleased,
        expectedLedgerCount: sourceCount,
        actualCommittedUnits: targetCommitted,
        actualHeldUnits: targetHeld,
        actualReleasedUnits: targetReleased,
        actualLedgerCount: targetCount
      });
    }
  }

  mismatches.sort((left, right) =>
    `${left.monthKey}:${left.userId}`.localeCompare(`${right.monthKey}:${right.userId}`)
  );
  return mismatches;
}

function serializeSummary(input: {
  mode: ReconciliationMode;
  checkpointKey: string;
  windowStart: Date | null;
  windowEnd: Date;
  scannedRows: number;
  impactedUsers: number;
  impactedMonths: number;
  mismatches: MismatchRecord[];
  marker: CheckpointMarker;
}) {
  return JSON.parse(
    JSON.stringify({
      mode: input.mode,
      checkpointKey: input.checkpointKey,
      windowStart: input.windowStart?.toISOString() ?? null,
      windowEnd: input.windowEnd.toISOString(),
      scannedRows: input.scannedRows,
      impactedUsers: input.impactedUsers,
      impactedMonths: input.impactedMonths,
      mismatchCount: input.mismatches.length,
      mismatchSample: input.mismatches.slice(0, 20),
      mismatchOverflow: Math.max(0, input.mismatches.length - 20),
      watermarkAt: input.marker.watermarkAt?.toISOString() ?? null,
      watermarkLedgerId: input.marker.watermarkLedgerId
    })
  ) as Prisma.InputJsonValue;
}

async function executeHourlyIncremental(
  prisma: PrismaClient,
  checkpointMarker: CheckpointMarker,
  checkpointKey: string,
  windowEnd: Date
): Promise<ModeExecutionResult> {
  const windowStats = await queryIncrementalWindowStats(prisma, checkpointMarker, windowEnd);
  const aggregates = await queryMonthlyAggregatesForPeriods(prisma, windowStats.periods);
  await upsertMonthlyAggregates(prisma, aggregates, windowEnd);

  const persisted = await fetchStoredAggregatesForPeriods(prisma, windowStats.periods);
  const mismatches = buildMismatchRecords(aggregates, persisted);

  const impactedUsers = new Set(windowStats.periods.map((period) => period.userId)).size;
  const impactedMonths = new Set(windowStats.periods.map((period) => period.monthKey)).size;

  return {
    windowStart: checkpointMarker.watermarkAt,
    windowEnd,
    scannedRows: windowStats.scannedRows,
    impactedUsers,
    impactedMonths,
    mismatches,
    nextMarker: windowStats.nextMarker,
    summaryJson: serializeSummary({
      mode: "hourly-incremental",
      checkpointKey,
      windowStart: checkpointMarker.watermarkAt,
      windowEnd,
      scannedRows: windowStats.scannedRows,
      impactedUsers,
      impactedMonths,
      mismatches,
      marker: windowStats.nextMarker
    })
  };
}

async function executeDailyFull(
  prisma: PrismaClient,
  checkpointKey: string,
  windowEnd: Date
): Promise<ModeExecutionResult> {
  const [aggregates, scannedRows, marker] = await Promise.all([
    queryMonthlyAggregatesGlobal(prisma),
    queryLedgerRowCount(prisma),
    queryLatestLedgerMarker(prisma)
  ]);

  await rebuildMonthlyAggregates(prisma, aggregates, windowEnd);

  const persisted = await prisma.billingReconcileMonthly.findMany({
    select: {
      monthKey: true,
      userId: true,
      committedUnits: true,
      heldUnits: true,
      releasedUnits: true,
      ledgerCount: true,
      firstConsumeAt: true,
      lastConsumeAt: true
    },
    orderBy: [{ monthKey: "asc" }, { userId: "asc" }]
  });
  const mismatches = buildMismatchRecords(aggregates, persisted);

  const impactedUsers = new Set(aggregates.map((aggregate) => aggregate.userId)).size;
  const impactedMonths = new Set(aggregates.map((aggregate) => aggregate.monthKey)).size;

  return {
    windowStart: null,
    windowEnd,
    scannedRows,
    impactedUsers,
    impactedMonths,
    mismatches,
    nextMarker: {
      watermarkAt: marker.watermarkAt ?? windowEnd,
      watermarkLedgerId: marker.watermarkLedgerId
    },
    summaryJson: serializeSummary({
      mode: "daily-full",
      checkpointKey,
      windowStart: null,
      windowEnd,
      scannedRows,
      impactedUsers,
      impactedMonths,
      mismatches,
      marker
    })
  };
}

export async function runReconciliation(options: RunReconciliationOptions): Promise<ReconciliationSummary> {
  const logger = options.logger ?? createLogger("billing-reconcile");
  const mode = options.mode;
  const checkpointKey = options.checkpointKey || CHECKPOINT_KEY_DEFAULT;
  const prisma = options.prisma;
  const windowEnd = options.now ?? new Date();
  const runId = buildId("rec");
  const startedAt = new Date();

  const checkpoint = await prisma.billingReconcileCheckpoint.findUnique({
    where: { checkpointKey }
  });
  const checkpointMarker = readCheckpointMarker(checkpoint?.metaJson, checkpoint?.watermarkAt ?? null);

  await prisma.billingReconcileRun.create({
    data: {
      runId,
      mode: RUN_MODE_DB[mode],
      status: "FAILED",
      windowStart: mode === "hourly-incremental" ? checkpointMarker.watermarkAt : null,
      windowEnd,
      scannedRows: 0,
      impactedUsers: 0,
      impactedMonths: 0,
      mismatchCount: 0,
      summaryJson: {
        phase: "started",
        checkpointKey
      },
      startedAt
    }
  });

  try {
    const execution =
      mode === "hourly-incremental"
        ? await executeHourlyIncremental(prisma, checkpointMarker, checkpointKey, windowEnd)
        : await executeDailyFull(prisma, checkpointKey, windowEnd);

    const status: ReconciliationStatus = execution.mismatches.length > 0 ? "MISMATCH" : "SUCCEEDED";
    const finishedAt = new Date();

    await prisma.billingReconcileRun.update({
      where: { runId },
      data: {
        status,
        windowStart: execution.windowStart,
        windowEnd: execution.windowEnd,
        scannedRows: execution.scannedRows,
        impactedUsers: execution.impactedUsers,
        impactedMonths: execution.impactedMonths,
        mismatchCount: execution.mismatches.length,
        summaryJson: execution.summaryJson,
        finishedAt
      }
    });

    if (status === "SUCCEEDED") {
      await prisma.billingReconcileCheckpoint.upsert({
        where: {
          checkpointKey
        },
        create: {
          checkpointKey,
          watermarkAt: execution.nextMarker.watermarkAt,
          lastRunId: runId,
          lastMode: RUN_MODE_DB[mode],
          metaJson: {
            watermarkLedgerId: execution.nextMarker.watermarkLedgerId,
            scannedRows: execution.scannedRows,
            mismatchCount: 0,
            updatedAt: finishedAt.toISOString()
          },
          createdAt: finishedAt,
          updatedAt: finishedAt
        },
        update: {
          watermarkAt: execution.nextMarker.watermarkAt,
          lastRunId: runId,
          lastMode: RUN_MODE_DB[mode],
          metaJson: {
            watermarkLedgerId: execution.nextMarker.watermarkLedgerId,
            scannedRows: execution.scannedRows,
            mismatchCount: 0,
            updatedAt: finishedAt.toISOString()
          },
          updatedAt: finishedAt
        }
      });
    }

    const summary: ReconciliationSummary = {
      runId,
      mode,
      status,
      checkpointKey,
      windowStart: execution.windowStart ? execution.windowStart.toISOString() : null,
      windowEnd: execution.windowEnd.toISOString(),
      scannedRows: execution.scannedRows,
      impactedUsers: execution.impactedUsers,
      impactedMonths: execution.impactedMonths,
      mismatchCount: execution.mismatches.length,
      watermarkAt: execution.nextMarker.watermarkAt ? execution.nextMarker.watermarkAt.toISOString() : null,
      watermarkLedgerId: execution.nextMarker.watermarkLedgerId
    };

    if (status === "MISMATCH") {
      logger.warn(
        {
          runId,
          mode,
          checkpointKey,
          mismatchCount: execution.mismatches.length
        },
        "billing reconciliation completed with mismatches"
      );
    } else {
      logger.info(
        {
          runId,
          mode,
          checkpointKey,
          scannedRows: execution.scannedRows,
          impactedUsers: execution.impactedUsers,
          impactedMonths: execution.impactedMonths
        },
        "billing reconciliation completed"
      );
    }

    return summary;
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "unknown reconciliation error";
    await prisma.billingReconcileRun.update({
      where: { runId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 2000),
        finishedAt
      }
    });

    logger.error(
      {
        runId,
        checkpointKey,
        mode,
        error
      },
      "billing reconciliation failed"
    );
    throw error;
  }
}

export function resolveReconciliationMode(rawMode: string): ReconciliationMode {
  return normalizeMode(rawMode);
}

export function monthKeyFromDate(date: Date) {
  return toMonthKey(date);
}

export function monthRangeByKey(monthKey: string) {
  return monthRange(monthKey);
}
