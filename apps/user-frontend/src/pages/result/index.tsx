import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Taro, { useRouter } from "@tarojs/taro";
import { Button, Image, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { ApiError } from "@/services/http";
import { getTaskDetail, getTaskResult } from "@/services/task";
import { useTaskStore } from "@/stores/task.store";
import { isH5 } from "@/utils/platform";
import type { TaskStatus } from "@packages/contracts";
import "../tasks/index.scss";
import "./index.scss";

const TERMINAL_STATUS = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

function resolveErrorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) return `${error.code} ${error.message}`;
  return fallback;
}

export default function ResultPage() {
  const router = useRouter();
  const taskIdFromStore = useTaskStore((state: any) => state.taskId);
  const setStatus = useTaskStore((state: any) => state.setStatus);
  const taskId = router.params?.taskId || taskIdFromStore;

  const detailQuery = useQuery({
    queryKey: ["task-detail", taskId],
    queryFn: async () => getTaskDetail(taskId as string),
    enabled: Boolean(taskId),
    refetchInterval: (query: any) => {
      if (!taskId) return false;
      const current = query.state.data?.data.status as TaskStatus | undefined;
      if (current && TERMINAL_STATUS.has(current)) return false;
      return 3000;
    }
  });

  const currentStatus = (detailQuery.data?.data.status as TaskStatus | undefined) || "UPLOADED";

  useEffect(() => {
    if (!detailQuery.data) return;
    setStatus(detailQuery.data.data.status as TaskStatus);
  }, [detailQuery.data, setStatus]);

  const resultQuery = useQuery({
    queryKey: ["task-result", taskId, currentStatus],
    queryFn: async () => getTaskResult(taskId as string),
    enabled: Boolean(taskId) && currentStatus === "SUCCEEDED"
  });

  const errorText = useMemo(() => {
    if (detailQuery.error) return resolveErrorText(detailQuery.error, "任务详情获取失败");
    if (resultQuery.error) return resolveErrorText(resultQuery.error, "任务结果获取失败");
    return "";
  }, [detailQuery.error, resultQuery.error]);

  const handleBackHome = () => {
    Taro.switchTab({ url: "/pages/home/index" });
  };

  const handleOpenResult = () => {
    const resultUrl = resultQuery.data?.data.resultUrl;
    if (!resultUrl) return;

    if (isH5() && typeof window !== "undefined") {
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
    if (!resultUrl) return;
    void Taro.setClipboardData({ data: resultUrl });
  };

  if (!taskId || (detailQuery.isSuccess && currentStatus !== "SUCCEEDED")) {
    return (
      <PageShell title="处理结果" subtitle="暂无可用成品">
        <View className="result-section">
          <View className="result-warning">
            <Text className="result-warning-text">当前作品尚未处理完成或已失效。</Text>
          </View>
          <Button className="tasks-btn" onClick={handleBackHome}>返回首页再试一次</Button>
        </View>
      </PageShell>
    );
  }

  return (
    <PageShell title="大功告成 ✨" subtitle="极净抹除完毕">
      <View className="result-section">

        {/* 高清画幅预览为主，移除所有的状态面板与生硬字段 */}
        {resultQuery.data?.data.resultUrl ? (
          <View className="result-preview-container animate-fade-in">
            <Image
              src={resultQuery.data.data.resultUrl}
              mode="widthFix"
              className="result-preview-image"
            />
            {resultQuery.data.data.expireAt && (
              <View className="result-shield-badge">
                <Text>🛡️ 有效至 {resultQuery.data.data.expireAt}</Text>
              </View>
            )}
          </View>
        ) : (
          <View className="result-skeleton animate-pulse" />
        )}

        <View className="result-actions animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <Button
            className="tasks-btn tasks-btn-primary"
            loading={detailQuery.isFetching || resultQuery.isFetching}
            disabled={!resultQuery.data?.data.resultUrl}
            onClick={handleOpenResult}
          >
            ⏬ 保存或预览大图
          </Button>

          <Button
            className="tasks-btn"
            disabled={!resultQuery.data?.data.resultUrl}
            onClick={handleCopyResultUrl}
          >
            🔗 复制直链 (防盗链配置)
          </Button>

          <Button className="tasks-btn" onClick={handleBackHome}>➕ 再来一张</Button>
        </View>

        {errorText ? (
          <View className="result-error-banner animate-slide-up">
            <Text>{errorText}</Text>
          </View>
        ) : null}
      </View>
    </PageShell>
  );
}
