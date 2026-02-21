import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/modules/app.module";
import { ComplianceService } from "../src/modules/compliance/compliance.service";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function main() {
  const retentionDays = parsePositiveInt(process.env.AUDIT_LOG_RETENTION_DAYS, 180);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false
  });

  try {
    const complianceService = app.get(ComplianceService);
    const result = await complianceService.purgeExpiredAuditLogs(retentionDays);
    console.log(
      JSON.stringify(
        {
          scope: "audit-retention",
          retentionDays,
          ...result
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[audit-retention] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
