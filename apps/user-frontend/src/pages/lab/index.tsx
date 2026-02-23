import { useEffect, useMemo, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Image, Text, View } from "@tarojs/components";
import type { TaskMediaType } from "@packages/contracts";
import { PageShell } from "@/modules/common/page-shell";
import { wechatLogin } from "@/services/auth";
import { getUploadPolicy } from "@/services/asset";
import { setTokenAccessor, ApiError } from "@/services/http";
import { createTask, getTaskDetail, getTaskResult, upsertTaskRegions } from "@/services/task";
import { useAuthStore } from "@/stores/auth.store";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { isH5 } from "@/utils/platform";
import { API_BASE_URL, SHARED_AUTH_CODE, SHARED_PASSWORD, SHARED_USERNAME } from "@/config/runtime";
import "./index.scss";

type UploadMediaType = "IMAGE" | "VIDEO" | "PDF" | "PPT";

interface SelectedAsset {
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaType: UploadMediaType;
  previewUrl?: string;
  width: number;
  height: number;
}

interface BoxRegion {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TaskProgress {
  taskId: string;
  status: string;
  progress: number;
  errorCode?: string;
  errorMessage?: string;
  resultUrl?: string;
  artifacts?: Array<{ type: "PDF" | "ZIP" | "VIDEO" | "IMAGE"; url: string; expireAt: string }>;
}

const DOC_WIDTH = 1241;
const DOC_HEIGHT = 1754;
const POLL_MAX_ATTEMPTS = 90;
const POLL_INTERVAL_MS = 2000;

function guessMimeType(fileName: string, mediaType: UploadMediaType) {
  const normalized = fileName.toLowerCase();
  if (mediaType === "IMAGE") {
    if (normalized.endsWith(".png")) {
      return "image/png";
    }
    if (normalized.endsWith(".webp")) {
      return "image/webp";
    }
    return "image/jpeg";
  }
  if (mediaType === "VIDEO") {
    if (normalized.endsWith(".mov")) {
      return "video/quicktime";
    }
    if (normalized.endsWith(".webm")) {
      return "video/webm";
    }
    return "video/mp4";
  }
  if (mediaType === "PDF") {
    return "application/pdf";
  }
  if (normalized.endsWith(".ppt")) {
    return "application/vnd.ms-powerpoint";
  }
  return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function detectMediaType(fileName: string, mimeType: string): UploadMediaType | undefined {
  const normalizedName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedMime.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(normalizedName)) {
    return "IMAGE";
  }
  if (
    normalizedMime.startsWith("video/") ||
    /\.(mp4|mov|webm|mkv|avi)$/i.test(normalizedName)
  ) {
    return "VIDEO";
  }
  if (normalizedMime === "application/pdf" || normalizedName.endsWith(".pdf")) {
    return "PDF";
  }
  if (
    normalizedMime === "application/vnd.ms-powerpoint" ||
    normalizedMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    /\.(ppt|pptx)$/i.test(normalizedName)
  ) {
    return "PPT";
  }
  return undefined;
}

function toUploadPolicyType(mediaType: UploadMediaType): "image" | "video" | "pdf" | "ppt" {
  if (mediaType === "IMAGE") {
    return "image";
  }
  if (mediaType === "VIDEO") {
    return "video";
  }
  if (mediaType === "PDF") {
    return "pdf";
  }
  return "ppt";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractPointFromEvent(
  event: unknown,
  boardRect: BoardRect,
  assetSize: { width: number; height: number }
): [number, number] | undefined {
  const record = event as {
    touches?: Array<Record<string, unknown>>;
    changedTouches?: Array<Record<string, unknown>>;
    detail?: Record<string, unknown>;
  };

  const touched = record.touches?.[0] || record.changedTouches?.[0];
  const rawX =
    asFiniteNumber(touched?.x) ??
    asFiniteNumber(touched?.clientX) ??
    asFiniteNumber(touched?.pageX) ??
    asFiniteNumber(record.detail?.x) ??
    asFiniteNumber(record.detail?.clientX);
  const rawY =
    asFiniteNumber(touched?.y) ??
    asFiniteNumber(touched?.clientY) ??
    asFiniteNumber(touched?.pageY) ??
    asFiniteNumber(record.detail?.y) ??
    asFiniteNumber(record.detail?.clientY);

  if (rawX === undefined || rawY === undefined) {
    return undefined;
  }

  const localX = clamp(rawX - boardRect.left, 0, boardRect.width);
  const localY = clamp(rawY - boardRect.top, 0, boardRect.height);
  const normalizedX = Math.round((localX / boardRect.width) * assetSize.width);
  const normalizedY = Math.round((localY / boardRect.height) * assetSize.height);

  return [normalizedX, normalizedY];
}

function normalizeBox(anchor: [number, number], current: [number, number]): BoxRegion | undefined {
  const left = Math.min(anchor[0], current[0]);
  const right = Math.max(anchor[0], current[0]);
  const top = Math.min(anchor[1], current[1]);
  const bottom = Math.max(anchor[1], current[1]);

  if (right - left < 8 || bottom - top < 8) {
    return undefined;
  }

  return {
    id: `box_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    left,
    top,
    right,
    bottom
  };
}

async function pickFileForH5(): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("当前环境不支持文件选择"));
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      "image/*,video/*,application/pdf,.pdf,application/vnd.ms-powerpoint,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx";
    input.style.display = "none";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("未选择文件"));
        return;
      }
      resolve(file);
    };

    input.click();
  });
}

async function resolveAssetDimensions(file: File, mediaType: UploadMediaType): Promise<{ width: number; height: number }> {
  if (!isH5()) {
    return mediaType === "PDF" || mediaType === "PPT"
      ? { width: DOC_WIDTH, height: DOC_HEIGHT }
      : { width: 1920, height: 1080 };
  }

  if (mediaType === "PDF" || mediaType === "PPT") {
    return { width: DOC_WIDTH, height: DOC_HEIGHT };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    if (mediaType === "IMAGE") {
      const size = await new Promise<{ width: number; height: number }>((resolve) => {
        const image = new window.Image();
        image.onload = () => {
          resolve({
            width: image.naturalWidth || 1920,
            height: image.naturalHeight || 1080
          });
        };
        image.onerror = () => resolve({ width: 1920, height: 1080 });
        image.src = objectUrl;
      });
      return size;
    }

    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720
        });
      };
      video.onerror = () => resolve({ width: 1280, height: 720 });
      video.src = objectUrl;
    });
    return size;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadWithPresignedUrl(uploadUrl: string, headers: Record<string, string>, file: File) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: file
  });

  if (response.ok) {
    return;
  }

  const message = await response.text();
  throw new Error(message || `upload failed: ${response.status}`);
}

function toRegionPayload(mediaType: UploadMediaType, boxes: BoxRegion[]) {
  return boxes.map((box) => {
    const base = {
      box_2d: [box.left, box.top, box.right, box.bottom]
    };
    if (mediaType === "VIDEO") {
      return { ...base, frameIndex: 0 };
    }
    if (mediaType === "PDF" || mediaType === "PPT") {
      return { ...base, pageIndex: 0 };
    }
    return base;
  });
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LabPage() {
  const [asset, setAsset] = useState<SelectedAsset>();
  const [boardRect, setBoardRect] = useState<BoardRect>();
  const [anchorPoint, setAnchorPoint] = useState<[number, number] | null>(null);
  const [regions, setRegions] = useState<BoxRegion[]>([]);
  const [taskProgress, setTaskProgress] = useState<TaskProgress>();
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [errorText, setErrorText] = useState("");

  const setSession = useAuthStore((state) => state.setSession);
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const previewUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setTokenAccessor(() => accessToken);
  }, [accessToken]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = undefined;
      }
    },
    []
  );

  const updateBoardRect = () => {
    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select(".lab-board")
        .boundingClientRect((rect) => {
          const target = Array.isArray(rect) ? rect[0] : rect;
          if (!target || typeof target !== "object") {
            return;
          }

          const record = target as { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
          const left = asFiniteNumber(record.left);
          const top = asFiniteNumber(record.top);
          const width = asFiniteNumber(record.width);
          const height = asFiniteNumber(record.height);
          if (left === undefined || top === undefined || !width || !height) {
            return;
          }

          setBoardRect({ left, top, width, height });
        })
        .exec();
    });
  };

  useEffect(() => {
    const timer = setTimeout(updateBoardRect, 30);
    const onResize = () => updateBoardRect();
    const canListenResize =
      typeof Taro.onWindowResize === "function" && typeof Taro.offWindowResize === "function";

    if (canListenResize) {
      Taro.onWindowResize(onResize);
    }

    return () => {
      clearTimeout(timer);
      if (canListenResize) {
        Taro.offWindowResize(onResize);
      }
    };
  }, []);

  const appendLog = (message: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLogs((current) => [...current, `[${stamp}] ${message}`].slice(-60));
  };

  const ensureSession = async () => {
    if (accessToken && user) {
      setTokenAccessor(() => accessToken);
      return;
    }

    const login = await wechatLogin({
      code: SHARED_AUTH_CODE,
      username: SHARED_USERNAME,
      password: SHARED_PASSWORD
    });
    setSession(login.data);
    setTokenAccessor(() => login.data.accessToken);
  };

  const handleSelectAsset = async () => {
    if (!isH5()) {
      setErrorText("当前联调实验室仅支持 H5，请在浏览器中打开。");
      return;
    }

    setErrorText("");
    try {
      const file = await pickFileForH5();
      const fileName = file.name || "untitled.bin";
      const mediaType = detectMediaType(fileName, file.type || "");
      if (!mediaType) {
        setErrorText("不支持的文件类型，请选择 IMAGE/VIDEO/PDF/PPT");
        return;
      }

      const mimeType = file.type || guessMimeType(fileName, mediaType);
      const dimensions = await resolveAssetDimensions(file, mediaType);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = undefined;
      }

      const previewUrl = mediaType === "IMAGE" || mediaType === "VIDEO" ? URL.createObjectURL(file) : undefined;
      previewUrlRef.current = previewUrl;

      setAsset({
        file,
        fileName,
        fileSize: Math.max(file.size, 1),
        mimeType,
        mediaType,
        previewUrl,
        width: dimensions.width,
        height: dimensions.height
      });
      setRegions([]);
      setAnchorPoint(null);
      setTaskProgress(undefined);
      setLogs([]);
      setTimeout(updateBoardRect, 20);
    } catch (error) {
      if (error instanceof Error && error.message === "未选择文件") {
        return;
      }
      setErrorText("文件选择失败，请重试");
    }
  };

  const handleBoardTap = (event: unknown) => {
    if (!asset || !boardRect) {
      return;
    }

    const point = extractPointFromEvent(event, boardRect, {
      width: asset.width,
      height: asset.height
    });
    if (!point) {
      return;
    }

    if (!anchorPoint) {
      setAnchorPoint(point);
      setErrorText("");
      return;
    }

    const nextRegion = normalizeBox(anchorPoint, point);
    if (!nextRegion) {
      setErrorText("框选区域太小，请重新选择");
      setAnchorPoint(null);
      return;
    }

    setRegions((current) => [...current, nextRegion]);
    setAnchorPoint(null);
    setErrorText("");
  };

  const clearRegions = () => {
    setRegions([]);
    setAnchorPoint(null);
  };

  const removeRegion = (id: string) => {
    setRegions((current) => current.filter((region) => region.id !== id));
  };

  const handleRunPipeline = async () => {
    if (!asset) {
      setErrorText("请先选择一个素材");
      return;
    }
    if (!regions.length) {
      setErrorText("请先框选至少一个水印区域");
      return;
    }

    setRunning(true);
    setErrorText("");
    setTaskProgress(undefined);
    setLogs([]);

    try {
      await ensureSession();

      appendLog("1/5 获取上传策略");
      const uploadPolicy = await getUploadPolicy({
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        mediaType: toUploadPolicyType(asset.mediaType),
        mimeType: asset.mimeType
      });

      appendLog("2/5 上传文件到 MinIO");
      await uploadWithPresignedUrl(uploadPolicy.data.uploadUrl, uploadPolicy.data.headers, asset.file);

      appendLog("3/5 创建任务");
      const create = await createTask(
        {
          assetId: uploadPolicy.data.assetId,
          mediaType: asset.mediaType as TaskMediaType,
          taskPolicy: "FAST"
        },
        buildIdempotencyKey()
      );
      const taskId = create.data.taskId;
      setTaskProgress({
        taskId,
        status: create.data.status,
        progress: 0
      });

      appendLog("4/5 提交 regions");
      await upsertTaskRegions(
        taskId,
        {
          version: 0,
          mediaType: asset.mediaType as TaskMediaType,
          schemaVersion: "gemini-box-2d/v1",
          regions: toRegionPayload(asset.mediaType, regions)
        },
        buildIdempotencyKey()
      );

      appendLog("5/5 轮询任务状态");
      let lastStatus = "";
      for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
        const detail = await getTaskDetail(taskId);
        const status = detail.data.status;
        const progress = detail.data.progress || 0;
        setTaskProgress((current) => ({
          taskId,
          status,
          progress,
          errorCode: detail.data.errorCode,
          errorMessage: detail.data.errorMessage,
          resultUrl: current?.resultUrl,
          artifacts: current?.artifacts
        }));

        if (status !== lastStatus) {
          appendLog(`状态更新：${status} (${progress}%)`);
          lastStatus = status;
        }

        if (status === "SUCCEEDED") {
          const result = await getTaskResult(taskId);
          appendLog("任务成功，已拿到结果链接");
          setTaskProgress((current) => ({
            taskId,
            status,
            progress: 100,
            resultUrl: result.data.resultUrl,
            artifacts: result.data.artifacts || [],
            errorCode: current?.errorCode,
            errorMessage: current?.errorMessage
          }));
          return;
        }

        if (status === "FAILED" || status === "CANCELED") {
          setErrorText(`${detail.data.errorCode || "TASK_FAILED"} ${detail.data.errorMessage || status}`);
          appendLog(`任务终态：${status}`);
          return;
        }

        await sleep(POLL_INTERVAL_MS);
      }

      setErrorText("轮询超时：任务尚未在预期时间内结束");
      appendLog("轮询超时");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
        appendLog(`接口错误：${error.code}`);
      } else if (error instanceof Error) {
        setErrorText(error.message);
        appendLog("流程执行失败");
      } else {
        setErrorText("流程执行失败，请稍后重试");
        appendLog("流程执行失败");
      }
    } finally {
      setRunning(false);
    }
  };

  const regionPayloadPreview = useMemo(() => {
    if (!asset) {
      return "[]";
    }
    return JSON.stringify(toRegionPayload(asset.mediaType, regions), null, 2);
  }, [asset, regions]);

  const openResult = (url: string) => {
    if (isH5() && typeof window !== "undefined") {
      window.open(url, "_blank");
      return;
    }
    void Taro.setClipboardData({ data: url });
  };

  return (
    <PageShell title="联调实验室" subtitle="上传 + 框选 + 创建任务 + 提交 regions + 结果回读">
      <View className="lab-card">
        <Text className="lab-meta-label">当前 API</Text>
        <Text className="lab-meta-value">{API_BASE_URL}</Text>
      </View>

      <View className="lab-actions">
        <Button className="lab-btn-primary" onClick={handleSelectAsset}>
          选择 IMAGE / VIDEO / PDF / PPT
        </Button>
        <Button className="lab-btn-ghost" onClick={clearRegions} disabled={!regions.length && !anchorPoint}>
          清空框选
        </Button>
      </View>

      <View className="lab-card">
        <Text className="lab-meta-label">已选文件</Text>
        <Text className="lab-meta-value">
          {asset
            ? `${asset.fileName} | ${asset.mediaType} | ${formatBytes(asset.fileSize)} | ${asset.width}x${asset.height}`
            : "-"}
        </Text>
      </View>

      <View className="lab-board-wrap">
        <View className="lab-board-tip">
          <Text>框选方式：点击一次确定左上角，再点击一次确定右下角。VIDEO 默认写入 frameIndex=0，PDF/PPT 默认 pageIndex=0。</Text>
        </View>
        <View className="lab-board" onClick={handleBoardTap}>
          {asset?.mediaType === "IMAGE" && asset.previewUrl ? (
            <Image className="lab-media-preview" src={asset.previewUrl} mode="aspectFit" />
          ) : null}
          {asset?.mediaType === "VIDEO" && asset.previewUrl ? (
            <View className="lab-media-video">
              <Text className="lab-media-placeholder-title">VIDEO 预览模式</Text>
              <Text className="lab-media-placeholder-sub">{asset.fileName}</Text>
              <Text className="lab-media-placeholder-sub">框选将映射为 frameIndex=0</Text>
            </View>
          ) : null}
          {asset && (asset.mediaType === "PDF" || asset.mediaType === "PPT") ? (
            <View className="lab-media-doc">
              <Text className="lab-media-placeholder-title">{asset.mediaType} 文档模式</Text>
              <Text className="lab-media-placeholder-sub">{asset.fileName}</Text>
              <Text className="lab-media-placeholder-sub">框选将映射为 pageIndex=0</Text>
            </View>
          ) : null}
          {!asset ? (
            <View className="lab-media-empty">
              <Text>请先选择素材文件</Text>
            </View>
          ) : null}

          {asset
            ? regions.map((region, index) => (
                <View
                  key={region.id}
                  className="lab-region-box"
                  style={{
                    left: `${(region.left / asset.width) * 100}%`,
                    top: `${(region.top / asset.height) * 100}%`,
                    width: `${((region.right - region.left) / asset.width) * 100}%`,
                    height: `${((region.bottom - region.top) / asset.height) * 100}%`
                  }}
                >
                  <Text className="lab-region-tag">#{index + 1}</Text>
                  <View
                    className="lab-region-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeRegion(region.id);
                    }}
                  >
                    <Text>x</Text>
                  </View>
                </View>
              ))
            : null}
          {asset && anchorPoint ? (
            <View
              className="lab-anchor-point"
              style={{
                left: `${(anchorPoint[0] / asset.width) * 100}%`,
                top: `${(anchorPoint[1] / asset.height) * 100}%`
              }}
            />
          ) : null}
        </View>
      </View>

      <View className="lab-card">
        <Text className="lab-meta-label">regions 预览</Text>
        <Text className="lab-json">{regionPayloadPreview}</Text>
      </View>

      <View className="lab-actions">
        <Button className="lab-btn-primary" loading={running} onClick={handleRunPipeline}>
          开始完整链路测试
        </Button>
      </View>

      <View className="lab-card">
        <Text className="lab-meta-label">任务状态</Text>
        <Text className="lab-meta-value">
          {taskProgress
            ? `${taskProgress.taskId} | ${taskProgress.status} | ${taskProgress.progress}%`
            : "-"}
        </Text>
        {taskProgress?.resultUrl ? (
          <View className="lab-result-list">
            <Button className="lab-btn-ghost" onClick={() => openResult(taskProgress.resultUrl || "")}>
              打开主结果
            </Button>
            {taskProgress.artifacts?.map((artifact) => (
              <Button key={`${artifact.type}-${artifact.url}`} className="lab-btn-ghost" onClick={() => openResult(artifact.url)}>
                打开 {artifact.type}
              </Button>
            ))}
          </View>
        ) : null}
      </View>

      <View className="lab-card">
        <Text className="lab-meta-label">执行日志</Text>
        <View className="lab-log-list">
          {logs.length ? logs.map((line) => <Text key={line}>{line}</Text>) : <Text>尚未执行</Text>}
        </View>
      </View>

      {errorText ? (
        <View className="lab-error">
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
