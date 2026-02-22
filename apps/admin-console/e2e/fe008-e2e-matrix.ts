import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface MatrixTarget {
  name: string;
  apiBaseUrl: string;
  source: "default" | "custom";
}

interface MatrixResult {
  name: string;
  apiBaseUrl: string;
  status: "passed" | "failed";
  preflight: string;
  durationMs: number;
  output: string;
}

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(CURRENT_DIR, "../.runtime/reports");
const MAX_OUTPUT = 1200;

function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }
  return `https://${url.replace(/\/+$/, "")}`;
}

function buildDefaultTargets(): MatrixTarget[] {
  const targets: MatrixTarget[] = [];

  const devBaseUrl = process.env.DEV_BASE_URL || process.env.LOCAL_BASE_URL || "http://127.0.0.1:3000";
  targets.push({
    name: "dev",
    apiBaseUrl: normalizeBaseUrl(devBaseUrl),
    source: "default"
  });

  if (process.env.SHARED_BASE_URL) {
    targets.push({
      name: "shared",
      apiBaseUrl: normalizeBaseUrl(process.env.SHARED_BASE_URL),
      source: "default"
    });
  }

  if (process.env.STAGING_BASE_URL) {
    targets.push({
      name: "staging",
      apiBaseUrl: normalizeBaseUrl(process.env.STAGING_BASE_URL),
      source: "default"
    });
  }

  return targets;
}

function parseCustomTargets(raw: string): MatrixTarget[] {
  return raw
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf("=");
      if (index <= 0 || index >= entry.length - 1) {
        throw new Error(`FE008_E2E_MATRIX_TARGETS 格式错误：${entry}，应为 name=url`);
      }
      const name = entry.slice(0, index).trim();
      const url = entry.slice(index + 1).trim();
      if (!name || !url) {
        throw new Error(`FE008_E2E_MATRIX_TARGETS 格式错误：${entry}，应为 name=url`);
      }

      return {
        name,
        apiBaseUrl: normalizeBaseUrl(url),
        source: "custom" as const
      };
    });
}

function resolveTargets() {
  const customTargets = process.env.FE008_E2E_MATRIX_TARGETS?.trim() || process.env.SMOKE_MATRIX_TARGETS?.trim();
  if (customTargets) {
    return parseCustomTargets(customTargets);
  }
  return buildDefaultTargets();
}

async function preflight(baseUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${baseUrl}/v1/system/capabilities`, {
      method: "GET",
      headers: {
        Authorization: "Bearer fe008_e2e_matrix",
        "X-Request-Id": `fe008_e2e_matrix_${Date.now()}`
      },
      signal: controller.signal
    });
    return `reachable:http_${response.status}`;
  } catch (error) {
    if (error instanceof Error) {
      return `unreachable:${error.message}`;
    }
    return "unreachable:unknown";
  } finally {
    clearTimeout(timer);
  }
}

function isLocalHost(baseUrl: string) {
  try {
    const target = new URL(baseUrl);
    return target.hostname === "127.0.0.1" || target.hostname === "localhost";
  } catch {
    return false;
  }
}

function runTarget(target: MatrixTarget): Promise<MatrixResult> {
  const startedAt = Date.now();
  return new Promise(async (resolveResult) => {
    const rawPreflightState = await preflight(target.apiBaseUrl);
    const chunks: string[] = [];

    const localApiTarget = isLocalHost(target.apiBaseUrl);
    const shouldStartLocalApi = localApiTarget ? "0" : "1";
    const preflightState =
      localApiTarget && rawPreflightState.startsWith("unreachable:")
        ? "deferred:local-webserver"
        : rawPreflightState;
    const command = [
      "pnpm",
      "--filter",
      "@apps/admin-console",
      "test:e2e:fe008"
    ];
    const child = spawn(command[0], command.slice(1), {
      env: {
        ...process.env,
        ADMIN_E2E_API_BASE_URL: target.apiBaseUrl,
        ADMIN_E2E_WEB_BASE_URL: process.env.ADMIN_E2E_WEB_BASE_URL || "http://127.0.0.1:3100",
        ADMIN_E2E_WEB_PORT: process.env.ADMIN_E2E_WEB_PORT || "3100",
        ADMIN_E2E_SKIP_API_SERVER: shouldStartLocalApi,
        ADMIN_E2E_REPORTER: "list-only",
        ADMIN_E2E_PLAYWRIGHT_REPORT_DIR: `.runtime/reports/playwright-fe008-${target.name}`,
        ADMIN_E2E_PLAYWRIGHT_OUTPUT_DIR: `.runtime/test-results/playwright-fe008-${target.name}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
    child.on("error", (error) => chunks.push(`[fe008-e2e-matrix] spawn error: ${error.message}`));
    child.on("close", (code) => {
      resolveResult({
        name: target.name,
        apiBaseUrl: target.apiBaseUrl,
        status: code === 0 ? "passed" : "failed",
        preflight: preflightState,
        durationMs: Date.now() - startedAt,
        output: chunks.join("").trim()
      });
    });
  });
}

function truncateOutput(output: string) {
  if (output.length <= MAX_OUTPUT) {
    return output;
  }
  return `${output.slice(0, MAX_OUTPUT)}...(truncated)`;
}

function buildReport(targets: MatrixTarget[], results: MatrixResult[]) {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# fe008 e2e matrix report");
  lines.push("");
  lines.push(`- generatedAt: ${generatedAt}`);
  lines.push(`- targets: ${targets.length}`);
  lines.push("");
  lines.push("| target | apiBaseUrl | source | preflight | status | durationMs |");
  lines.push("|---|---|---|---|---|---:|");

  for (const target of targets) {
    const result = results.find((item) => item.name === target.name);
    if (!result) {
      continue;
    }
    lines.push(
      `| ${target.name} | ${target.apiBaseUrl} | ${target.source} | ${result.preflight} | ${result.status} | ${result.durationMs} |`
    );
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
    throw new Error("未解析到任何目标环境，请检查 FE008_E2E_MATRIX_TARGETS 或相关环境变量");
  }

  console.log(`[fe008-e2e-matrix] targets=${targets.map((item) => `${item.name}:${item.apiBaseUrl}`).join(", ")}`);

  const results: MatrixResult[] = [];
  for (const target of targets) {
    console.log(`[fe008-e2e-matrix] running target=${target.name} apiBaseUrl=${target.apiBaseUrl}`);
    const result = await runTarget(target);
    results.push(result);
    console.log(
      `[fe008-e2e-matrix] target=${result.name} status=${result.status} preflight=${result.preflight} durationMs=${result.durationMs}`
    );
  }

  const report = buildReport(targets, results);
  const writeReport = process.env.FE008_E2E_MATRIX_WRITE_REPORT !== "0";
  if (writeReport) {
    mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = resolve(REPORT_DIR, `fe008-e2e-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(reportPath, report, "utf8");
    console.log(`[fe008-e2e-matrix] report=${reportPath}`);
  } else {
    console.log(report);
  }

  const failed = results.filter((item) => item.status === "failed");
  if (failed.length) {
    console.error(`[fe008-e2e-matrix] failed targets=${failed.map((item) => item.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("[fe008-e2e-matrix] all targets passed");
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[fe008-e2e-matrix] failed:", error.message);
  } else {
    console.error("[fe008-e2e-matrix] failed:", String(error));
  }
  process.exitCode = 1;
});
