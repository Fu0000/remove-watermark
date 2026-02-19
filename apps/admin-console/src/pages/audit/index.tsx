import { AppLayout } from "@/components/layout";
import { Card, Table } from "antd";

const rows = [
  { eventId: "evt_9001", actor: "operator", action: "task.replay", time: "2026-02-19T12:00:00Z" }
];

export default function AuditPage() {
  return (
    <AppLayout>
      <Card title="审计日志">
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
