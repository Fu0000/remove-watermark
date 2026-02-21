import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppLayout } from "@/components/layout";
import { Guard } from "@/components/guard";
import type { TaskItem } from "@/services/tasks";
import { listTasks, replayTask } from "@/services/tasks";
import { ApiError } from "@/services/http";

type TaskStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PREPROCESSING"
  | "DETECTING"
  | "INPAINTING"
  | "PACKAGING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

const STATUS_OPTIONS: TaskStatus[] = [
  "UPLOADED",
  "QUEUED",
  "PREPROCESSING",
  "DETECTING",
  "INPAINTING",
  "PACKAGING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED"
];

export default function TasksPage() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [taskIdFilter, setTaskIdFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedTask, setSelectedTask] = useState<TaskItem | undefined>();
  const [replayReason, setReplayReason] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [apiMessage, contextHolder] = message.useMessage();

  const reload = useCallback(
    async (nextPage = page, nextPageSize = pageSize) => {
      setLoading(true);
      setError(undefined);
      try {
        const data = await listTasks({
          taskId: taskIdFilter.trim() || undefined,
          userId: userIdFilter.trim() || undefined,
          status: statusFilter,
          from: dateRange?.[0],
          to: dateRange?.[1],
          page: nextPage,
          pageSize: nextPageSize
        });
        setItems(data.items);
        setPage(data.page);
        setPageSize(data.pageSize);
        setTotal(data.total);
      } catch (requestError) {
        setError(readErrorMessage(requestError));
      } finally {
        setLoading(false);
      }
    },
    [dateRange, page, pageSize, statusFilter, taskIdFilter, userIdFilter]
  );

  useEffect(() => {
    void reload(1, pageSize);
  }, [reload, pageSize]);

  const columns: ColumnsType<TaskItem> = useMemo(
    () => [
      { title: "taskId", dataIndex: "taskId", key: "taskId", width: 220 },
      { title: "userId", dataIndex: "userId", key: "userId", width: 160 },
      {
        title: "status",
        dataIndex: "status",
        key: "status",
        width: 150,
        render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
      },
      { title: "mediaType", dataIndex: "mediaType", key: "mediaType", width: 120 },
      { title: "progress", dataIndex: "progress", key: "progress", width: 100, render: (value: number) => `${value}%` },
      {
        title: "updatedAt",
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: 180,
        render: (value: string) => formatDateTime(value)
      },
      {
        title: "操作",
        key: "action",
        width: 140,
        fixed: "right",
        render: (_, record) => (
          <Button danger disabled={record.status !== "FAILED"} onClick={() => setSelectedTask(record)}>
            异常重放
          </Button>
        )
      }
    ],
    []
  );

  const closeModal = () => {
    setSelectedTask(undefined);
    setReplayReason("");
  };

  const handleReplay = async () => {
    if (!selectedTask) {
      return;
    }

    setReplaying(true);
    try {
      const result = await replayTask(selectedTask.taskId, replayReason.trim());
      apiMessage.success(`任务已重放：${result.taskId} -> ${result.status}`);
      closeModal();
      await reload(page, pageSize);
    } catch (requestError) {
      apiMessage.error(readErrorMessage(requestError));
    } finally {
      setReplaying(false);
    }
  };

  return (
    <AppLayout>
      {contextHolder}
      <Guard role="operator" permission="task:read">
        <Card title="任务管理（检索 + 异常重放）">
          <Space style={{ marginBottom: 16, width: "100%" }} wrap>
            <Input
              placeholder="taskId"
              style={{ width: 220 }}
              value={taskIdFilter}
              onChange={(event) => setTaskIdFilter(event.target.value)}
            />
            <Input
              placeholder="userId"
              style={{ width: 220 }}
              value={userIdFilter}
              onChange={(event) => setUserIdFilter(event.target.value)}
            />
            <Select<TaskStatus | undefined>
              allowClear
              placeholder="状态筛选"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={STATUS_OPTIONS.map((status) => ({ label: status, value: status }))}
            />
            <DatePicker.RangePicker
              onChange={(_, dateStrings) =>
                dateStrings[0] && dateStrings[1] ? setDateRange([dateStrings[0], dateStrings[1]]) : setDateRange(undefined)
              }
            />
            <Button type="primary" onClick={() => void reload(1, pageSize)} loading={loading}>
              查询
            </Button>
            <Button onClick={() => void reload(page, pageSize)} loading={loading}>
              刷新
            </Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            重放任务为高危操作，需二次确认并填写原因，后台将写入审计日志。
          </Typography.Paragraph>
          {error ? (
            <Alert type="error" showIcon style={{ marginBottom: 16 }} message="任务数据加载失败" description={error} />
          ) : null}
          <Table
            rowKey="taskId"
            loading={loading}
            dataSource={items}
            columns={columns}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              onChange: (nextPage, nextPageSize) => {
                void handlePagination(nextPage, nextPageSize, setPage, setPageSize, reload);
              }
            }}
            scroll={{ x: 1300 }}
          />
        </Card>
      </Guard>

      <Modal
        title="确认重放任务"
        open={Boolean(selectedTask)}
        onCancel={closeModal}
        onOk={() => void handleReplay()}
        confirmLoading={replaying}
        okButtonProps={{ danger: true, disabled: replayReason.trim().length === 0 }}
      >
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          本操作将重新入队任务并产生新的处理成本，请确认已核对失败原因。
        </Typography.Paragraph>
        <Typography.Paragraph style={{ marginBottom: 12 }}>
          目标任务：<Typography.Text code>{selectedTask?.taskId || "-"}</Typography.Text>
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={200}
          showCount
          placeholder="必填：操作原因"
          value={replayReason}
          onChange={(event) => setReplayReason(event.target.value)}
        />
      </Modal>
    </AppLayout>
  );
}

async function handlePagination(
  nextPage: number,
  nextPageSize: number,
  setPage: (page: number) => void,
  setPageSize: (pageSize: number) => void,
  reload: (nextPage: number, nextPageSize: number) => Promise<void>
) {
  setPage(nextPage);
  setPageSize(nextPageSize);
  await reload(nextPage, nextPageSize);
}

function readErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}（code=${error.code}）`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
}

function statusColor(status: string) {
  if (status === "FAILED") {
    return "red";
  }
  if (status === "SUCCEEDED") {
    return "green";
  }
  if (status === "CANCELED") {
    return "default";
  }
  return "blue";
}

function formatDateTime(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return value;
  }
  return new Date(time).toLocaleString();
}
