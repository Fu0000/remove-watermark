import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface SmokeTarget {
  name: string;
  baseUrl: string;
  source: "default" | "custom";
}

interface SmokeResult {
  name: string;
  baseUrl: string;
  status: "passed" | "failed";
  preflight: string;
  durationMs: number;
  output: string;
}

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const SHARED_SMOKE_SCRIPT = resolve(CURRENT_DIR, "shared-smoke.ts");
const REPORT_DIR = resolve(CURRENT_DIR, "../.runtime/reports");

function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }

  return `https://${url.replace(/\/+$/, "")}`;
}

function buildDefaultTargets(): SmokeTarget[] {
  const targets: SmokeTarget[] = [];

  const devBaseUrl = process.env.DEV_BASE_URL || process.env.LOCAL_BASE_URL || "http://127.0.0.1:3000";
  targets.push({
    name: "dev",
    baseUrl: normalizeBaseUrl(devBaseUrl),
    source: "default"
  });

  if (process.env.SHARED_BASE_URL) {
    targets.push({
      name: "shared",
      baseUrl: normalizeBaseUrl(process.env.SHARED_BASE_URL),
      source: "default"
    });
  }

  if (process.env.STAGING_BASE_URL) {
    targets.push({
      name: "staging",
      baseUrl: normalizeBaseUrl(process.env.STAGING_BASE_URL),
      source: "default"
    });
  }

  return targets;
}

function parseCustomTargets(raw: string): SmokeTarget[] {
  return raw
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf("=");
      if (index <= 0 || index >= entry.length - 1) {
        throw new Error(`SMOKE_MATRIX_TARGETS 格式错误：${entry}，应为 name=url`);
      }

      const name = entry.slice(0, index).trim();
      const url = entry.slice(index + 1).trim();

      if (!name || !url) {
        throw new Error(`SMOKE_MATRIX_TARGETS 格式错误：${entry}，应为 name=url`);
      }

      return {
        name,
        baseUrl: normalizeBaseUrl(url),
        source: "custom" as const
      };
    });
}

function resolveTargets(): SmokeTarget[] {
  const customTargets = process.env.SMOKE_MATRIX_TARGETS?.trim();
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
        Authorization: "Bearer smoke_matrix",
        "X-Request-Id": `matrix_preflight_${Date.now()}`
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

function runSharedSmoke(target: SmokeTarget): Promise<SmokeResult> {
  const startedAt = Date.now();

  return new Promise(async (resolveResult) => {
    const preflightState = await preflight(target.baseUrl);
    const nodeArgs = ["--import", "tsx", SHARED_SMOKE_SCRIPT];
    const outputChunks: string[] = [];

    const child = spawn(process.execPath, nodeArgs, {
      env: {
        ...process.env,
        SHARED_BASE_URL: target.baseUrl
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => outputChunks.push(String(chunk)));

    child.on("error", (error) => {
      outputChunks.push(`[matrix] spawn error: ${error.message}`);
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startedAt;
      resolveResult({
        name: target.name,
        baseUrl: target.baseUrl,
        status: code === 0 ? "passed" : "failed",
        preflight: preflightState,
        durationMs,
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

function buildReport(targets: SmokeTarget[], results: SmokeResult[]) {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# shared smoke matrix report`);
  lines.push(``);
  lines.push(`- generatedAt: ${generatedAt}`);
  lines.push(`- targets: ${targets.length}`);
  lines.push(``);
  lines.push(`| target | baseUrl | source | preflight | status | durationMs |`);
  lines.push(`|---|---|---|---|---|---:|`);

  for (const target of targets) {
    const result = results.find((item) => item.name === target.name);
    if (!result) {
      continue;
    }

    lines.push(
      `| ${target.name} | ${target.baseUrl} | ${target.source} | ${result.preflight} | ${result.status} | ${result.durationMs} |`
    );
  }

  lines.push(``);
  lines.push(`## output`);

  for (const result of results) {
    lines.push(``);
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
    throw new Error("未解析到任何目标环境，请检查 SMOKE_MATRIX_TARGETS 或相关环境变量");
  }

  console.log(`[shared-smoke-matrix] targets=${targets.map((item) => `${item.name}:${item.baseUrl}`).join(", ")}`);

  const results: SmokeResult[] = [];
  for (const target of targets) {
    console.log(`[shared-smoke-matrix] running target=${target.name} baseUrl=${target.baseUrl}`);
    const result = await runSharedSmoke(target);
    results.push(result);
    console.log(
      `[shared-smoke-matrix] target=${result.name} status=${result.status} preflight=${result.preflight} durationMs=${result.durationMs}`
    );
  }

  const report = buildReport(targets, results);
  const writeReport = process.env.SMOKE_MATRIX_WRITE_REPORT !== "0";
  let reportPath = "";

  if (writeReport) {
    mkdirSync(REPORT_DIR, { recursive: true });
    reportPath = resolve(REPORT_DIR, `shared-smoke-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(reportPath, report, "utf8");
    console.log(`[shared-smoke-matrix] report=${reportPath}`);
  }

  const failed = results.filter((item) => item.status === "failed");
  if (failed.length) {
    console.error(`[shared-smoke-matrix] failed targets=${failed.map((item) => item.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("[shared-smoke-matrix] all targets passed");
  if (!writeReport) {
    console.log(report);
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[shared-smoke-matrix] failed:", error.message);
  } else {
    console.error("[shared-smoke-matrix] failed:", String(error));
  }
  process.exitCode = 1;
});
