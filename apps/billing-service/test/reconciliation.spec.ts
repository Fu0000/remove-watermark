import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { monthKeyFromDate, runReconciliation } from "../src/reconciliation/job";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark";

test("reconciliation job should support hourly incremental and daily full modes", async () => {
  const prisma = new PrismaClient();
  const runIds: string[] = [];
  const now = Date.now();
  const userId = `u_rec_${now}`;
  const checkpointKey = `usage_ledger_monthly_test_${now}`;
  const taskIdA = `tsk_rec_${now}_a`;
  const taskIdB = `tsk_rec_${now}_b`;
  const taskIdC = `tsk_rec_${now}_c`;
  const ledgerIdA = `leg_rec_${now}_a`;
  const ledgerIdB = `leg_rec_${now}_b`;
  const ledgerIdC = `leg_rec_${now}_c`;
  const baseline = new Date(now - 10_000);
  const consumeAtA = new Date(now - 3_000);
  const consumeAtB = new Date(now - 2_000);
  const consumeAtC = new Date(now - 1_000);
  const monthKey = monthKeyFromDate(consumeAtA);

  try {
    await prisma.billingReconcileCheckpoint.upsert({
      where: { checkpointKey },
      create: {
        checkpointKey,
        watermarkAt: baseline,
        metaJson: {
          watermarkLedgerId: null
        }
      },
      update: {
        watermarkAt: baseline,
        metaJson: {
          watermarkLedgerId: null
        }
      }
    });

    await prisma.usageLedger.createMany({
      data: [
        {
          ledgerId: ledgerIdA,
          userId,
          taskId: taskIdA,
          status: "HELD",
          source: "test_reconcile",
          consumeUnit: 1,
          consumeAt: consumeAtA
        },
        {
          ledgerId: ledgerIdB,
          userId,
          taskId: taskIdB,
          status: "COMMITTED",
          source: "test_reconcile",
          consumeUnit: 1,
          consumeAt: consumeAtB
        }
      ]
    });

    const firstRun = await runReconciliation({
      prisma,
      mode: "hourly-incremental",
      checkpointKey
    });
    runIds.push(firstRun.runId);

    assert.equal(firstRun.status, "SUCCEEDED");
    assert.equal(firstRun.scannedRows, 2);
    assert.equal(firstRun.mismatchCount, 0);

    const afterFirst = await prisma.billingReconcileMonthly.findUnique({
      where: {
        monthKey_userId: {
          monthKey,
          userId
        }
      }
    });

    assert.equal(afterFirst?.heldUnits, 1);
    assert.equal(afterFirst?.committedUnits, 1);
    assert.equal(afterFirst?.releasedUnits, 0);
    assert.equal(afterFirst?.ledgerCount, 2);

    await prisma.usageLedger.create({
      data: {
        ledgerId: ledgerIdC,
        userId,
        taskId: taskIdC,
        status: "COMMITTED",
        source: "test_reconcile",
        consumeUnit: 1,
        consumeAt: consumeAtC
      }
    });

    const secondRun = await runReconciliation({
      prisma,
      mode: "hourly-incremental",
      checkpointKey
    });
    runIds.push(secondRun.runId);

    assert.equal(secondRun.status, "SUCCEEDED");
    assert.equal(secondRun.scannedRows, 1);
    assert.equal(secondRun.mismatchCount, 0);

    const afterSecond = await prisma.billingReconcileMonthly.findUnique({
      where: {
        monthKey_userId: {
          monthKey,
          userId
        }
      }
    });

    assert.equal(afterSecond?.heldUnits, 1);
    assert.equal(afterSecond?.committedUnits, 2);
    assert.equal(afterSecond?.releasedUnits, 0);
    assert.equal(afterSecond?.ledgerCount, 3);

    const dailyRun = await runReconciliation({
      prisma,
      mode: "daily-full",
      checkpointKey
    });
    runIds.push(dailyRun.runId);

    assert.equal(dailyRun.status, "SUCCEEDED");
    assert.equal(dailyRun.mismatchCount, 0);

    const afterDaily = await prisma.billingReconcileMonthly.findUnique({
      where: {
        monthKey_userId: {
          monthKey,
          userId
        }
      }
    });

    assert.equal(afterDaily?.heldUnits, 1);
    assert.equal(afterDaily?.committedUnits, 2);
    assert.equal(afterDaily?.releasedUnits, 0);
    assert.equal(afterDaily?.ledgerCount, 3);
  } finally {
    await prisma.usageLedger.deleteMany({
      where: {
        ledgerId: {
          in: [ledgerIdA, ledgerIdB, ledgerIdC]
        }
      }
    });

    await prisma.billingReconcileMonthly.deleteMany({
      where: {
        userId
      }
    });

    if (runIds.length > 0) {
      await prisma.billingReconcileRun.deleteMany({
        where: {
          runId: {
            in: runIds
          }
        }
      });
    }

    await prisma.billingReconcileCheckpoint.deleteMany({
      where: {
        checkpointKey
      }
    });

    await prisma.$disconnect();
  }
});
