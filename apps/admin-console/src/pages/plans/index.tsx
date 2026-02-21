import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppLayout } from "@/components/layout";
import { Guard } from "@/components/guard";
import type { PlanItem } from "@/services/plans";
import { createPlan, listPlans, updatePlan } from "@/services/plans";
import { ApiError } from "@/services/http";

interface PlanFormValues {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  sortOrder: number;
  isActive: boolean;
  featuresText: string;
}

export default function PlansPage() {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [editingPlan, setEditingPlan] = useState<PlanItem | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PlanFormValues>();
  const [apiMessage, contextHolder] = message.useMessage();

  const reload = useCallback(
    async (nextPage = page, nextPageSize = pageSize) => {
      setLoading(true);
      setError(undefined);
      try {
        const result = await listPlans({
          keyword: keyword.trim() || undefined,
          isActive: statusFilter === "all" ? undefined : statusFilter === "active",
          page: nextPage,
          pageSize: nextPageSize
        });
        setItems(result.items);
        setPage(result.page);
        setPageSize(result.pageSize);
        setTotal(result.total);
      } catch (requestError) {
        setError(readErrorMessage(requestError));
      } finally {
        setLoading(false);
      }
    },
    [keyword, page, pageSize, statusFilter]
  );

  useEffect(() => {
    void reload(1, pageSize);
  }, [reload, pageSize]);

  const columns: ColumnsType<PlanItem> = useMemo(
    () => [
      { title: "planId", dataIndex: "planId", key: "planId", width: 160 },
      { title: "name", dataIndex: "name", key: "name", width: 160 },
      {
        title: "price",
        dataIndex: "price",
        key: "price",
        width: 120,
        render: (value: number) => `¥${value}`
      },
      { title: "monthlyQuota", dataIndex: "monthlyQuota", key: "monthlyQuota", width: 140 },
      { title: "sortOrder", dataIndex: "sortOrder", key: "sortOrder", width: 120 },
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
        dataIndex: "isActive",
        key: "status",
        width: 110,
        render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "ACTIVE" : "INACTIVE"}</Tag>
      },
      {
        title: "操作",
        key: "action",
        width: 120,
        fixed: "right",
        render: (_, record) => (
          <Button onClick={() => openEditModal(record)} type="primary">
            编辑
          </Button>
        )
      }
    ],
    []
  );

  const openCreateModal = () => {
    setEditingPlan(undefined);
    form.setFieldsValue({
      planId: "",
      name: "",
      price: 0,
      monthlyQuota: 0,
      sortOrder: 10,
      isActive: true,
      featuresText: ""
    });
    setModalOpen(true);
  };

  const openEditModal = (plan: PlanItem) => {
    setEditingPlan(plan);
    form.setFieldsValue({
      planId: plan.planId,
      name: plan.name,
      price: plan.price,
      monthlyQuota: plan.monthlyQuota,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      featuresText: plan.features.join(",")
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlan(undefined);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const features = parseFeatures(values.featuresText);
    setSaving(true);
    try {
      if (editingPlan) {
        await updatePlan(editingPlan.planId, {
          name: values.name.trim(),
          price: values.price,
          monthlyQuota: values.monthlyQuota,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
          features
        });
        apiMessage.success(`套餐已更新：${editingPlan.planId}`);
      } else {
        await createPlan({
          planId: values.planId.trim(),
          name: values.name.trim(),
          price: values.price,
          monthlyQuota: values.monthlyQuota,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
          features
        });
        apiMessage.success(`套餐已创建：${values.planId}`);
      }
      closeModal();
      await reload(page, pageSize);
    } catch (requestError) {
      apiMessage.error(readErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      {contextHolder}
      <Guard role="admin" permission="plan:write">
        <Card title="套餐管理（查询 + 写入）">
          <Space style={{ marginBottom: 16, width: "100%" }} wrap>
            <Input
              placeholder="planId / name"
              value={keyword}
              style={{ width: 240 }}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { label: "全部状态", value: "all" },
                { label: "ACTIVE", value: "active" },
                { label: "INACTIVE", value: "inactive" }
              ]}
            />
            <Button type="primary" onClick={() => void reload(1, pageSize)} loading={loading}>
              查询
            </Button>
            <Button onClick={() => void reload(page, pageSize)} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={openCreateModal}>
              新增套餐
            </Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            管理端写接口已切换到 `/admin/plans`，支持新增与编辑并记录审计。
          </Typography.Paragraph>
          {error ? (
            <Alert type="error" showIcon style={{ marginBottom: 16 }} message="套餐数据加载失败" description={error} />
          ) : null}
          <Table
            rowKey="planId"
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
            scroll={{ x: 1500 }}
          />
        </Card>
      </Guard>

      <Modal
        title={editingPlan ? `编辑套餐 ${editingPlan.planId}` : "新增套餐"}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            label="planId"
            name="planId"
            rules={[{ required: true, message: "请输入 planId" }]}
            extra="创建后不可修改"
          >
            <Input disabled={Boolean(editingPlan)} />
          </Form.Item>
          <Form.Item label="name" name="name" rules={[{ required: true, message: "请输入 name" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="price" name="price" rules={[{ required: true, message: "请输入 price" }]}>
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="monthlyQuota" name="monthlyQuota" rules={[{ required: true, message: "请输入 monthlyQuota" }]}>
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="sortOrder" name="sortOrder" rules={[{ required: true, message: "请输入 sortOrder" }]}>
            <InputNumber precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="features（逗号分隔）"
            name="featuresText"
            rules={[{ required: true, message: "请输入 features" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="isActive" name="isActive" rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              options={[
                { label: "ACTIVE", value: true },
                { label: "INACTIVE", value: false }
              ]}
            />
          </Form.Item>
        </Form>
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

function parseFeatures(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
