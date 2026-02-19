import { AppLayout } from "@/components/layout";
import { Button, Card, Space, Table } from "antd";

const rows = [{ endpointId: "ep_1001", deliveryId: "dlv_2001", retryCount: 2, status: "RETRYING" }];

export default function WebhooksPage() {
  return (
    <AppLayout>
      <Card title="Webhook 运维">
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary">重试投递</Button>
        </Space>
        <Table
          rowKey="deliveryId"
          dataSource={rows}
          columns={[
            { title: "endpointId", dataIndex: "endpointId" },
            { title: "deliveryId", dataIndex: "deliveryId" },
            { title: "retryCount", dataIndex: "retryCount" },
            { title: "status", dataIndex: "status" }
          ]}
        />
      </Card>
    </AppLayout>
  );
}
