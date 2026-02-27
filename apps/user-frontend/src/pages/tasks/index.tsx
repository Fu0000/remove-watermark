import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Taro from "@tarojs/taro";
import { Button, ScrollView, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { cancelTask, listTasks, retryTask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import type { TaskStatus } from "@packages/contracts";
import "./index.scss";

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);
const PROCESSING_STATUS = new Set<TaskStatus>(["UPLOADED", "QUEUED", "PREPROCESSING", "DETECTING", "INPAINTING", "PACKAGING"]);

function resolveErrorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return `${error.code} ${error.message}`;
  }
  return fallback;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    UPLOADED: "已上传",
    QUEUED: "排队中",
    PREPROCESSING: "预处理中",
    DETECTING: "检测中",
    INPAINTING: "修复中",
    PACKAGING: "打包中",
    SUCCEEDED: "✅ 已完成",
    FAILED: "❌ 失败",
    CANCELED: "已取消"
  };
  return map[status] || status;
}

function statusColor(status: string): string {
  if (status === "SUCCEEDED") return "#10b981";
  if (status === "FAILED") return "#ef4444";
  if (status === "CANCELED") return "#94a3b8";
  return "#3b82f6";
}

function formatTime(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hour}:${minute}`;
  } catch {
    return iso.slice(0, 16);
  }
}

function mediaTypeIcon(mediaType: string): string {
  if (mediaType === "VIDEO") return "🎬";
  if (mediaType === "PDF" || mediaType === "PPT") return "📄";
  return "🖼️";
}

export default function TasksPage() {
  const { taskId, status, setStatus, setTask } = useTaskStore();
  const queryClient = useQueryClient();
  const [actionErrorText, setActionErrorText] = useState("");
  const [navigatedTaskId, setNavigatedTaskId] = useState<string | undefined>();

  useEffect(() => {
    setNavigatedTaskId(undefined);
  }, [taskId]);

  // 拉取全部任务列表
  const tasksQuery = useQuery({
    queryKey: ["tasks-list"],
    queryFn: listTasks,
    refetchInterval: () => {
      // 如有活跃任务则每 3s 刷新，否则不自动刷新
      if (taskId && !TERMINAL_STATUS.has(status)) return 3000;
      return false;
    },
    refetchIntervalInBackground: true
  });

  // 从列表中同步当前活跃任务的状态
  useEffect(() => {
    if (!taskId || !tasksQuery.data) return;

    const found = tasksQuery.data.data.items.find((item: any) => item.taskId === taskId);
    if (!found) return;

    const nextStatus = found.status as TaskStatus;
    if (nextStatus !== status) {
      setStatus(nextStatus);
    }

    // 成功后自动推入 Result
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
      void queryClient.invalidateQueries({ queryKey: ["tasks-list"] });
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
      void queryClient.invalidateQueries({ queryKey: ["tasks-list"] });
    },
    onError: (error: any) => {
      setActionErrorText(resolveErrorText(error, "重试任务失败"));
    }
  });

  const isFailed = status === "FAILED" || status === "CANCELED";
  const isProcessing = taskId && PROCESSING_STATUS.has(status);

  const taskItems = useMemo(() => {
    return tasksQuery.data?.data.items || [];
  }, [tasksQuery.data]);

  const handleViewResult = (id: string) => {
    Taro.navigateTo({ url: `/pages/result/index?taskId=${id}` });
  };

  const handleRetryFromList = (id: string) => {
    setTask(id, "UPLOADED");
    retryMutation.mutate();
  };

  const queryErrorText = useMemo(() => {
    if (!tasksQuery.error) return "";
    return resolveErrorText(tasksQuery.error, "任务列表加载失败");
  }, [tasksQuery.error]);

  return (
    <PageShell title="任务中心" subtitle="所有处理记录一目了然">
      {/* ═══ 活跃任务处理中状态条 ═══ */}
      {isProcessing && (
        <View className="active-task-banner animate-fade-in">
          <View className="active-task-spinner" />
          <View className="active-task-info">
            <Text className="active-task-title">AI 正在处理中...</Text>
            <Text className="active-task-status">{statusLabel(status)}</Text>
          </View>
          <Button
            className="active-task-cancel-btn"
            size="mini"
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            取消
          </Button>
        </View>
      )}

      {/* ═══ 失败/取消恢复条 ═══ */}
      {taskId && isFailed && (
        <View className="active-task-banner active-task-banner-error animate-fade-in">
          <View className="active-task-error-icon">!</View>
          <View className="active-task-info">
            <Text className="active-task-title active-task-title-error">处理遇到异常</Text>
            <Text className="active-task-status">{statusLabel(status)}</Text>
          </View>
          <Button
            className="tasks-btn-primary-sm"
            size="mini"
            loading={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
          >
            重试
          </Button>
        </View>
      )}

      {/* ═══ 错误提示 ═══ */}
      {(actionErrorText || queryErrorText) && (
        <View className="processing-error-banner animate-slide-up">
          <Text>{actionErrorText || queryErrorText}</Text>
        </View>
      )}

      {/* ═══ 任务历史列表 ═══ */}
      <View className="task-list-section">
        <View className="task-list-header">
          <Text className="task-list-title">历史记录</Text>
          <Button
            className="task-list-refresh"
            size="mini"
            loading={tasksQuery.isFetching}
            onClick={() => tasksQuery.refetch()}
          >
            刷新
          </Button>
        </View>

        <ScrollView scrollY className="task-list-scroll">
          {taskItems.length === 0 && !tasksQuery.isLoading ? (
            <View className="task-list-empty">
              <Text className="task-list-empty-icon">📭</Text>
              <Text className="task-list-empty-text">还没有任务记录</Text>
              <Button
                className="tasks-btn"
                onClick={() => Taro.switchTab({ url: "/pages/home/index" })}
              >
                去上传第一张图
              </Button>
            </View>
          ) : null}

          {taskItems.map((item: any) => (
            <View
              key={item.taskId}
              className={`task-card ${item.taskId === taskId ? "task-card-active" : ""}`}
              onClick={() => {
                if (item.status === "SUCCEEDED") {
                  handleViewResult(item.taskId);
                }
              }}
            >
              <View className="task-card-left">
                <Text className="task-card-icon">{mediaTypeIcon(item.mediaType)}</Text>
              </View>
              <View className="task-card-body">
                <View className="task-card-top">
                  <Text className="task-card-id">{item.taskId.slice(0, 12)}...</Text>
                  <Text
                    className="task-card-status"
                    style={{ color: statusColor(item.status) }}
                  >
                    {statusLabel(item.status)}
                  </Text>
                </View>
                <View className="task-card-bottom">
                  <Text className="task-card-time">{formatTime(item.createdAt)}</Text>
                  <Text className="task-card-policy">{item.taskPolicy}</Text>
                </View>
              </View>
              <View className="task-card-actions">
                {item.status === "SUCCEEDED" && (
                  <Text
                    className="task-card-action-link"
                    onClick={(e: any) => {
                      e.stopPropagation?.();
                      handleViewResult(item.taskId);
                    }}
                  >
                    查看 →
                  </Text>
                )}
                {item.status === "FAILED" && (
                  <Text
                    className="task-card-action-link task-card-action-retry"
                    onClick={(e: any) => {
                      e.stopPropagation?.();
                      handleRetryFromList(item.taskId);
                    }}
                  >
                    重试
                  </Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </PageShell>
  );
}
