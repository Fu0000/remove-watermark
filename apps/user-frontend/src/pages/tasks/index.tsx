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

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);
const CANCELABLE_STATUS = new Set<TaskStatus>(["QUEUED", "PREPROCESSING", "DETECTING"]);

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
  const [actionText, setActionText] = useState("");
  const [navigatedTaskId, setNavigatedTaskId] = useState<string | undefined>();

  useEffect(() => {
    setNavigatedTaskId(undefined);
  }, [taskId]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", taskId],
    queryFn: listTasks,
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
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
    if (!taskId || !tasksQuery.data) {
      return;
    }

    const found = tasksQuery.data.data.items.find((item) => item.taskId === taskId);
    if (!found) {
      return;
    }

    const nextStatus = found.status as TaskStatus;
    if (nextStatus !== status) {
      setStatus(nextStatus);
    }

    if (nextStatus === "SUCCEEDED" && navigatedTaskId !== taskId) {
      setNavigatedTaskId(taskId);
      Taro.navigateTo({ url: `/pages/result/index?taskId=${taskId}` });
    }
  }, [taskId, tasksQuery.data, status, setStatus, navigatedTaskId]);

  const cancelMutation = useMutation({
    mutationFn: async () => cancelTask(taskId as string, buildIdempotencyKey()),
    onSuccess: (response) => {
      setActionErrorText("");
      setActionText("");
      setStatus(response.data.status as TaskStatus);
      void queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
    },
    onError: (error) => {
      setActionErrorText(resolveErrorText(error, "取消任务失败"));
    }
  });

  const retryMutation = useMutation({
    mutationFn: async () => retryTask(taskId as string, buildIdempotencyKey()),
    onSuccess: (response) => {
      setActionErrorText("");
      setActionText("");
      setStatus(response.data.status as TaskStatus);
      void queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
    },
    onError: (error) => {
      setActionErrorText(resolveErrorText(error, "重试任务失败"));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => deleteTask(taskId as string, buildIdempotencyKey()),
    onSuccess: () => {
      setActionErrorText("");
      setActionText("当前任务已删除（展示已隐藏）");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      setActionText("");
      setActionErrorText(resolveErrorText(error, "删除任务失败"));
    }
  });

  const queryErrorText = useMemo(() => {
    if (!tasksQuery.error) {
      return "";
    }

    return resolveErrorText(tasksQuery.error, "任务刷新失败");
  }, [tasksQuery.error]);

  const handleRefresh = async () => {
    setActionErrorText("");
    setActionText("");
    await tasksQuery.refetch();
  };

  const handleCancel = () => {
    if (!taskId) {
      setActionErrorText("当前无可取消任务");
      return;
    }

    setActionText("");
    cancelMutation.mutate();
  };

  const handleRetry = () => {
    if (!taskId) {
      setActionErrorText("当前无可重试任务");
      return;
    }

    setActionText("");
    retryMutation.mutate();
  };

  const handleDelete = () => {
    if (!taskId) {
      setActionErrorText("当前无可删除任务");
      return;
    }

    setActionText("");
    deleteMutation.mutate();
  };

  const handleGoResult = () => {
    if (!taskId) {
      return;
    }

    Taro.navigateTo({ url: `/pages/result/index?taskId=${taskId}` });
  };

  return (
    <PageShell title="任务中心" subtitle="轮询 3s，失败退避至 15s，支持取消/重试与结果跳转">
      <View>
        <Text>taskId: {taskId || "-"}</Text>
      </View>
      <View>
        <Text>status: {status}</Text>
      </View>
      <View>
        <Text>任务总数: {tasksQuery.data?.data.total || 0}</Text>
      </View>
      <View>
        <Text>轮询失败次数: {tasksQuery.failureCount}</Text>
      </View>
      <View>
        <Button loading={tasksQuery.isFetching} onClick={handleRefresh}>
          刷新任务
        </Button>
      </View>
      <View>
        <Button
          loading={cancelMutation.isPending}
          disabled={!taskId || !CANCELABLE_STATUS.has(status)}
          onClick={handleCancel}
        >
          取消当前任务
        </Button>
      </View>
      <View>
        <Button
          loading={retryMutation.isPending}
          disabled={!taskId || status !== "FAILED"}
          onClick={handleRetry}
        >
          重试当前任务
        </Button>
      </View>
      <View>
        <Button disabled={!taskId || status !== "SUCCEEDED"} onClick={handleGoResult}>
          查看结果页
        </Button>
      </View>
      <View>
        <Button loading={deleteMutation.isPending} disabled={!taskId} onClick={handleDelete}>
          删除当前任务（FR-010）
        </Button>
      </View>
      {actionText ? (
        <View>
          <Text>{actionText}</Text>
        </View>
      ) : null}
      {actionErrorText ? (
        <View>
          <Text>{actionErrorText}</Text>
        </View>
      ) : null}
      {queryErrorText ? (
        <View>
          <Text>{queryErrorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
