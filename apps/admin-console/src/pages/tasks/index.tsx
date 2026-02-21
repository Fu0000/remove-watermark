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

export default function TasksPage() {
  const [allTasks, setAllTasks] = useState<TaskItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedTask, setSelectedTask] = useState<TaskItem | undefined>();
  const [replayReason, setReplayReason] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [apiMessage, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await listTasks();
      setAllTasks(data.items);
    } catch (requestError) {
      setError(readErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((item) => {
      if (keyword.trim()) {
        const normalizedKeyword = keyword.trim().toLowerCase();
        const matched =
          item.taskId.toLowerCase().includes(normalizedKeyword) ||
          item.userId.toLowerCase().includes(normalizedKeyword) ||
          item.assetId.toLowerCase().includes(normalizedKeyword);
        if (!matched) {
          return false;
        }
      }

      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      if (dateRange) {
        const createdAt = Date.parse(item.createdAt);
        const from = Date.parse(`${dateRange[0]}T00:00:00.000Z`);
        const to = Date.parse(`${dateRange[1]}T23:59:59.999Z`);
        if (Number.isNaN(createdAt) || Number.isNaN(from) || Number.isNaN(to)) {
          return false;
        }
        if (createdAt < from || createdAt > to) {
          return false;
        }
      }

      return true;
    });
  }, [allTasks, dateRange, keyword, statusFilter]);

  const columns: ColumnsType<TaskItem> = useMemo(
    () => [
      { title: "taskId", dataIndex: "taskId", key: "taskId", width: 220 },
      { title: "userId", dataIndex: "userId", key: "userId", width: 140 },
      {
        title: "status",
        dataIndex: "status",
        key: "status",
        width: 140,
        render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
      },
      { title: "mediaType", dataIndex: "mediaType", key: "mediaType", width: 100 },
      { title: "progress", dataIndex: "progress", key: "progress", width: 100, render: (value: number) => `${value}%` },
      { title: "assetId", dataIndex: "assetId", key: "assetId", width: 220 },
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
      const result = await replayTask(selectedTask.taskId);
      apiMessage.success(`任务已重放：${result.taskId} -> ${result.status}`);
      closeModal();
      await reload();
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
              placeholder="taskId / userId / assetId"
              style={{ width: 260 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select<TaskStatus | undefined>
              allowClear
              placeholder="状态筛选"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                "UPLOADED",
                "QUEUED",
                "PREPROCESSING",
                "DETECTING",
                "INPAINTING",
                "PACKAGING",
                "SUCCEEDED",
                "FAILED",
                "CANCELED"
              ].map((status) => ({ label: status, value: status as TaskStatus }))}
            />
            <DatePicker.RangePicker
              onChange={(_, dateStrings) =>
                dateStrings[0] && dateStrings[1] ? setDateRange([dateStrings[0], dateStrings[1]]) : setDateRange(undefined)
              }
            />
            <Button onClick={() => void reload()} loading={loading}>
              刷新
            </Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            重放任务为高危操作，需二次确认并填写原因；当前原因用于确认留痕，后续会随 `/admin` 专用接口入库审计。
          </Typography.Paragraph>
          {error ? (
            <Alert type="error" showIcon style={{ marginBottom: 16 }} message="任务数据加载失败" description={error} />
          ) : null}
          <Table
            rowKey="taskId"
            loading={loading}
            dataSource={filteredTasks}
            columns={columns}
            pagination={{ pageSize: 20 }}
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
