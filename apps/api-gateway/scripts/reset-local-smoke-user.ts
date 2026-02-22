import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertLocalDatabaseUrl(databaseUrl: string) {
  const isLocal = /127\.0\.0\.1|localhost/.test(databaseUrl);
  const allowNonLocal = process.env.ALLOW_NON_LOCAL_RESET === "true";
  if (!isLocal && !allowNonLocal) {
    throw new Error(
      "refuse to reset non-local database. set ALLOW_NON_LOCAL_RESET=true to override explicitly"
    );
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertLocalDatabaseUrl(databaseUrl);

  const userId = process.env.RESET_SMOKE_USER_ID || "u_1001";
  console.log(`[reset-local-smoke-user] start userId=${userId}`);

  const result = await prisma.$transaction(async (tx) => {
    const webhookDeliveries = await tx.webhookDelivery.deleteMany({ where: { userId } });
    const webhookEndpoints = await tx.webhookEndpoint.deleteMany({ where: { userId } });
    const usageLedgers = await tx.usageLedger.deleteMany({ where: { userId } });
    const taskActionIdempotency = await tx.taskActionIdempotency.deleteMany({ where: { userId } });
    const taskIdempotencyKeys = await tx.taskIdempotencyKey.deleteMany({ where: { userId } });
    const taskViewDeletions = await tx.taskViewDeletion.deleteMany({ where: { userId } });
    const assets = await tx.asset.deleteMany({ where: { userId } });
    const tasks = await tx.task.deleteMany({ where: { userId } });
    const subscriptions = await tx.subscription.deleteMany({ where: { userId } });
    const accountDeleteRequests = await tx.accountDeleteRequest.deleteMany({ where: { userId } });
    const auditLogs = await tx.auditLog.deleteMany({ where: { userId } });
    const complianceIdempotency = await tx.complianceIdempotency.deleteMany({ where: { userId } });

    return {
      webhookDeliveries: webhookDeliveries.count,
      webhookEndpoints: webhookEndpoints.count,
      usageLedgers: usageLedgers.count,
      taskActionIdempotency: taskActionIdempotency.count,
      taskIdempotencyKeys: taskIdempotencyKeys.count,
      taskViewDeletions: taskViewDeletions.count,
      assets: assets.count,
      tasks: tasks.count,
      subscriptions: subscriptions.count,
      accountDeleteRequests: accountDeleteRequests.count,
      auditLogs: auditLogs.count,
      complianceIdempotency: complianceIdempotency.count
    };
  });

  console.log("[reset-local-smoke-user] done", result);
}

main()
  .catch((error) => {
    console.error("[reset-local-smoke-user] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
