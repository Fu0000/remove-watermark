import { ensureAuthorization } from "./auth";
import { forbidden } from "./http-errors";

export type AdminRole = "admin" | "operator" | "auditor";
export type AdminPermission =
  | "admin:task:read"
  | "admin:task:replay"
  | "admin:plan:read"
  | "admin:plan:write"
  | "admin:webhook:read"
  | "admin:webhook:retry";

const DEFAULT_ADMIN_SECRET = "admin123";
const PROTECTED_RUNTIME_ENV = new Set(["shared", "staging", "prod", "production"]);

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  admin: [
    "admin:task:read",
    "admin:task:replay",
    "admin:plan:read",
    "admin:plan:write",
    "admin:webhook:read",
    "admin:webhook:retry"
  ],
  operator: ["admin:task:read", "admin:task:replay", "admin:plan:read", "admin:webhook:read", "admin:webhook:retry"],
  auditor: ["admin:task:read", "admin:plan:read", "admin:webhook:read"]
};

export function assertAdminRbacConfig() {
  const runtimeEnv = resolveRuntimeEnv();
  const configuredSecret = process.env.ADMIN_RBAC_SECRET;

  if (PROTECTED_RUNTIME_ENV.has(runtimeEnv) && (!configuredSecret || configuredSecret === DEFAULT_ADMIN_SECRET)) {
    throw new Error(
      `[security] ADMIN_RBAC_SECRET must be configured with a non-default value in ${runtimeEnv} environment`
    );
  }
}

export function ensureAdminPermission(input: {
  authorization: string | undefined;
  role: string | undefined;
  secret: string | undefined;
  permission: AdminPermission;
  requestId?: string;
}) {
  assertAdminRbacConfig();
  ensureAuthorization(input.authorization, input.requestId);

  if (!input.secret || input.secret !== resolveAdminSecret()) {
    forbidden(40301, "权限不足", input.requestId);
  }

  const role = normalizeRole(input.role);
  if (!role) {
    forbidden(40301, "权限不足", input.requestId);
  }

  if (!ROLE_PERMISSIONS[role].includes(input.permission)) {
    forbidden(40301, "权限不足", input.requestId);
  }

  return role;
}

function normalizeRole(raw: string | undefined): AdminRole | undefined {
  if (!raw) {
    return undefined;
  }

  if (raw === "admin" || raw === "operator" || raw === "auditor") {
    return raw;
  }

  return undefined;
}

function resolveRuntimeEnv() {
  const raw = process.env.APP_ENV || process.env.NODE_ENV || "dev";
  return raw.toLowerCase();
}

function resolveAdminSecret() {
  return process.env.ADMIN_RBAC_SECRET || DEFAULT_ADMIN_SECRET;
}
