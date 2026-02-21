import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ExistsRow {
  exists: boolean;
}

async function hasIndex(tableName: string, indexName: string) {
  const rows = await prisma.$queryRaw<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE tablename = ${tableName}
        AND indexname = ${indexName}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function hasPrimaryKey(tableRegclass: string, constraintName: string) {
  const rows = await prisma.$queryRaw<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = to_regclass(${tableRegclass})
        AND contype = 'p'
        AND conname = ${constraintName}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const usageLedgerUnique = await hasIndex("usage_ledger", "uk_usage_ledger_task_status_source");
  const idempotencyUnique = await hasIndex("idempotency_keys", "uk_idempotency_keys_user_key");
  const outboxPrimary = await hasPrimaryKey("outbox_events", "outbox_events_pkey");

  assertCondition(usageLedgerUnique, "missing unique index: uk_usage_ledger_task_status_source");
  assertCondition(idempotencyUnique, "missing unique index: uk_idempotency_keys_user_key");
  assertCondition(outboxPrimary, "missing primary key: outbox_events_pkey");

  const suffix = Date.now().toString(36);
  const userId = `u_idx_${suffix}`;
  const taskId = `tsk_idx_${suffix}`;
  const idemKey = `idem_idx_${suffix}`;
  const eventId = `evt_idx_${suffix}`;
  const ledgerIdA = `led_idx_${suffix}_a`;
  const ledgerIdB = `led_idx_${suffix}_b`;

  const idemInsertA = await prisma.$executeRaw`
    INSERT INTO idempotency_keys(id, user_id, idempotency_key, payload_hash, task_id, created_at, updated_at)
    VALUES (${`idp_idx_${suffix}_a`}, ${userId}, ${idemKey}, ${"hash_a"}, ${taskId}, now(), now())
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
  `;
  const idemInsertB = await prisma.$executeRaw`
    INSERT INTO idempotency_keys(id, user_id, idempotency_key, payload_hash, task_id, created_at, updated_at)
    VALUES (${`idp_idx_${suffix}_b`}, ${userId}, ${idemKey}, ${"hash_b"}, ${taskId}, now(), now())
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
  `;

  const usageInsertA = await prisma.$executeRaw`
    INSERT INTO usage_ledger(ledger_id, user_id, task_id, status, source, consume_unit, consume_at)
    VALUES (${ledgerIdA}, ${userId}, ${taskId}, ${"HELD"}, ${"task_create"}, 1, now())
    ON CONFLICT (user_id, task_id, status, source) DO NOTHING
  `;
  const usageInsertB = await prisma.$executeRaw`
    INSERT INTO usage_ledger(ledger_id, user_id, task_id, status, source, consume_unit, consume_at)
    VALUES (${ledgerIdB}, ${userId}, ${taskId}, ${"HELD"}, ${"task_create"}, 1, now())
    ON CONFLICT (user_id, task_id, status, source) DO NOTHING
  `;

  const outboxInsertA = await prisma.$executeRaw`
    INSERT INTO outbox_events(event_id, event_type, aggregate_type, aggregate_id, status, retry_count, created_at)
    VALUES (${eventId}, ${"task.created"}, ${"task"}, ${taskId}, ${"PENDING"}, 0, now())
    ON CONFLICT (event_id) DO NOTHING
  `;
  const outboxInsertB = await prisma.$executeRaw`
    INSERT INTO outbox_events(event_id, event_type, aggregate_type, aggregate_id, status, retry_count, created_at)
    VALUES (${eventId}, ${"task.created"}, ${"task"}, ${taskId}, ${"PENDING"}, 0, now())
    ON CONFLICT (event_id) DO NOTHING
  `;

  assertCondition(idemInsertA === 1, "first idempotency insert should be 1");
  assertCondition(idemInsertB === 0, "second idempotency insert should be deduped");
  assertCondition(usageInsertA === 1, "first usage_ledger insert should be 1");
  assertCondition(usageInsertB === 0, "second usage_ledger insert should be deduped");
  assertCondition(outboxInsertA === 1, "first outbox insert should be 1");
  assertCondition(outboxInsertB === 0, "second outbox insert should be deduped");

  await prisma.$executeRaw`
    DELETE FROM outbox_events WHERE event_id = ${eventId}
  `;
  await prisma.$executeRaw`
    DELETE FROM usage_ledger WHERE ledger_id IN (${ledgerIdA}, ${ledgerIdB})
  `;
  await prisma.$executeRaw`
    DELETE FROM idempotency_keys WHERE user_id = ${userId} AND idempotency_key = ${idemKey}
  `;

  console.log("[data-dedupe-index-check] passed");
  console.log(
    JSON.stringify(
      {
        indexes: {
          usageLedgerUnique,
          idempotencyUnique,
          outboxPrimary
        },
        dedupe: {
          idempotency: [idemInsertA, idemInsertB],
          usageLedger: [usageInsertA, usageInsertB],
          outbox: [outboxInsertA, outboxInsertB]
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("[data-dedupe-index-check] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
