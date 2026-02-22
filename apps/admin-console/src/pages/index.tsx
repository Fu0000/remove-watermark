import Link from "next/link";
import { Button, Card, Space, Typography } from "antd";
import { AppLayout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";

const overviewItems = [
  { label: "核心模块", value: "5", note: "任务 / 套餐 / 风险 / Webhook / 审计" },
  { label: "主链路状态", value: "稳定", note: "上传 -> 任务 -> 下载已贯通" },
  { label: "运行模式", value: "MVP", note: "图片 + 视频" }
];

const shortcutItems = [
  { href: "/tasks", title: "进入任务管理", description: "快速检索任务，处理失败重放。" },
  { href: "/plans", title: "进入套餐管理", description: "维护套餐价格、配额和生效状态。" },
  { href: "/webhooks", title: "进入 Webhook 运维", description: "按上下文筛选投递并执行重试。" },
  { href: "/risks", title: "进入风险台账", description: "查看高风险项与责任人进展。" }
];

export default function HomePage() {
  return (
    <AppLayout>
      <PageHeader
        title="控制台总览"
        description="保持业务逻辑不变，聚焦更清晰的信息结构和更简约的视觉层级。"
      />
      <Card className="admin-section-card fade-in-up" style={{ marginBottom: 14 }}>
        <Typography.Title level={4} style={{ marginBottom: 6 }}>
          最小可用集
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          任务检索、异常重放、套餐管理、风险台账、Webhook 运维与审计日志均可在侧栏直达。
        </Typography.Paragraph>
      </Card>

      <div className="admin-home-grid fade-in-up">
        {overviewItems.map((item) => (
          <Card className="admin-home-kpi" key={item.label}>
            <Typography.Text className="admin-home-kpi__label">{item.label}</Typography.Text>
            <Typography.Title level={3} className="admin-home-kpi__value">
              {item.value}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {item.note}
            </Typography.Paragraph>
          </Card>
        ))}
      </div>

      <div className="admin-home-shortcuts fade-in-up">
        {shortcutItems.map((item) => (
          <Card className="admin-home-shortcut" key={item.href}>
            <Space direction="vertical" size={6}>
              <Typography.Title level={5} style={{ marginBottom: 0 }}>
                {item.title}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {item.description}
              </Typography.Paragraph>
              <Link href={item.href}>
                <Button type="link">打开页面</Button>
              </Link>
            </Space>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
