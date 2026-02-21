import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppLayout } from "@/components/layout";
import { Guard } from "@/components/guard";
import type { PlanItem } from "@/services/plans";
import { listPlans } from "@/services/plans";
import { ApiError } from "@/services/http";

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await listPlans();
      setPlans(data);
    } catch (requestError) {
      setError(readErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredPlans = useMemo(() => {
    if (!keyword.trim()) {
      return plans;
    }
    const normalizedKeyword = keyword.trim().toLowerCase();
    return plans.filter((item) => {
      return item.planId.toLowerCase().includes(normalizedKeyword) || item.name.toLowerCase().includes(normalizedKeyword);
    });
  }, [keyword, plans]);

  const columns: ColumnsType<PlanItem> = [
    { title: "planId", dataIndex: "planId", key: "planId", width: 180 },
    { title: "name", dataIndex: "name", key: "name", width: 180 },
    { title: "monthlyQuota", dataIndex: "monthlyQuota", key: "monthlyQuota", width: 140 },
    {
      title: "price",
      dataIndex: "price",
      key: "price",
      width: 120,
      render: (value: number) => `¥${value}`
    },
    {
      title: "features",
      dataIndex: "features",
      key: "features",
      width: 360,
      render: (features: string[]) => (
        <Space wrap>
          {features.map((feature) => (
            <Tag key={feature}>{feature}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: "status",
      key: "status",
      width: 100,
      render: () => <Tag color="green">ACTIVE</Tag>
    }
  ];

  return (
    <AppLayout>
      <Guard role="admin" permission="plan:write">
        <Card title="套餐管理（最小集）">
          <Space style={{ marginBottom: 16, width: "100%" }} wrap>
            <Input
              placeholder="planId / name"
              value={keyword}
              style={{ width: 260 }}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Button onClick={() => void reload()} loading={loading}>
              刷新
            </Button>
            <Tooltip title="待 `/admin/plans` 写接口开放后启用">
              <Button type="primary" disabled>
                新增套餐（待开放）
              </Button>
            </Tooltip>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            当前阶段已接入套餐查询，写操作在后端 `/admin/*` 契约开放后补齐。
          </Typography.Paragraph>
          {error ? (
            <Alert type="error" showIcon style={{ marginBottom: 16 }} message="套餐数据加载失败" description={error} />
          ) : null}
          <Table
            rowKey="planId"
            loading={loading}
            dataSource={filteredPlans}
            columns={columns}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 1100 }}
          />
        </Card>
      </Guard>
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
