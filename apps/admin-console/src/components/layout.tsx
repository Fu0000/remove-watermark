import Link from "next/link";
import { Layout, Menu, Typography } from "antd";
import type { PropsWithChildren } from "react";

const items = [
  { key: "/tasks", label: <Link href="/tasks">任务管理</Link> },
  { key: "/plans", label: <Link href="/plans">套餐管理</Link> },
  { key: "/risks", label: <Link href="/risks">风险台账</Link> },
  { key: "/webhooks", label: <Link href="/webhooks">Webhook 运维</Link> },
  { key: "/audit", label: <Link href="/audit">审计日志</Link> }
];

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider width={220} theme="light">
        <Typography.Title level={4} style={{ margin: 16 }}>
          Admin Console
        </Typography.Title>
        <Menu mode="inline" items={items} />
      </Layout.Sider>
      <Layout.Content style={{ padding: 24 }}>{children}</Layout.Content>
    </Layout>
  );
}
