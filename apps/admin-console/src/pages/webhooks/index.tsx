import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppLayout } from "@/components/layout";
import type { DeliveryItem } from "@/services/webhooks";
import { listDeliveries, retryDelivery } from "@/services/webhooks";
import { ApiError } from "@/services/http";

type DeliveryStatus = "SUCCESS" | "FAILED";
type ScopeType = "user" | "tenant";

export default function WebhooksPage() {
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [scopeType, setScopeType] = useState<ScopeType>("user");
  const [scopeId, setScopeId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [apiMessage, contextHolder] = message.useMessage();

  const loadData = useCallback(
    async (nextPage = page, nextPageSize = pageSize) => {
      const normalizedScopeId = scopeId.trim();
      if (!normalizedScopeId) {
        setItems([]);
        setTotal(0);
        setPage(nextPage);
        setPageSize(nextPageSize);
        setError("请先选择运营上下文（用户或租户）并填写上下文 ID。");
        return;
      }

      setLoading(true);
      setError(undefined);
      try {
        const data = await listDeliveries({
          scopeType,
          scopeId: normalizedScopeId,
          endpointId: endpointId.trim() || undefined,
          eventType: eventType.trim() || undefined,
          status,
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
    [endpointId, eventType, page, pageSize, scopeId, scopeType, status]
  );

  useEffect(() => {
    void loadData(1, pageSize);
  }, [loadData, pageSize]);

  const retryAction = useCallback(
    (delivery: DeliveryItem) => {
      Modal.confirm({
        title: "确认重试投递",
        content: "本操作会基于原始事件重新投递，请确认下游已完成幂等保护。",
        okText: "确认重试",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: async () => {
          const normalizedScopeId = scopeId.trim();
          if (!normalizedScopeId) {
            apiMessage.error("请先选择运营上下文并填写上下文 ID。");
            return;
          }
          try {
            const result = await retryDelivery(delivery.deliveryId, {
              scopeType,
              scopeId: normalizedScopeId
            });
            apiMessage.success(`已触发重试：${result.deliveryId}`);
            await loadData(page, pageSize);
          } catch (requestError) {
            apiMessage.error(readErrorMessage(requestError));
          }
        }
      });
    },
    [apiMessage, loadData, page, pageSize, scopeId, scopeType]
  );

  const columns: ColumnsType<DeliveryItem> = useMemo(
    () => [
      { title: "deliveryId", dataIndex: "deliveryId", key: "deliveryId", width: 210 },
      { title: "endpointId", dataIndex: "endpointId", key: "endpointId", width: 210 },
      { title: "eventType", dataIndex: "eventType", key: "eventType", width: 180 },
      {
        title: "status",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (value: DeliveryStatus) => <Tag color={value === "SUCCESS" ? "green" : "red"}>{value}</Tag>
      },
      { title: "attempt", dataIndex: "attempt", key: "attempt", width: 100 },
      {
        title: "signatureValidated",
        dataIndex: "signatureValidated",
        key: "signatureValidated",
        width: 160,
        render: (value: boolean) => (value ? <Tag color="green">true</Tag> : <Tag color="red">false</Tag>)
      },
      {
        title: "createdAt",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 180,
        render: (value: string) => formatDateTime(value)
      },
      {
        title: "failureCode",
        dataIndex: "failureCode",
        key: "failureCode",
        width: 220,
        render: (value?: string) => value || "-"
      },
      {
        title: "操作",
        key: "action",
        width: 130,
        fixed: "right",
        render: (_, record) => (
          <Button type="primary" disabled={record.status !== "FAILED"} onClick={() => retryAction(record)}>
            重试投递
          </Button>
        )
      }
    ],
    [retryAction]
  );

  return (
    <AppLayout>
      {contextHolder}
      <Card title="Webhook 运维（投递查询 + 重试）">
        <Space style={{ marginBottom: 16, width: "100%" }} wrap>
          <Select<ScopeType>
            style={{ width: 160 }}
            value={scopeType}
            onChange={(value) => setScopeType(value)}
            options={[
              { label: "用户上下文", value: "user" },
              { label: "租户上下文", value: "tenant" }
            ]}
          />
          <Input
            placeholder={scopeType === "tenant" ? "tenantId" : "userId"}
            style={{ width: 220 }}
            value={scopeId}
            onChange={(event) => setScopeId(event.target.value)}
          />
          <Input
            placeholder="endpointId"
            style={{ width: 220 }}
            value={endpointId}
            onChange={(event) => setEndpointId(event.target.value)}
          />
          <Input
            placeholder="eventType"
            style={{ width: 220 }}
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          />
          <Select<DeliveryStatus | undefined>
            allowClear
            style={{ width: 160 }}
            placeholder="状态筛选"
            value={status}
            onChange={(value) => setStatus(value)}
            options={[
              { label: "SUCCESS", value: "SUCCESS" },
              { label: "FAILED", value: "FAILED" }
            ]}
          />
          <Button type="primary" onClick={() => void loadData(1, pageSize)} loading={loading}>
            查询
          </Button>
          <Button onClick={() => void loadData(page, pageSize)} loading={loading}>
            刷新
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          已切换为显式上下文驱动：查询和重试都依赖“用户/租户上下文 + ID”，不再使用默认用户。
        </Typography.Paragraph>
        {error ? (
          <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Webhook 数据加载失败" description={error} />
        ) : null}
        <Table
          rowKey="deliveryId"
          loading={loading}
          dataSource={items}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              void handlePagination(nextPage, nextPageSize, setPage, setPageSize, loadData);
            }
          }}
          scroll={{ x: 1600 }}
        />
      </Card>
    </AppLayout>
  );
}

async function handlePagination(
  nextPage: number,
  nextPageSize: number,
  setPage: (page: number) => void,
  setPageSize: (pageSize: number) => void,
  loadData: (nextPage: number, nextPageSize: number) => Promise<void>
) {
  setPage(nextPage);
  setPageSize(nextPageSize);
  await loadData(nextPage, nextPageSize);
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

function formatDateTime(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return value;
  }
  return new Date(time).toLocaleString();
}
