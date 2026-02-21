import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Taro, { useRouter } from "@tarojs/taro";
import { Button, Image, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { ApiError } from "@/services/http";
import { getTaskDetail, getTaskResult } from "@/services/task";
import { useTaskStore } from "@/stores/task.store";
import type { TaskStatus } from "@packages/contracts";

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

function resolveErrorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return `${error.code} ${error.message}`;
  }

  return fallback;
}

export default function ResultPage() {
  const router = useRouter();
  const taskIdFromStore = useTaskStore((state) => state.taskId);
  const setStatus = useTaskStore((state) => state.setStatus);
  const taskId = router.params?.taskId || taskIdFromStore;

  const detailQuery = useQuery({
    queryKey: ["task-detail", taskId],
    queryFn: async () => getTaskDetail(taskId as string),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      if (!taskId) {
        return false;
      }

      const current = query.state.data?.data.status as TaskStatus | undefined;
      if (current && TERMINAL_STATUS.has(current)) {
        return false;
      }

      return 3000;
    }
  });

  const currentStatus = (detailQuery.data?.data.status as TaskStatus | undefined) || "UPLOADED";

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }

    setStatus(detailQuery.data.data.status as TaskStatus);
  }, [detailQuery.data, setStatus]);

  const resultQuery = useQuery({
    queryKey: ["task-result", taskId, currentStatus],
    queryFn: async () => getTaskResult(taskId as string),
    enabled: Boolean(taskId) && currentStatus === "SUCCEEDED"
  });

  const errorText = useMemo(() => {
    if (detailQuery.error) {
      return resolveErrorText(detailQuery.error, "任务详情获取失败");
    }

    if (resultQuery.error) {
      return resolveErrorText(resultQuery.error, "任务结果获取失败");
    }

    return "";
  }, [detailQuery.error, resultQuery.error]);

  const handleBackTasks = () => {
    Taro.switchTab({ url: "/pages/tasks/index" });
  };

  const handleOpenResult = () => {
    const resultUrl = resultQuery.data?.data.resultUrl;
    if (!resultUrl) {
      return;
    }

    if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
      window.open(resultUrl, "_blank");
      return;
    }

    Taro.previewImage({
      urls: [resultUrl],
      current: resultUrl
    }).catch(() => {
      void Taro.setClipboardData({ data: resultUrl });
    });
  };

  const handleCopyResultUrl = () => {
    const resultUrl = resultQuery.data?.data.resultUrl;
    if (!resultUrl) {
      return;
    }

    void Taro.setClipboardData({ data: resultUrl });
  };

  if (!taskId) {
    return (
      <PageShell title="结果下载" subtitle="未检测到任务，请先回任务中心选择任务">
        <View>
          <Button onClick={handleBackTasks}>返回任务中心</Button>
        </View>
      </PageShell>
    );
  }

  return (
    <PageShell title="结果下载" subtitle="仅使用签名 URL，避免永久直链泄露">
      <View>
        <Text>taskId: {taskId}</Text>
      </View>
      <View>
        <Text>status: {currentStatus}</Text>
      </View>
      {currentStatus !== "SUCCEEDED" ? (
        <View>
          <Text>任务尚未完成，请返回任务中心继续观察状态。</Text>
        </View>
      ) : null}
      {resultQuery.data?.data.resultUrl ? (
        <View>
          <Image
            src={resultQuery.data.data.resultUrl}
            mode="widthFix"
            style={{ width: "100%", borderRadius: "8px", marginTop: "12px" }}
          />
        </View>
      ) : null}
      <View>
        <Text>expireAt: {resultQuery.data?.data.expireAt || "-"}</Text>
      </View>
      <View>
        <Button loading={detailQuery.isFetching || resultQuery.isFetching} onClick={handleOpenResult}>
          预览/打开结果
        </Button>
      </View>
      <View>
        <Button onClick={handleCopyResultUrl}>复制结果地址</Button>
      </View>
      <View>
        <Button onClick={handleBackTasks}>返回任务中心</Button>
      </View>
      {errorText ? (
        <View>
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
