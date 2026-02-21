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
  const limit = parsePositiveInt(process.env.COMPLIANCE_RECONCILE_LIMIT, 20);
  const dueOnly = process.env.COMPLIANCE_RECONCILE_DUE_ONLY !== "false";

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false
  });

  try {
    const complianceService = app.get(ComplianceService);
    const summary = await complianceService.processPendingDeleteRequests({
      limit,
      dueOnly
    });

    console.log(
      JSON.stringify(
        {
          scope: "account-delete-reconcile",
          limit,
          dueOnly,
          ...summary
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
  console.error("[account-delete-reconcile] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
