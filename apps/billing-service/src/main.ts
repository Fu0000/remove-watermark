import { createLogger, readEnv } from "@packages/shared";
import { PrismaClient } from "@prisma/client";
import { resolveReconciliationMode, runReconciliation } from "./reconciliation/job";

const appName = "billing-service";
const logger = createLogger(appName);
const prisma = new PrismaClient();

async function bootstrap() {
  const env = readEnv("NODE_ENV", "dev");
  const mode = resolveReconciliationMode(readEnv("BILLING_RECON_MODE", "hourly-incremental"));
  const checkpointKey = readEnv("BILLING_RECON_CHECKPOINT_KEY", "usage_ledger_monthly");

  logger.info({ env, mode, checkpointKey }, "billing reconciliation started");

  const summary = await runReconciliation({
    prisma,
    mode,
    checkpointKey,
    logger
  });

  logger.info({ summary }, "billing reconciliation finished");
  await prisma.$disconnect();
}

bootstrap().catch((error) => {
  logger.error({ error }, "service startup failed");
  prisma
    .$disconnect()
    .catch(() => {
      // no-op
    })
    .finally(() => process.exit(1));
});
