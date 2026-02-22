import { AppLayout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, Table } from "antd";

const rows = [
  { riskId: "R-LIC-001", severity: "HIGH", status: "OPEN", owner: "算法A" },
  { riskId: "R-TECH-001", severity: "MEDIUM", status: "TRACKING", owner: "后端A" }
];

export default function RisksPage() {
  return (
    <AppLayout>
      <PageHeader title="风险台账" description="持续跟踪高风险事项，明确优先级、状态和负责人。" />
      <Card className="admin-section-card" title="风险清单">
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
