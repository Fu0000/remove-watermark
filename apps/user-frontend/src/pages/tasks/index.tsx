import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { cancelTask, deleteTask, listTasks, retryTask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import type { TaskStatus } from "@packages/contracts";
import "./index.scss";

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

function resolveErrorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return `${error.code} ${error.message}`;
  }
  return fallback;
}

export default function TasksPage() {
  const { taskId, status, setStatus, reset } = useTaskStore();
  const queryClient = useQueryClient();
  const [actionErrorText, setActionErrorText] = useState("");
  const [navigatedTaskId, setNavigatedTaskId] = useState<string | undefined>();

  useEffect(() => {
    setNavigatedTaskId(undefined);
  }, [taskId]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", taskId],
    queryFn: listTasks,
    enabled: Boolean(taskId),
    refetchInterval: (query: any) => {
      if (!taskId || TERMINAL_STATUS.has(status)) {
        return false;
      }
      const failures = query.state.fetchFailureCount;
      const backoffFactor = Math.max(1, 2 ** failures);
      return Math.min(3000 * backoffFactor, 15000);
    },
    refetchIntervalInBackground: true
  });

  useEffect(() => {
    if (!taskId || !tasksQuery.data) return;

    const found = tasksQuery.data.data.items.find((item: any) => item.taskId === taskId);
    if (!found) return;

    const nextStatus = found.status as TaskStatus;
    if (nextStatus !== status) {
      setStatus(nextStatus);
    }

    // 成功后自动推入 Result，这是用户视角的核心无缝流转点
    if (nextStatus === "SUCCEEDED" && navigatedTaskId !== taskId) {
      setNavigatedTaskId(taskId);
      Taro.navigateTo({ url: `/pages/result/index?taskId=${taskId}` });
    }
  }, [taskId, tasksQuery.data, status, setStatus, navigatedTaskId]);

  const cancelMutation = useMutation({
    mutationFn: async () => cancelTask(taskId as string, buildIdempotencyKey()),
    onSuccess: (response: any) => {
      setActionErrorText("");
      setStatus(response.data.status as TaskStatus);
      void queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
      Taro.navigateBack(); // 返回前一页
    },
    onError: (error: any) => {
      setActionErrorText(resolveErrorText(error, "取消任务失败"));
    }
  });

  const retryMutation = useMutation({
    mutationFn: async () => retryTask(taskId as string, buildIdempotencyKey()),
    onSuccess: (response: any) => {
      setActionErrorText("");
      setStatus(response.data.status as TaskStatus);
      void queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
    },
    onError: (error: any) => {
      setActionErrorText(resolveErrorText(error, "重试任务失败"));
    }
  });

  const queryErrorText = useMemo(() => {
    if (!tasksQuery.error) return "";
    return resolveErrorText(tasksQuery.error, "状态刷新异常");
  }, [tasksQuery.error]);

  const handleCancel = () => {
    if (!taskId) return;
    cancelMutation.mutate();
  };

  const handleRetry = () => {
    if (!taskId) return;
    retryMutation.mutate();
  };

  const isFailed = status === "FAILED" || status === "CANCELED";

  return (
    <PageShell title="超纯净去水印" subtitle="AI 处理中心">
      <View className="processing-container animate-fade-in">

        {/* 核心发光转盘区 */}
        <View className="processing-spinner-ring">
          {!isFailed ? (
            <View className="processing-spinner-active" />
          ) : (
            <View className="processing-spinner-error">!</View>
          )}
        </View>

        {/* 状态文案提示区 */}
        <View className="processing-text-group">
          {!taskId ? (
            <Text className="processing-title">暂无活跃任务</Text>
          ) : status === "SUCCEEDED" ? (
            <Text className="processing-title">处理完成，正在带您前往结果页...</Text>
          ) : isFailed ? (
            <Text className="processing-title processing-title-failed">处理遇到异常</Text>
          ) : (
            <Text className="processing-title">AI 正在精准擦除，请稍候...</Text>
          )}

          {(!isFailed && taskId && status !== "SUCCEEDED") && (
            <Text className="processing-subtitle">云端算力全开，保持屏幕亮起可加速</Text>
          )}
        </View>

        {/* 出错或兜底动作区域 */}
        <View className="processing-actions">
          {isFailed && (
            <Button
              className="tasks-btn tasks-btn-primary"
              loading={retryMutation.isPending}
              onClick={handleRetry}
            >
              🔄 重新尝试
            </Button>
          )}
          {(!isFailed && taskId && status !== "SUCCEEDED") && (
            <Button
              className="tasks-btn"
              loading={cancelMutation.isPending}
              onClick={handleCancel}
            >
              取消当前处理
            </Button>
          )}
          {(!taskId || isFailed) && (
            <Button className="tasks-btn" onClick={() => Taro.switchTab({ url: "/pages/home/index" })}>返回首页</Button>
          )}
        </View>

        {/* 异常提示小喇叭 */}
        {(actionErrorText || queryErrorText) && (
          <View className="processing-error-banner animate-slide-up">
            <Text>{actionErrorText || queryErrorText}</Text>
          </View>
        )}

      </View>
    </PageShell>
  );
}
