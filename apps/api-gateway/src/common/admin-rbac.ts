import { ensureAuthorization } from "./auth";
import { forbidden } from "./http-errors";

export type AdminRole = "admin" | "operator" | "auditor";
export type AdminPermission = "admin:task:read" | "admin:task:replay" | "admin:plan:read" | "admin:plan:write";

const ADMIN_SECRET = process.env.ADMIN_RBAC_SECRET || "admin123";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  admin: ["admin:task:read", "admin:task:replay", "admin:plan:read", "admin:plan:write"],
  operator: ["admin:task:read", "admin:task:replay", "admin:plan:read"],
  auditor: ["admin:task:read", "admin:plan:read"]
};

export function ensureAdminPermission(input: {
  authorization: string | undefined;
  role: string | undefined;
  secret: string | undefined;
  permission: AdminPermission;
  requestId?: string;
}) {
  ensureAuthorization(input.authorization, input.requestId);

  if (!input.secret || input.secret !== ADMIN_SECRET) {
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
