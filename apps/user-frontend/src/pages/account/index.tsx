import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Picker, ScrollView, Switch, Text, Textarea, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { ApiError } from "@/services/http";
import {
  createAccountDeleteRequest,
  getAccountDeleteRequest,
  listAccountDeleteRequests,
  listAuditLogs,
  type DeleteRequestStatus
} from "@/services/compliance";
import { useAuthStore } from "@/stores/auth.store";
import { buildIdempotencyKey } from "@/utils/idempotency";
import "./index.scss";

const STATUS_OPTIONS: Array<{ label: string; value?: DeleteRequestStatus }> = [
  { label: "全部状态" },
  { label: "PENDING", value: "PENDING" },
  { label: "PROCESSING", value: "PROCESSING" },
  { label: "DONE", value: "DONE" },
  { label: "FAILED", value: "FAILED" }
];

const AUDIT_RESOURCE_OPTIONS = [
  { label: "全部资源", value: "" },
  { label: "账户 account", value: "account" },
  { label: "任务 task", value: "task" },
  { label: "素材 asset", value: "asset" }
];

function resolveErrorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return `${error.code} ${error.message}`;
  }
  return fallback;
}

function colorByStatus(status: DeleteRequestStatus) {
  if (status === "DONE") {
    return "#13a05f";
  }
  if (status === "FAILED") {
    return "#d93025";
  }
  if (status === "PROCESSING") {
    return "#fa8c16";
  }
  return "#1a73e8";
}

function stringifyMeta(meta: Record<string, unknown>) {
  try {
    return JSON.stringify(meta || {}, null, 0);
  } catch {
    return "{}";
  }
}

