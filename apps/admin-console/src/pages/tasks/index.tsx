import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Guard } from "@/components/guard";
import { Button, Card, DatePicker, Input, Modal, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

interface TaskItem {
  taskId: string;
  userId: string;
  status: string;
  traceId: string;
}

const rows: TaskItem[] = [
  { taskId: "tsk_1001", userId: "u_1001", status: "FAILED", traceId: "req_a1" },
  { taskId: "tsk_1002", userId: "u_1002", status: "SUCCEEDED", traceId: "req_a2" }
];

export default function TasksPage() {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const columns: ColumnsType<TaskItem> = useMemo(
    () => [
      { title: "taskId", dataIndex: "taskId", key: "taskId" },
      { title: "userId", dataIndex: "userId", key: "userId" },
      {
        title: "status",
        dataIndex: "status",
        key: "status",
        render: (value) => <Tag color={value === "FAILED" ? "red" : "green"}>{value}</Tag>
      },
      { title: "traceId", dataIndex: "traceId", key: "traceId" }
    ],
    []
  );

  return (
    <AppLayout>
      <Guard role="operator" permission="task:read">
        <Card title="任务管理">
          <Space style={{ marginBottom: 16 }} wrap>
            <Input placeholder="taskId / userId" style={{ width: 240 }} />
            <DatePicker.RangePicker />
            <Button type="primary">筛选</Button>
            <Button danger onClick={() => setOpen(true)}>
              重放任务
            </Button>
          </Space>
          <Table rowKey="taskId" dataSource={rows} columns={columns} pagination={{ pageSize: 20 }} />
        </Card>
      </Guard>
      <Modal
        title="确认重放任务"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => setOpen(false)}
        okButtonProps={{ disabled: reason.trim().length === 0 }}
      >
        <p>本操作将重新入队任务并产生新的处理成本，请确认已核对失败原因。</p>
        <Input
          placeholder="必填：操作原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Modal>
    </AppLayout>
  );
}
