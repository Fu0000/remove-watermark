import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { cancelTask, listTasks, retryTask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import type { TaskStatus } from "@packages/contracts";

export default function TasksPage() {
  const { taskId, status, setStatus } = useTaskStore();
  const [latestCount, setLatestCount] = useState(0);
  const [errorText, setErrorText] = useState("");

  const refreshTasks = async () => {
    setErrorText("");
    try {
      const response = await listTasks();
      setLatestCount(response.data.total);

      if (taskId) {
        const found = response.data.items.find((item) => item.taskId === taskId);
        if (found) {
          setStatus(found.status as TaskStatus);
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("任务刷新失败");
      }
    }
  };

  const handleCancel = async () => {
    if (!taskId) {
      return;
    }

    try {
      const response = await cancelTask(taskId, buildIdempotencyKey());
      setStatus(response.data.status as TaskStatus);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      }
    }
  };

  const handleRetry = async () => {
    if (!taskId) {
      return;
    }

    try {
      const response = await retryTask(taskId, buildIdempotencyKey());
      setStatus(response.data.status as TaskStatus);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      }
    }
  };

  return (
    <PageShell title="任务中心" subtitle="状态机字面量与后端一致，支持刷新/取消/重试联调">
      <View>
        <Text>taskId: {taskId || "-"}</Text>
      </View>
      <View>
        <Text>status: {status}</Text>
      </View>
      <View>
        <Text>任务总数: {latestCount}</Text>
      </View>
      <View>
        <Button onClick={refreshTasks}>刷新任务</Button>
      </View>
      <View>
        <Button onClick={handleCancel}>取消当前任务</Button>
      </View>
      <View>
        <Button onClick={handleRetry}>重试当前任务</Button>
      </View>
      {errorText ? (
        <View>
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
