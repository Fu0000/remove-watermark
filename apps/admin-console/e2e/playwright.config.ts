import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const rootDir = resolve(__dirname, "..");
const reportDir = resolve(rootDir, ".runtime/reports/playwright-fe008");
const outputDir = resolve(rootDir, ".runtime/test-results/playwright-fe008");

const apiBaseUrl = process.env.ADMIN_E2E_API_BASE_URL || "http://127.0.0.1:3000";
const webBaseUrl = process.env.ADMIN_E2E_WEB_BASE_URL || "http://127.0.0.1:3100";

export default defineConfig({
  testDir: __dirname,
  testMatch: ["**/*.spec.ts"],
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: reportDir, open: "never" }]],
  outputDir,
  use: {
    baseURL: webBaseUrl,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @apps/api-gateway exec tsx src/main.ts",
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        APP_ENV: "dev",
        DATABASE_URL: "",
        TASKS_STORE: "memory",
        SUBSCRIPTIONS_STORE: "memory",
        WEBHOOKS_STORE: "memory",
        COMPLIANCE_STORE: "memory",
        ADMIN_RBAC_SECRET: process.env.ADMIN_E2E_ADMIN_SECRET || "admin123"
      }
    },
    {
      command: "pnpm --filter @apps/admin-console exec next dev -p 3100",
      port: 3100,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        APP_ENV: "dev",
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        NEXT_PUBLIC_SHARED_AUTH_CODE: process.env.ADMIN_E2E_AUTH_CODE || "admin",
        NEXT_PUBLIC_SHARED_USERNAME: process.env.ADMIN_E2E_USERNAME || "admin",
        NEXT_PUBLIC_SHARED_PASSWORD: process.env.ADMIN_E2E_PASSWORD || "admin123",
        ADMIN_PROXY_ROLE: "admin",
        ADMIN_PROXY_AUTH_CODE: process.env.ADMIN_E2E_AUTH_CODE || "admin",
        ADMIN_PROXY_USERNAME: process.env.ADMIN_E2E_USERNAME || "admin",
        ADMIN_PROXY_PASSWORD: process.env.ADMIN_E2E_PASSWORD || "admin123",
        ADMIN_PROXY_SECRET: process.env.ADMIN_E2E_ADMIN_SECRET || "admin123"
      }
    }
  ]
});
