import { Alert } from "antd";
import type { PropsWithChildren } from "react";
import { hasPermission, type Role } from "@/auth/rbac";

interface GuardProps {
  role: Role;
  permission: string;
}

export function Guard({ role, permission, children }: PropsWithChildren<GuardProps>) {
  if (!hasPermission(role, permission)) {
    return <Alert type="error" message="权限不足" description="当前角色无权访问该页面。" showIcon />;
  }

  return children;
}
