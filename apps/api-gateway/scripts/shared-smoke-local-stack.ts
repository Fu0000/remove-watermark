import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type StepStatus = "passed" | "failed";

interface StepResult {
  step: string;
  status: StepStatus;
  detail: string;
}

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(CURRENT_DIR, "../.runtime/logs");
const REPORT_DIR = resolve(CURRENT_DIR, "../.runtime/reports");

function normalizeBaseUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }

  return `https://${url.replace(/\/+$/, "")}`;
}

function isLocalUrl(url: string) {
  return url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
}

function sleep(ms: number) {
  return new Promise((resolveFn) => setTimeout(resolveFn, ms));
}

async function waitForGateway(baseUrl: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/v1/plans`, {
        method: "GET",
        headers: {
          Authorization: "Bearer local_stack_runner",
          "X-Request-Id": `local_stack_preflight_${Date.now()}`
        }
      });
      if (response.status < 500) {
        return;
      }
    } catch {
      // keep waiting
    }
    await sleep(500);
  }

  throw new Error(`api-gateway not ready within ${timeoutMs}ms`);
}

function spawnProcess(input: {
  name: string;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  logPath: string;
}) {
  const out = createWriteStream(input.logPath, { flags: "w" });
  const child = spawn(input.command, input.args, {
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk) => out.write(chunk));
  child.stderr?.on("data", (chunk) => out.write(chunk));
  child.on("error", (error) => {
    out.write(`[${input.name}] spawn error: ${error.message}\n`);
  });

  return {
    child,
    close: () =>
      new Promise<void>((resolveFn) => {
        out.end(() => resolveFn());
      })
  };
}

function runCommand(input: {
  stepName: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  logPath: string;
}) {
  return new Promise<void>((resolveFn, rejectFn) => {
    const out = createWriteStream(input.logPath, { flags: "w" });
    const child = spawn("pnpm", input.args, {
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (chunk) => {
      process.stdout.write(chunk);
      out.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      process.stderr.write(chunk);
      out.write(chunk);
    });
    child.on("error", (error) => {
      out.write(`[${input.stepName}] spawn error: ${error.message}\n`);
    });
    child.on("close", (code) => {
      out.end();
      if (code === 0) {
        resolveFn();
        return;
      }
      rejectFn(new Error(`${input.stepName} failed with exitCode=${code}`));
    });
  });
}

async function stopProcess(child: ChildProcess) {
  if (!child.pid || child.killed) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveFn) => {
      child.once("close", () => resolveFn());
    }),
    sleep(4000)
  ]);

  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

function buildReport(input: {
  startedAt: Date;
  baseUrl: string;
  databaseUrl: string;
  steps: StepResult[];
  logs: Record<string, string>;
}) {
  const lines: string[] = [];
  lines.push("# shared smoke local stack report");
  lines.push("");
  lines.push(`- startedAt: ${input.startedAt.toISOString()}`);
  lines.push(`- baseUrl: ${input.baseUrl}`);
  lines.push(`- databaseUrl: ${input.databaseUrl}`);
  lines.push("");
  lines.push("| step | status | detail |");
  lines.push("|---|---|---|");
  input.steps.forEach((step) => {
    lines.push(`| ${step.step} | ${step.status} | ${step.detail} |`);
  });
  lines.push("");
  lines.push("## logs");
  Object.entries(input.logs).forEach(([name, path]) => {
    lines.push(`- ${name}: ${path}`);
  });

  return lines.join("\n");
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  const startedAt = new Date();
  const baseUrl = normalizeBaseUrl(process.env.SHARED_BASE_URL || "http://127.0.0.1:3000");
  if (!isLocalUrl(baseUrl)) {
    throw new Error(`shared-smoke-local-stack 仅支持本地地址，当前=${baseUrl}`);
  }

  const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark";
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const resetBeforeRun = process.env.SHARED_SMOKE_LOCAL_RESET_USER !== "0";

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const logs = {
    reset: resolve(LOG_DIR, `shared-smoke-local-stack-reset-${stamp}.log`),
    api: resolve(LOG_DIR, `shared-smoke-local-stack-api-${stamp}.log`),
    worker: resolve(LOG_DIR, `shared-smoke-local-stack-worker-${stamp}.log`),
    smoke: resolve(LOG_DIR, `shared-smoke-local-stack-smoke-${stamp}.log`)
  };
  const reportPath = resolve(REPORT_DIR, `shared-smoke-local-stack-${stamp}.md`);

  const commonEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    TASKS_STORE: process.env.TASKS_STORE || "prisma",
    SUBSCRIPTIONS_STORE: process.env.SUBSCRIPTIONS_STORE || "prisma",
    REDIS_URL: redisUrl
  };

  const steps: StepResult[] = [];
  let apiProcess: ReturnType<typeof spawnProcess> | undefined;
  let workerProcess: ReturnType<typeof spawnProcess> | undefined;

  try {
    if (resetBeforeRun) {
      console.log("[shared-smoke-local-stack] step=reset-user");
      await runCommand({
        stepName: "shared-smoke:reset-user",
        args: ["--filter", "@apps/api-gateway", "test:shared-smoke:reset-user"],
        env: commonEnv,
        logPath: logs.reset
      });
      steps.push({
        step: "reset-user",
        status: "passed",
        detail: "local smoke user reset completed"
      });
    }

    console.log("[shared-smoke-local-stack] step=start-api");
    apiProcess = spawnProcess({
      name: "api-gateway",
      command: "pnpm",
      args: ["--filter", "@apps/api-gateway", "dev"],
      env: commonEnv,
      logPath: logs.api
    });

    console.log("[shared-smoke-local-stack] step=start-worker");
    workerProcess = spawnProcess({
      name: "worker-orchestrator",
      command: "pnpm",
      args: ["--filter", "@apps/worker-orchestrator", "dev"],
      env: commonEnv,
      logPath: logs.worker
    });

    console.log("[shared-smoke-local-stack] step=wait-gateway");
    await waitForGateway(baseUrl, Number(process.env.SHARED_SMOKE_LOCAL_READY_TIMEOUT_MS || 90000));
    steps.push({
      step: "stack-ready",
      status: "passed",
      detail: `${baseUrl} reachable`
    });

    console.log("[shared-smoke-local-stack] step=run-shared-smoke");
    await runCommand({
      stepName: "shared-smoke",
      args: ["--filter", "@apps/api-gateway", "test:shared-smoke"],
      env: {
        ...commonEnv,
        SHARED_BASE_URL: baseUrl,
        SHARED_SMOKE_MAX_POLL_ATTEMPTS: process.env.SHARED_SMOKE_MAX_POLL_ATTEMPTS || "80",
        SHARED_SMOKE_POLL_INTERVAL_MS: process.env.SHARED_SMOKE_POLL_INTERVAL_MS || "300"
      },
      logPath: logs.smoke
    });
    steps.push({
      step: "shared-smoke",
      status: "passed",
      detail: "INT-002/INT-004/INT-005/INT-006/INT-007 + FE-007/FE-008 passed"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push({
      step: "local-stack",
      status: "failed",
      detail: message
    });
    throw error;
  } finally {
    if (workerProcess) {
      await stopProcess(workerProcess.child);
      await workerProcess.close();
    }
    if (apiProcess) {
      await stopProcess(apiProcess.child);
      await apiProcess.close();
    }

    const report = buildReport({
      startedAt,
      baseUrl,
      databaseUrl,
      steps,
      logs
    });
    writeFileSync(reportPath, report, "utf8");
    console.log(`[shared-smoke-local-stack] report=${reportPath}`);
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error("[shared-smoke-local-stack] failed:", error.message);
  } else {
    console.error("[shared-smoke-local-stack] failed:", String(error));
  }
  process.exitCode = 1;
});
