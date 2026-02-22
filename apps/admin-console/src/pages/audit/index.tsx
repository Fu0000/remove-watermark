import { AppLayout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, Table } from "antd";

const rows = [
  { eventId: "evt_9001", actor: "operator", action: "task.replay", time: "2026-02-19T12:00:00Z" }
];

export default function AuditPage() {
  return (
    <AppLayout>
      <PageHeader title="审计日志" description="查看关键操作事件，支撑追踪、复盘与合规审计。" />
      <Card className="admin-section-card" title="操作事件">
        <Table
          rowKey="eventId"
          dataSource={rows}
          columns={[
            { title: "eventId", dataIndex: "eventId" },
            { title: "actor", dataIndex: "actor" },
            { title: "action", dataIndex: "action" },
            { title: "time", dataIndex: "time" }
          ]}
        />
      </Card>
    </AppLayout>
  );
}
