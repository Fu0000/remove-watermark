export type Role = "admin" | "operator" | "auditor";

export const permissions = {
  admin: ["task:read", "task:replay", "plan:write", "risk:write", "webhook:retry", "audit:read"],
  operator: ["task:read", "task:replay", "plan:read", "risk:read", "webhook:retry", "audit:read"],
  auditor: ["task:read", "plan:read", "risk:read", "webhook:read", "audit:read"]
} as const;

export function hasPermission(role: Role, permission: string) {
  return permissions[role].includes(permission as never);
}
