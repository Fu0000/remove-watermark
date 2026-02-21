import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface DrillTarget {
  name: string;
  databaseUrl: string;
  redisUrl: string;
  source: "default" | "custom";
}

interface DrillResult {
  name: string;
  status: "passed" | "failed";
  durationMs: number;
  output: string;
}

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(CURRENT_DIR, "../../.runtime/reports");

function parseCustomTargets(raw: string): DrillTarget[] {
  return raw
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eqIndex = entry.indexOf("=");
      const pipeIndex = entry.indexOf("|", eqIndex + 1);
      if (eqIndex <= 0 || pipeIndex <= eqIndex + 1 || pipeIndex >= entry.length - 1) {
        throw new Error(`DRILL_MATRIX_TARGETS 格式错误：${entry}，应为 name=databaseUrl|redisUrl`);
      }

      const name = entry.slice(0, eqIndex).trim();
      const databaseUrl = entry.slice(eqIndex + 1, pipeIndex).trim();
      const redisUrl = entry.slice(pipeIndex + 1).trim();
      if (!name || !databaseUrl || !redisUrl) {
        throw new Error(`DRILL_MATRIX_TARGETS 格式错误：${entry}，应为 name=databaseUrl|redisUrl`);
      }

      return {
        name,
        databaseUrl,
        redisUrl,
        source: "custom" as const
      };
    });
}

function buildDefaultTargets() {
  const targets: DrillTarget[] = [];

  const devDatabaseUrl = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  const devRedisUrl = process.env.DEV_REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379";
  if (devDatabaseUrl) {
    targets.push({
      name: "dev",
      databaseUrl: devDatabaseUrl,
      redisUrl: devRedisUrl,
      source: "default"
    });
  }

  const sharedDatabaseUrl = process.env.SHARED_DATABASE_URL;
  const sharedRedisUrl = process.env.SHARED_REDIS_URL || process.env.REDIS_URL;
  if (sharedDatabaseUrl && sharedRedisUrl) {
    targets.push({
      name: "shared",
      databaseUrl: sharedDatabaseUrl,
      redisUrl: sharedRedisUrl,
      source: "default"
    });
  }

  const stagingDatabaseUrl = process.env.STAGING_DATABASE_URL;
  const stagingRedisUrl = process.env.STAGING_REDIS_URL || process.env.REDIS_URL;
  if (stagingDatabaseUrl && stagingRedisUrl) {
    targets.push({
      name: "staging",
      databaseUrl: stagingDatabaseUrl,
      redisUrl: stagingRedisUrl,
      source: "default"
    });
  }

  return targets;
}

function resolveTargets() {
  const custom = process.env.DRILL_MATRIX_TARGETS?.trim();
  if (custom) {
    return parseCustomTargets(custom);
  }

  return buildDefaultTargets();
}

function runGuardDrill(target: DrillTarget): Promise<DrillResult> {
  const startedAt = Date.now();

  return new Promise((resolveResult) => {
    const outputChunks: string[] = [];
    const child = spawn(
      "pnpm",
      ["--filter", "@apps/worker-orchestrator", "ops:deadletter:guard-drill"],
      {
        env: {
          ...process.env,
          DATABASE_URL: target.databaseUrl,
          REDIS_URL: target.redisUrl
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    child.stdout.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => outputChunks.push(String(chunk)));

    child.on("error", (error) => {
      outputChunks.push(`[guard-drill-matrix] spawn error: ${error.message}`);
    });

    child.on("close", (code) => {
      resolveResult({
        name: target.name,
        status: code === 0 ? "passed" : "failed",
        durationMs: Date.now() - startedAt,
        output: outputChunks.join("").trim()
      });
    });
  });
}

function truncateOutput(output: string, maxLength = 1000) {
  if (output.length <= maxLength) {
    return output;
  }
  return `${output.slice(0, maxLength)}...(truncated)`;
}

function buildReport(targets: DrillTarget[], results: DrillResult[]) {
  const lines: string[] = [];
  lines.push("# deadletter guard drill matrix report");
  lines.push("");
  lines.push(`- generatedAt: ${new Date().toISOString()}`);
  lines.push(`- targets: ${targets.length}`);
  lines.push("");
  lines.push("| target | source | status | durationMs |");
  lines.push("|---|---|---|---:|");
  for (const target of targets) {
    const result = results.find((item) => item.name === target.name);
    if (!result) {
      continue;
    }
    lines.push(`| ${target.name} | ${target.source} | ${result.status} | ${result.durationMs} |`);
  }

  lines.push("");
  lines.push("## output");
  for (const result of results) {
    lines.push("");
    lines.push(`### ${result.name}`);
    lines.push("```text");
    lines.push(truncateOutput(result.output || "(no output)"));
    lines.push("```");
  }

  return lines.join("\n");
}

async function main() {
  const targets = resolveTargets();
  if (!targets.length) {
    throw new Error(
      "未解析到目标环境，请设置 DATABASE_URL/DEV_DATABASE_URL 或 DRILL_MATRIX_TARGETS 后再执行"
    );
  }

  console.log(
    `[deadletter-guard-drill-matrix] targets=${targets.map((item) => `${item.name}:${item.source}`).join(", ")}`
  );

  const results: DrillResult[] = [];
  for (const target of targets) {
    console.log(`[deadletter-guard-drill-matrix] running target=${target.name}`);
    const result = await runGuardDrill(target);
    results.push(result);
    console.log(
      `[deadletter-guard-drill-matrix] target=${target.name} status=${result.status} durationMs=${result.durationMs}`
    );
  }

  const report = buildReport(targets, results);
  const writeReport = process.env.DRILL_MATRIX_WRITE_REPORT !== "0";
  let reportPath = "";
  if (writeReport) {
    mkdirSync(REPORT_DIR, { recursive: true });
    reportPath = resolve(
      REPORT_DIR,
      `deadletter-guard-drill-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.md`
    );
    writeFileSync(reportPath, report, "utf8");
    console.log(`[deadletter-guard-drill-matrix] report=${reportPath}`);
  }

  const failed = results.filter((item) => item.status === "failed");
  if (failed.length > 0) {
    console.error(
      `[deadletter-guard-drill-matrix] failed targets=${failed.map((item) => item.name).join(", ")}`
    );
    process.exitCode = 1;
    return;
  }

  console.log("[deadletter-guard-drill-matrix] all targets passed");
  if (!writeReport) {
    console.log(report);
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[deadletter-guard-drill-matrix] failed:", error.message);
  } else {
    console.error("[deadletter-guard-drill-matrix] failed:", String(error));
  }
  process.exitCode = 1;
});