export default function AccountPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [statusPickerIndex, setStatusPickerIndex] = useState(0);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditResourceIndex, setAuditResourceIndex] = useState(0);
  const [submitMessage, setSubmitMessage] = useState("");

  const selectedStatus = STATUS_OPTIONS[statusPickerIndex]?.value;
  const selectedAuditResource = AUDIT_RESOURCE_OPTIONS[auditResourceIndex]?.value || "";

  const deleteRequestsQuery = useQuery({
    queryKey: ["account-delete-requests", selectedStatus],
    queryFn: () =>
      listAccountDeleteRequests({
        status: selectedStatus,
        page: 1,
        pageSize: 20
      })
  });

  useEffect(() => {
    if (!selectedRequestId) {
      const first = deleteRequestsQuery.data?.data.items[0];
      if (first) {
        setSelectedRequestId(first.requestId);
      }
    }
  }, [deleteRequestsQuery.data, selectedRequestId]);

  const detailQuery = useQuery({
    queryKey: ["account-delete-request-detail", selectedRequestId],
    queryFn: () => getAccountDeleteRequest(selectedRequestId),
    enabled: Boolean(selectedRequestId)
  });

  const auditLogsQuery = useQuery({
    queryKey: ["account-audit-logs", auditAction, selectedAuditResource],
    queryFn: () =>
      listAuditLogs({
        action: auditAction || undefined,
        resourceType: selectedAuditResource || undefined,
        page: 1,
        pageSize: 20
      })
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      createAccountDeleteRequest(
        {
          reason: reason.trim(),
          confirm: true
        },
        buildIdempotencyKey()
      ),
    onSuccess: (response) => {
      setSubmitMessage(`删除申请已提交：${response.data.requestId}`);
      setReason("");
      setConfirmed(false);
      setSelectedRequestId(response.data.requestId);
      void queryClient.invalidateQueries({ queryKey: ["account-delete-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["account-audit-logs"] });
    },
    onError: (error) => {
      setSubmitMessage(resolveErrorText(error, "提交删除申请失败"));
    }
  });

  const handleSubmit = () => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setSubmitMessage("请先填写删除原因");
      return;
    }
    if (!confirmed) {
      setSubmitMessage("请先确认已阅读不可恢复提示");
      return;
    }

    setSubmitMessage("");
    createMutation.mutate();
  };

  const listErrorText = useMemo(
    () => (deleteRequestsQuery.error ? resolveErrorText(deleteRequestsQuery.error, "删除申请查询失败") : ""),
    [deleteRequestsQuery.error]
  );

  const detailErrorText = useMemo(
    () => (detailQuery.error ? resolveErrorText(detailQuery.error, "删除申请详情查询失败") : ""),
    [detailQuery.error]
  );

  const auditErrorText = useMemo(
    () => (auditLogsQuery.error ? resolveErrorText(auditLogsQuery.error, "审计日志查询失败") : ""),
    [auditLogsQuery.error]
  );

  return (
    <PageShell title="账户与隐私" subtitle="删除申请执行态、审计日志查询（FE-007）">
      <View className="account-section">
        <Text className="account-kv">用户：{user?.userId || "u_1001"}</Text>
        <Text className="account-kv">状态：{user ? "已登录" : "联调占位会话"}</Text>
      </View>

      <View className="account-section">
        <Text className="account-title">提交账户删除申请</Text>
        <Textarea
          className="account-reason-input"
          value={reason}
          maxlength={120}
          autoHeight
          placeholder="请填写删除原因（必填）"
          onInput={(event) => setReason(event.detail.value)}
        />
        <View className="account-switch-row">
          <Text>我确认该操作不可恢复</Text>
          <Switch checked={confirmed} onChange={(event) => setConfirmed(Boolean(event.detail.value))} />
        </View>
        <Button loading={createMutation.isPending} onClick={handleSubmit}>
          提交删除申请
        </Button>
        {submitMessage ? <Text className="account-hint">{submitMessage}</Text> : null}
      </View>

      <View className="account-section">
        <View className="account-section-head">
          <Text className="account-title">删除申请列表</Text>
          <Button size="mini" loading={deleteRequestsQuery.isFetching} onClick={() => deleteRequestsQuery.refetch()}>
            刷新
          </Button>
        </View>
        <Picker
          mode="selector"
          range={STATUS_OPTIONS.map((item) => item.label)}
          value={statusPickerIndex}
          onChange={(event) => setStatusPickerIndex(Number(event.detail.value))}
        >
          <View className="account-picker-value">筛选状态：{STATUS_OPTIONS[statusPickerIndex]?.label}</View>
        </Picker>
        <ScrollView scrollY className="account-list-scroll">
          {deleteRequestsQuery.data?.data.items.map((item) => (
            <View
              key={item.requestId}
              className={`account-item ${selectedRequestId === item.requestId ? "account-item-active" : ""}`}
              onClick={() => setSelectedRequestId(item.requestId)}
            >
              <View className="account-item-head">
                <Text className="account-item-id">{item.requestId}</Text>
                <Text style={{ color: colorByStatus(item.status), fontWeight: 600 }}>{item.status}</Text>
              </View>
              <Text className="account-item-line">原因：{item.reason}</Text>
              <Text className="account-item-line">ETA：{item.eta}</Text>
            </View>
          ))}
          {!deleteRequestsQuery.data?.data.items.length ? (
            <Text className="account-empty">暂无删除申请记录</Text>
          ) : null}
        </ScrollView>
        {listErrorText ? <Text className="account-error">{listErrorText}</Text> : null}
      </View>

      <View className="account-section">
        <Text className="account-title">删除申请详情</Text>
        {detailQuery.data?.data ? (
          <View className="account-detail">
            <Text>requestId: {detailQuery.data.data.requestId}</Text>
            <Text>status: {detailQuery.data.data.status}</Text>
            <Text>reason: {detailQuery.data.data.reason}</Text>
            <Text>eta: {detailQuery.data.data.eta}</Text>
            <Text>startedAt: {detailQuery.data.data.startedAt || "-"}</Text>
            <Text>finishedAt: {detailQuery.data.data.finishedAt || "-"}</Text>
            <Text>errorMessage: {detailQuery.data.data.errorMessage || "-"}</Text>
          </View>
        ) : (
          <Text className="account-empty">请选择一条删除申请查看详情</Text>
        )}
        {detailErrorText ? <Text className="account-error">{detailErrorText}</Text> : null}
      </View>

      <View className="account-section">
        <View className="account-section-head">
          <Text className="account-title">审计日志</Text>
          <Button size="mini" loading={auditLogsQuery.isFetching} onClick={() => auditLogsQuery.refetch()}>
            刷新
          </Button>
        </View>
        <Input
          className="account-input"
          value={auditAction}
          maxlength={64}
          placeholder="按 action 过滤，如 account.delete.completed"
          onInput={(event) => setAuditAction(event.detail.value)}
        />
        <Picker
          mode="selector"
          range={AUDIT_RESOURCE_OPTIONS.map((item) => item.label)}
          value={auditResourceIndex}
          onChange={(event) => setAuditResourceIndex(Number(event.detail.value))}
        >
          <View className="account-picker-value">
            资源类型：{AUDIT_RESOURCE_OPTIONS[auditResourceIndex]?.label}
          </View>
        </Picker>
        <ScrollView scrollY className="account-list-scroll">
          {auditLogsQuery.data?.data.items.map((item) => (
            <View key={item.auditId} className="account-item">
              <Text className="account-item-id">{item.auditId}</Text>
              <Text className="account-item-line">
                {item.action} / {item.resourceType}
              </Text>
              <Text className="account-item-line">{item.createdAt}</Text>
              <Text className="account-item-line">meta: {stringifyMeta(item.meta)}</Text>
            </View>
          ))}
          {!auditLogsQuery.data?.data.items.length ? <Text className="account-empty">暂无审计日志</Text> : null}
        </ScrollView>
        {auditErrorText ? <Text className="account-error">{auditErrorText}</Text> : null}
      </View>
    </PageShell>
  );
}
