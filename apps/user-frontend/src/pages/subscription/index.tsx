import { useEffect, useMemo, useState } from "react";
import Taro from "@tarojs/taro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, ScrollView, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { SUBSCRIPTION_RETURN_URL } from "@/config/runtime";
import { ApiError } from "@/services/http";
import {
  checkoutSubscription,
  getMySubscription,
  getMyUsage,
  listPlans,
  mockConfirmSubscription,
  type PlanView
} from "@/services/subscription";
import { useAuthStore } from "@/stores/auth.store";
import { buildIdempotencyKey } from "@/utils/idempotency";
import "../tasks/index.scss"; /* 复用 action 基础深色按钮设计 */
import "./index.scss";

function resolveErrorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return `${error.code} ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

// ... (省略未变更的格式化函数，保留原貌需要全部包裹)
function formatPrice(price: number) {
  if (price <= 0) return "免费";
  return `¥${(price / 100).toFixed(2)}`;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "-";
  return iso.replace("T", " ").replace(".000Z", "Z");
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "生效中";
  if (status === "PENDING") return "待生效";
  if (status === "PAST_DUE") return "待续费";
  if (status === "CANCELED") return "已取消";
  if (status === "EXPIRED") return "已过期";
  if (status === "REFUNDED") return "已退款";
  return status;
}

function statusColor(status: string) {
  if (status === "ACTIVE") return "#10b981";
  if (status === "PENDING") return "#f59e0b";
  if (status === "PAST_DUE" || status === "EXPIRED") return "#ef4444";
  return "#71717a";
}

function sortPlansByPriority(plans: PlanView[]) {
  return [...plans].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.planId.localeCompare(right.planId);
  });
}

export default function SubscriptionPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [actionHint, setActionHint] = useState("");
  const [actionError, setActionError] = useState("");

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: listPlans,
    enabled: Boolean(accessToken)
  });

  const subscriptionQuery = useQuery({
    queryKey: ["subscription-me"],
    queryFn: getMySubscription,
    enabled: Boolean(accessToken)
  });

  const usageQuery = useQuery({
    queryKey: ["subscription-usage"],
    queryFn: getMyUsage,
    enabled: Boolean(accessToken)
  });

  useEffect(() => {
    if (selectedPlanId) return;

    const currentPlan = subscriptionQuery.data?.data.planId;
    if (currentPlan) {
      setSelectedPlanId(currentPlan);
      return;
    }

    const firstPlan = plansQuery.data?.data[0];
    if (firstPlan) setSelectedPlanId(firstPlan.planId);
  }, [selectedPlanId, subscriptionQuery.data, plansQuery.data]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error("请先选择套餐");
      return checkoutSubscription(
        {
          planId: selectedPlanId,
          channel: "wechat_pay",
          clientReturnUrl: SUBSCRIPTION_RETURN_URL
        },
        buildIdempotencyKey()
      );
    },
    onSuccess: (response) => {
      setActionError("");
      setActionHint(`已创建订阅订单：${response.data.orderId}`);
      setOrderId(response.data.orderId);
      void queryClient.invalidateQueries({ queryKey: ["subscription-me"] });
    },
    onError: (error) => {
      setActionHint("");
      setActionError(resolveErrorText(error, "发起订阅失败"));
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const normalized = orderId.trim();
      if (!normalized) throw new Error("请先填写订单号");
      return mockConfirmSubscription(normalized, buildIdempotencyKey());
    },
    onSuccess: (response) => {
      setActionError("");
      setActionHint(`订阅已激活：${response.data.planId}（${statusLabel(response.data.status)}）`);
      void queryClient.invalidateQueries({ queryKey: ["subscription-me"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
    },
    onError: (error) => {
      setActionHint("");
      setActionError(resolveErrorText(error, "确认订阅失败"));
    }
  });

  const plans = useMemo(() => sortPlansByPriority(plansQuery.data?.data || []), [plansQuery.data]);
  const subscription = subscriptionQuery.data?.data;
  const usage = usageQuery.data?.data;

  const loadingAny = plansQuery.isFetching || subscriptionQuery.isFetching || usageQuery.isFetching;

  const queryErrorText = useMemo(() => {
    const firstError = plansQuery.error || subscriptionQuery.error || usageQuery.error;
    if (!firstError) return "";
    return resolveErrorText(firstError, "查询订阅信息失败");
  }, [plansQuery.error, subscriptionQuery.error, usageQuery.error]);

  const handleRefresh = async () => {
    setActionHint("");
    setActionError("");
    await Promise.all([plansQuery.refetch(), subscriptionQuery.refetch(), usageQuery.refetch()]);
  };

  const handleCheckout = () => {
    setActionHint("");
    setActionError("");
    checkoutMutation.mutate();
  };

  const handleMockConfirm = () => {
    setActionHint("");
    setActionError("");
    confirmMutation.mutate();
  };

  const handleGoLogin = () => {
    void Taro.switchTab({ url: "/pages/home/index" });
  };

  return (
    <PageShell title="套餐组合" subtitle="暗能量源泉，探索更多算力边界（FE-006）">
      {!accessToken ? (
        <View className="subscription-section">
          <Text className="subscription-empty">当前未开启节点连接，请至入口端重置验证域。</Text>
          <Button className="tasks-btn tasks-btn-primary" onClick={handleGoLogin}>重新挂载主域节点</Button>
        </View>
      ) : null}

      {accessToken ? (
        <View className="subscription-section">
          <View className="subscription-head">
            <Text className="subscription-title">基础面源记录</Text>
            <Button size="mini" loading={loadingAny} onClick={handleRefresh}>
              刷新拓扑
            </Button>
          </View>
          <Text className="subscription-kv">用户：{user?.userId || "u_1001"}</Text>
          <Text className="subscription-kv">
            当前套餐：{subscription?.planId || "-"}（
            <Text style={{ color: statusColor(subscription?.status || "UNKNOWN"), fontWeight: 600 }}>
              {statusLabel(subscription?.status || "-")}
            </Text>
            ）
          </Text>
          <Text className="subscription-kv">生效时间：{formatTime(subscription?.effectiveAt)}</Text>
          <Text className="subscription-kv">到期时间：{formatTime(subscription?.expireAt)}</Text>
          <Text className="subscription-kv">自动续费：{subscription?.autoRenew ? "是" : "否"}</Text>
        </View>
      ) : null}

      {accessToken ? (
        <View className="subscription-section">
          <Text className="subscription-title">套餐选择</Text>
          {plans.map((plan) => (
            <View
              key={plan.planId}
              className={`subscription-plan-card ${selectedPlanId === plan.planId ? "subscription-plan-card-active" : ""}`}
              onClick={() => setSelectedPlanId(plan.planId)}
            >
              <View className="subscription-plan-head">
                <Text className="subscription-plan-name">{plan.name}</Text>
                <Text className="subscription-plan-price">{formatPrice(plan.price)}</Text>
              </View>
              <Text className="subscription-plan-meta">planId：{plan.planId}</Text>
              <Text className="subscription-plan-meta">月配额：{plan.monthlyQuota}</Text>
              <Text className="subscription-plan-meta">
                权益：{plan.features?.length ? plan.features.join(" / ") : "无"}
              </Text>
            </View>
          ))}
          {!plans.length && !plansQuery.isLoading ? <Text className="subscription-empty">暂无套餐数据</Text> : null}
        </View>
      ) : null}

      {accessToken ? (
        <View className="subscription-section">
          <Text className="subscription-title">订阅动作（本地联调）</Text>
          <Button
            className="tasks-btn tasks-btn-primary"
            loading={checkoutMutation.isPending}
            disabled={!selectedPlanId}
            onClick={handleCheckout}
          >
            发起订阅（checkout）
          </Button>
          <Input
            className="subscription-input"
            value={orderId}
            maxlength={64}
            placeholder="输入 orderId 后可执行 mock-confirm"
            onInput={(event) => setOrderId(event.detail.value)}
            placeholderTextColor="#71717a"
          />
          <Button
            className="tasks-btn"
            loading={confirmMutation.isPending}
            disabled={!orderId.trim()}
            onClick={handleMockConfirm}
          >
            模拟确认支付（mock-confirm）
          </Button>
          <Text className="subscription-kv">returnUrl：{SUBSCRIPTION_RETURN_URL}</Text>
          {actionHint ? <Text className="subscription-hint">{actionHint}</Text> : null}
          {actionError ? <Text className="subscription-error">{actionError}</Text> : null}
          {queryErrorText ? <Text className="subscription-error">{queryErrorText}</Text> : null}
        </View>
      ) : null}

      {accessToken ? (
        <View className="subscription-section">
          <Text className="subscription-title">配额与账单流水</Text>
          <Text className="subscription-kv">周期开始：{formatTime(usage?.periodStart)}</Text>
          <Text className="subscription-kv">周期结束：{formatTime(usage?.periodEnd)}</Text>
          <Text className="subscription-kv">总额度：{usage?.quotaTotal ?? "-"}</Text>
          <Text className="subscription-kv">剩余额度：{usage?.quotaLeft ?? "-"}</Text>

          <ScrollView scrollY className="subscription-ledger-scroll">
            {usage?.ledgerItems?.map((item) => (
              <View key={item.ledgerId} className="subscription-ledger-item">
                <View className="subscription-ledger-head">
                  <Text className="subscription-ledger-id">{item.ledgerId}</Text>
                  <Text style={{ color: statusColor(item.status), fontWeight: 600 }}>{item.status}</Text>
                </View>
                <Text className="subscription-plan-meta" style={{ marginTop: "8rpx" }}>taskId：{item.taskId}</Text>
                <Text className="subscription-plan-meta">consumeUnit：{item.consumeUnit}</Text>
                <Text className="subscription-plan-meta">source：{item.source}</Text>
                <Text className="subscription-plan-meta">consumeAt：{formatTime(item.consumeAt)}</Text>
              </View>
            ))}
            {!usage?.ledgerItems?.length ? <Text className="subscription-empty">当前周期暂无账务流水</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </PageShell>
  );
}
