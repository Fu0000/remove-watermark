import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface MatrixTarget {
  name: string;
  databaseUrl: string;
  source: "default" | "custom";
}

interface CommandResult {
  label: "smoke" | "int007-local";
  status: "passed" | "failed";
  durationMs: number;
  output: string;
}

interface TargetResult {
  name: string;
  databaseUrl: string;
  source: "default" | "custom";
  status: "passed" | "failed";
  durationMs: number;
  commands: CommandResult[];
}

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(CURRENT_DIR, "../.runtime/reports");
const SMOKE_SCRIPT = resolve(CURRENT_DIR, "smoke.ts");
const INT007_SCRIPT = resolve(CURRENT_DIR, "int007-local.ts");

function parseCustomTargets(raw: string): MatrixTarget[] {
  return raw
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf("=");
      if (index <= 0 || index >= entry.length - 1) {
        throw new Error(`INT007_MATRIX_TARGETS 格式错误：${entry}，应为 name=databaseUrl`);
      }

      const name = entry.slice(0, index).trim();
      const databaseUrl = entry.slice(index + 1).trim();
      if (!name || !databaseUrl) {
        throw new Error(`INT007_MATRIX_TARGETS 格式错误：${entry}，应为 name=databaseUrl`);
      }

      return {
        name,
        databaseUrl,
        source: "custom" as const
      };
    });
}

function buildDefaultTargets(): MatrixTarget[] {
  const targets: MatrixTarget[] = [];
  const devDatabaseUrl = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  if (devDatabaseUrl) {
    targets.push({
      name: "dev",
      databaseUrl: devDatabaseUrl,
      source: "default"
    });
  }

  const sharedDatabaseUrl = process.env.SHARED_DATABASE_URL;
  if (sharedDatabaseUrl) {
    targets.push({
      name: "shared",
      databaseUrl: sharedDatabaseUrl,
      source: "default"
    });
  }

  const stagingDatabaseUrl = process.env.STAGING_DATABASE_URL;
  if (stagingDatabaseUrl) {
    targets.push({
      name: "staging",
      databaseUrl: stagingDatabaseUrl,
      source: "default"
    });
  }

  return targets;
}

function resolveTargets() {
  const custom = process.env.INT007_MATRIX_TARGETS?.trim();
  if (custom) {
    return parseCustomTargets(custom);
  }
  return buildDefaultTargets();
}

function truncateOutput(output: string, maxLength = 1200) {
  if (output.length <= maxLength) {
    return output;
  }
  return `${output.slice(0, maxLength)}...(truncated)`;
}

function runScript(label: "smoke" | "int007-local", scriptPath: string, databaseUrl: string): Promise<CommandResult> {
  const startedAt = Date.now();

  return new Promise((resolveResult) => {
    const outputChunks: string[] = [];
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.on("error", (error) => outputChunks.push(`[int007-matrix] spawn error: ${error.message}`));
    child.on("close", (code) => {
      resolveResult({
        label,
        status: code === 0 ? "passed" : "failed",
        durationMs: Date.now() - startedAt,
        output: outputChunks.join("").trim()
      });
    });
  });
}

async function runTarget(target: MatrixTarget): Promise<TargetResult> {
  const startedAt = Date.now();
  const smoke = await runScript("smoke", SMOKE_SCRIPT, target.databaseUrl);
  const int007 = await runScript("int007-local", INT007_SCRIPT, target.databaseUrl);
  const status: "passed" | "failed" = smoke.status === "passed" && int007.status === "passed" ? "passed" : "failed";

  return {
    name: target.name,
    databaseUrl: target.databaseUrl,
    source: target.source,
    status,
    durationMs: Date.now() - startedAt,
    commands: [smoke, int007]
  };
}

function buildReport(results: TargetResult[]) {
  const lines: string[] = [];
  lines.push("# int007 local matrix report");
  lines.push("");
  lines.push(`- generatedAt: ${new Date().toISOString()}`);
  lines.push(`- targets: ${results.length}`);
  lines.push("");
  lines.push("| target | source | status | durationMs | smoke | int007-local |");
  lines.push("|---|---|---|---:|---|---|");
  for (const item of results) {
    const smoke = item.commands.find((command) => command.label === "smoke");
    const int007 = item.commands.find((command) => command.label === "int007-local");
    lines.push(
      `| ${item.name} | ${item.source} | ${item.status} | ${item.durationMs} | ${smoke?.status || "n/a"} | ${int007?.status || "n/a"} |`
    );
  }

  lines.push("");
  lines.push("## output");
  for (const item of results) {
    lines.push("");
    lines.push(`### ${item.name}`);
    for (const command of item.commands) {
      lines.push("");
      lines.push(`#### ${command.label}`);
      lines.push("```text");
      lines.push(truncateOutput(command.output || "(no output)"));
      lines.push("```");
    }
  }

  return lines.join("\n");
}

async function main() {
  const targets = resolveTargets();
  if (!targets.length) {
    throw new Error(
      "未解析到目标环境，请设置 DATABASE_URL/DEV_DATABASE_URL/SHARED_DATABASE_URL/STAGING_DATABASE_URL 或 INT007_MATRIX_TARGETS"
    );
  }

  console.log(`[int007-matrix] targets=${targets.map((item) => `${item.name}:${item.source}`).join(", ")}`);

  const results: TargetResult[] = [];
  for (const target of targets) {
    console.log(`[int007-matrix] running target=${target.name}`);
    const result = await runTarget(target);
    results.push(result);
    console.log(`[int007-matrix] target=${target.name} status=${result.status} durationMs=${result.durationMs}`);
  }

  const report = buildReport(results);
  const writeReport = process.env.INT007_MATRIX_WRITE_REPORT !== "0";
  if (writeReport) {
    mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = resolve(REPORT_DIR, `int007-local-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(reportPath, report, "utf8");
    console.log(`[int007-matrix] report=${reportPath}`);
  } else {
    console.log(report);
  }

  const failed = results.filter((item) => item.status === "failed");
  if (failed.length) {
    console.error(`[int007-matrix] failed targets=${failed.map((item) => item.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("[int007-matrix] all targets passed");
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[int007-matrix] failed:", error.message);
  } else {
    console.error("[int007-matrix] failed:", String(error));
  }
  process.exitCode = 1;
});
