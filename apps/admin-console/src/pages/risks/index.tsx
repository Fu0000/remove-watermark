import { AppLayout } from "@/components/layout";
import { Card, Table } from "antd";

const rows = [
  { riskId: "R-LIC-001", severity: "HIGH", status: "OPEN", owner: "算法A" },
  { riskId: "R-TECH-001", severity: "MEDIUM", status: "TRACKING", owner: "后端A" }
];

export default function RisksPage() {
  return (
    <AppLayout>
      <Card title="风险台账">
        <Table
          rowKey="riskId"
          dataSource={rows}
          columns={[
            { title: "riskId", dataIndex: "riskId" },
            { title: "severity", dataIndex: "severity" },
            { title: "status", dataIndex: "status" },
            { title: "owner", dataIndex: "owner" }
          ]}
        />
      </Card>
    </AppLayout>
  );
}
