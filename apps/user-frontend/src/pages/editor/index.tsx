import { useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Picker, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { getUploadPolicy } from "@/services/asset";
import { createTask, upsertTaskMask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import { useAuthStore } from "@/stores/auth.store";
import type { TaskStatus } from "@packages/contracts";

const mediaOptions: Array<"IMAGE" | "VIDEO"> = ["IMAGE", "VIDEO"];

export default function EditorPage() {
  const [agreement, setAgreement] = useState(false);
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [loading, setLoading] = useState(false);
  const [maskLoading, setMaskLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [maskVersion, setMaskVersion] = useState(0);
  const [maskId, setMaskId] = useState("");
  const user = useAuthStore((state) => state.user);
  const { taskId, setTask } = useTaskStore();

  const handleCreateTask = async () => {
    if (!agreement) {
      setErrorText("请先勾选授权声明");
      return;
    }

    if (!user) {
      setErrorText("当前未登录，请先返回首页登录");
      return;
    }

    setLoading(true);
    setErrorText("");
    try {
      const uploadPolicy = await getUploadPolicy({
        fileName: mediaType === "IMAGE" ? "demo.png" : "demo.mp4",
        fileSize: mediaType === "IMAGE" ? 1024 * 300 : 1024 * 1024 * 5,
        mediaType: mediaType === "IMAGE" ? "image" : "video",
        mimeType: mediaType === "IMAGE" ? "image/png" : "video/mp4"
      });

      const task = await createTask(
        {
          assetId: uploadPolicy.data.assetId,
          mediaType,
          taskPolicy: "FAST"
        },
        buildIdempotencyKey()
      );

      setTask(task.data.taskId, task.data.status as TaskStatus);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("任务创建失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitMask = async () => {
    if (!taskId) {
      setErrorText("请先创建任务再提交蒙版");
      return;
    }

    setMaskLoading(true);
    setErrorText("");
    try {
      const response = await upsertTaskMask(
        taskId,
        {
          imageWidth: 1920,
          imageHeight: 1080,
          polygons: [
            [
              [100, 100],
              [260, 100],
              [260, 220],
              [100, 220]
            ]
          ],
          brushStrokes: [],
          version: maskVersion
        },
        buildIdempotencyKey()
      );

      setMaskVersion(response.data.version);
      setMaskId(response.data.maskId);
      Taro.switchTab({ url: "/pages/tasks/index" });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("蒙版提交失败，请稍后重试");
      }
    } finally {
      setMaskLoading(false);
    }
  };

  return (
    <PageShell title="上传与编辑" subtitle="已接入上传策略、任务创建与蒙版提交链路">
      <View>
        <Text>上传前请确认素材权属授权。</Text>
      </View>
      <View>
        <Picker
          mode="selector"
          range={mediaOptions}
          onChange={(event) => {
            const index = Number(event.detail.value);
            setMediaType(mediaOptions[index] || "IMAGE");
          }}
        >
          <Button>当前类型：{mediaType}</Button>
        </Picker>
      </View>
      <View>
        <Button onClick={() => setAgreement((v) => !v)}>
          {agreement ? "已勾选授权声明" : "勾选授权声明"}
        </Button>
      </View>
      <View>
        <Button type="primary" loading={loading} onClick={handleCreateTask}>
          申请上传策略并创建任务（步骤 1）
        </Button>
      </View>
      <View>
        <Button type="primary" loading={maskLoading} onClick={handleSubmitMask}>
          提交示例蒙版并进入任务中心（步骤 2）
        </Button>
      </View>
      <View>
        <Text>当前 taskId：{taskId || "-"}</Text>
      </View>
      <View>
        <Text>maskId/version：{maskId ? `${maskId} / v${maskVersion}` : "-"}</Text>
      </View>
      {errorText ? (
        <View>
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
