import { AppLayout } from "@/components/layout";
import { Guard } from "@/components/guard";
import { Button, Card, Space, Table } from "antd";

const rows = [
  { planId: "free", quota: 20, price: 0, status: "ACTIVE" },
  { planId: "pro_month", quota: 300, price: 39, status: "ACTIVE" }
];

export default function PlansPage() {
  return (
    <AppLayout>
      <Guard role="admin" permission="plan:write">
        <Card title="套餐管理">
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary">新增套餐</Button>
          </Space>
          <Table
            rowKey="planId"
            dataSource={rows}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: "planId", dataIndex: "planId" },
              { title: "quota", dataIndex: "quota" },
              { title: "price", dataIndex: "price" },
              { title: "status", dataIndex: "status" }
            ]}
          />
        </Card>
      </Guard>
    </AppLayout>
  );
}
