import Link from "next/link";
import { Menu, Typography } from "antd";
import type { PropsWithChildren } from "react";
import { useRouter } from "next/router";

const pages = [
  { key: "/", label: "总览", description: "运营后台总览与快捷入口" },
  { key: "/tasks", label: "任务管理", description: "任务检索、状态筛选、失败重放" },
  { key: "/plans", label: "套餐管理", description: "套餐价格、配额与上下线管理" },
  { key: "/risks", label: "风险台账", description: "风险清单与责任跟踪" },
  { key: "/webhooks", label: "Webhook 运维", description: "投递查询与失败重试" },
  { key: "/audit", label: "审计日志", description: "关键操作审计留痕" }
];

export function AppLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const selectedMenuKey = pages.some((item) => item.key === router.pathname) ? router.pathname : "/";
  const currentPage = pages.find((item) => item.key === selectedMenuKey) ?? pages[0];
  const menuItems = pages.map((item) => ({
    key: item.key,
    label: (
      <Link href={item.key} className="admin-shell__menu-link">
        {item.label}
      </Link>
    )
  }));

  return (
    <div className="admin-shell">
      <aside className="admin-shell__sider fade-in-up">
        <div className="admin-shell__brand">
          <Typography.Text className="admin-shell__brand-caption">Remove Watermark</Typography.Text>
          <Typography.Title level={4} className="admin-shell__brand-title">
            运营控制台
          </Typography.Title>
          <Typography.Paragraph className="admin-shell__brand-desc">
            MVP v1.0 仅覆盖图片与视频链路
          </Typography.Paragraph>
        </div>
        <Menu className="admin-shell__menu" mode="inline" items={menuItems} selectedKeys={[selectedMenuKey]} />
        <div className="admin-shell__meta">
          <p className="admin-shell__meta-pill">shared 环境</p>
          <p className="admin-shell__meta-row">架构基线：Node 控制面 + Triton 推理面</p>
          <p className="admin-shell__meta-row">状态机：UPLOADED -&gt; ... -&gt; SUCCEEDED | FAILED | CANCELED</p>
        </div>
      </aside>
      <main className="admin-shell__main">
        <header className="admin-shell__header fade-in-up">
          <div>
            <Typography.Title level={4} className="admin-shell__header-title">
              {currentPage.label}
            </Typography.Title>
            <Typography.Paragraph className="admin-shell__header-subtitle">
              {currentPage.description}
            </Typography.Paragraph>
          </div>
          <p className="admin-shell__header-tag">Trunk-Based + Feature Flag</p>
        </header>
        <section className="admin-shell__content">{children}</section>
      </main>
    </div>
  );
}
