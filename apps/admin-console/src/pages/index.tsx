import { Card, Space, Typography } from "antd";
import { AppLayout } from "@/components/layout";

export default function HomePage() {
  return (
    <AppLayout>
      <Card>
        <Space direction="vertical">
          <Typography.Title level={3}>运营后台</Typography.Title>
          <Typography.Text>最小可用集：任务检索、异常重放、套餐管理、风险台账、Webhook 运维。</Typography.Text>
        </Space>
      </Card>
    </AppLayout>
  );
}
