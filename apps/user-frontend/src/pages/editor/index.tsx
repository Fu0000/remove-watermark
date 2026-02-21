import { useEffect, useMemo, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Picker, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { deleteAsset, getUploadPolicy } from "@/services/asset";
import { createTask, upsertTaskMask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import { useAuthStore } from "@/stores/auth.store";
import type { TaskStatus } from "@packages/contracts";
import "./index.scss";

const mediaOptions: Array<"IMAGE" | "VIDEO"> = ["IMAGE", "VIDEO"];

const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;

type MaskMode = "POLYGON" | "BRUSH";
type MaskPoint = [number, number];
type MaskPath = MaskPoint[];

interface MaskSnapshot {
  polygons: MaskPath[];
  brushStrokes: MaskPath[];
  draftPolygon: MaskPath;
}

interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function deepClonePath(path: MaskPath): MaskPath {
  return path.map(([x, y]) => [x, y]);
}

function deepClonePaths(paths: MaskPath[]): MaskPath[] {
  return paths.map((path) => deepClonePath(path));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function extractVersion(message: string) {
  const matched = message.match(/(\d+)/);
  if (!matched) {
    return undefined;
  }

  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function EditorPage() {
  const [agreement, setAgreement] = useState(false);
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [loading, setLoading] = useState(false);
  const [assetDeleting, setAssetDeleting] = useState(false);
  const [maskLoading, setMaskLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [maskVersion, setMaskVersion] = useState(0);
  const [maskId, setMaskId] = useState("");
  const [assetId, setAssetId] = useState("");

  const [mode, setMode] = useState<MaskMode>("POLYGON");
  const [polygons, setPolygons] = useState<MaskPath[]>([]);
  const [brushStrokes, setBrushStrokes] = useState<MaskPath[]>([]);
  const [draftPolygon, setDraftPolygon] = useState<MaskPath>([]);
  const [activeStroke, setActiveStroke] = useState<MaskPath>([]);
  const activeStrokeRef = useRef<MaskPath>([]);
  const [history, setHistory] = useState<MaskSnapshot[]>([]);
  const [future, setFuture] = useState<MaskSnapshot[]>([]);
  const [boardRect, setBoardRect] = useState<BoardRect | null>(null);

  const user = useAuthStore((state) => state.user);
  const { taskId, setTask } = useTaskStore();

  const snapshotCurrent = (): MaskSnapshot => ({
    polygons: deepClonePaths(polygons),
    brushStrokes: deepClonePaths(brushStrokes),
    draftPolygon: deepClonePath(draftPolygon)
  });

  const applySnapshot = (snapshot: MaskSnapshot) => {
    setPolygons(deepClonePaths(snapshot.polygons));
    setBrushStrokes(deepClonePaths(snapshot.brushStrokes));
    setDraftPolygon(deepClonePath(snapshot.draftPolygon));
    setActiveStroke([]);
    activeStrokeRef.current = [];
  };

  const commitSnapshot = (snapshot: MaskSnapshot) => {
    setHistory((previous) => [...previous, snapshotCurrent()].slice(-40));
    setFuture([]);
    applySnapshot(snapshot);
  };

  const refreshBoardRect = () => {
    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select(".mask-board")
        .boundingClientRect((rect) => {
          const rectValue = Array.isArray(rect) ? rect[0] : rect;
          if (!rectValue || typeof rectValue !== "object") {
            return;
          }

          const rectRecord = rectValue as {
            width?: unknown;
            height?: unknown;
            left?: unknown;
            top?: unknown;
          };

          const width = asFiniteNumber(rectRecord.width);
          const height = asFiniteNumber(rectRecord.height);
          const left = asFiniteNumber(rectRecord.left);
          const top = asFiniteNumber(rectRecord.top);

          if (!width || !height || left === undefined || top === undefined) {
            return;
          }

          setBoardRect({ left, top, width, height });
        })
        .exec();
    });
  };

  Taro.useDidShow(() => {
    refreshBoardRect();
  });

  useEffect(() => {
    const timer = setTimeout(refreshBoardRect, 20);
    const onResize = () => refreshBoardRect();
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

  const pointFromEvent = (event: unknown): MaskPoint | undefined => {
    if (!boardRect) {
      return undefined;
    }

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

    const normalizedX = Math.round((localX / boardRect.width) * IMAGE_WIDTH);
    const normalizedY = Math.round((localY / boardRect.height) * IMAGE_HEIGHT);

    return [normalizedX, normalizedY];
  };

  const handlePolygonTap = (event: unknown) => {
    if (mode !== "POLYGON") {
      return;
    }

    const point = pointFromEvent(event);
    if (!point) {
      return;
    }

    commitSnapshot({
      polygons: deepClonePaths(polygons),
      brushStrokes: deepClonePaths(brushStrokes),
      draftPolygon: [...deepClonePath(draftPolygon), point]
    });
  };

  const handleBoardTouchStart = (event: unknown) => {
    if (mode !== "BRUSH") {
      return;
    }

    const point = pointFromEvent(event);
    if (!point) {
      return;
    }

    activeStrokeRef.current = [point];
    setActiveStroke([point]);
  };

  const handleBoardTouchMove = (event: unknown) => {
    if (mode !== "BRUSH") {
      return;
    }

    if (!activeStrokeRef.current.length) {
      return;
    }

    const point = pointFromEvent(event);
    if (!point) {
      return;
    }

    activeStrokeRef.current = [...activeStrokeRef.current, point];
    setActiveStroke([...activeStrokeRef.current]);
  };

  const handleBoardTouchEnd = () => {
    if (mode !== "BRUSH") {
      return;
    }

    if (activeStrokeRef.current.length < 2) {
      setActiveStroke([]);
      activeStrokeRef.current = [];
      return;
    }

    commitSnapshot({
      polygons: deepClonePaths(polygons),
      brushStrokes: [...deepClonePaths(brushStrokes), deepClonePath(activeStrokeRef.current)],
      draftPolygon: deepClonePath(draftPolygon)
    });

    setActiveStroke([]);
    activeStrokeRef.current = [];
  };

  const handleClosePolygon = () => {
    if (draftPolygon.length < 3) {
      setErrorText("多边形至少需要 3 个点才能闭合");
      return;
    }

    setErrorText("");
    commitSnapshot({
      polygons: [...deepClonePaths(polygons), deepClonePath(draftPolygon)],
      brushStrokes: deepClonePaths(brushStrokes),
      draftPolygon: []
    });
  };

  const handleClearMask = () => {
    commitSnapshot({
      polygons: [],
      brushStrokes: [],
      draftPolygon: []
    });
  };

  const handleUndo = () => {
    if (!history.length) {
      return;
    }

    const previous = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setFuture([snapshotCurrent(), ...future].slice(0, 40));
    applySnapshot(previous);
  };

  const handleRedo = () => {
    if (!future.length) {
      return;
    }

    const next = future[0];
    setFuture(future.slice(1));
    setHistory([...history, snapshotCurrent()].slice(-40));
    applySnapshot(next);
  };

  const submitPolygons = useMemo(() => {
    if (draftPolygon.length >= 3) {
      return [...polygons, draftPolygon];
    }

    return polygons;
  }, [polygons, draftPolygon]);

  const hasMaskData = submitPolygons.length > 0 || brushStrokes.length > 0;

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
      setAssetId(uploadPolicy.data.assetId);

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

  const handleDeleteAsset = async () => {
    if (!assetId) {
      setErrorText("当前没有可删除的素材");
      return;
    }

    setAssetDeleting(true);
    setErrorText("");
    try {
      await deleteAsset(assetId, buildIdempotencyKey());
      setAssetId("");
      Taro.showToast({
        title: "素材已删除",
        icon: "success"
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("素材删除失败，请稍后重试");
      }
    } finally {
      setAssetDeleting(false);
    }
  };

  const handleSubmitMask = async () => {
    if (!taskId) {
      setErrorText("请先创建任务再提交蒙版");
      return;
    }

    if (!hasMaskData) {
      setErrorText("请先绘制蒙版后再提交");
      return;
    }

    setMaskLoading(true);
    setErrorText("");
    try {
      const response = await upsertTaskMask(
        taskId,
        {
          imageWidth: IMAGE_WIDTH,
          imageHeight: IMAGE_HEIGHT,
          polygons: submitPolygons,
          brushStrokes,
          version: maskVersion
        },
        buildIdempotencyKey()
      );

      setMaskVersion(response.data.version);
      setMaskId(response.data.maskId);
      Taro.switchTab({ url: "/pages/tasks/index" });
    } catch (error) {
      if (error instanceof ApiError && error.code === 40901) {
        const latest = extractVersion(error.message);
        if (latest !== undefined) {
          setMaskVersion(latest);
          setErrorText(`蒙版版本冲突，已同步到 v${latest}，请再次提交。`);
        } else {
          setErrorText(`${error.code} ${error.message}`);
        }
      } else if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("蒙版提交失败，请稍后重试");
      }
    } finally {
      setMaskLoading(false);
    }
  };

  return (
    <PageShell title="上传与编辑" subtitle="支持真实蒙版绘制、撤销重做、版本冲突处理">
      <View className="editor-section">
        <Text>上传前请确认素材权属授权。</Text>
      </View>
      <View className="editor-section">
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
      <View className="editor-section">
        <Button onClick={() => setAgreement((value) => !value)}>
          {agreement ? "已勾选授权声明" : "勾选授权声明"}
        </Button>
      </View>
      <View className="editor-section">
        <Button type="primary" loading={loading} onClick={handleCreateTask}>
          申请上传策略并创建任务（步骤 1）
        </Button>
      </View>
      <View className="editor-section">
        <Text>当前 assetId：{assetId || "-"}</Text>
      </View>
      <View className="editor-section">
        <Button loading={assetDeleting} disabled={!assetId} onClick={handleDeleteAsset}>
          删除当前素材（FR-010）
        </Button>
      </View>

      <View className="editor-section">
        <Text>蒙版模式：</Text>
      </View>
      <View className="mask-toolbar">
        <View className="mask-toolbar-item">
          <Button type={mode === "POLYGON" ? "primary" : "default"} onClick={() => setMode("POLYGON")}>多边形</Button>
        </View>
        <View className="mask-toolbar-item">
          <Button type={mode === "BRUSH" ? "primary" : "default"} onClick={() => setMode("BRUSH")}>画笔</Button>
        </View>
        <View className="mask-toolbar-item">
          <Button onClick={handleClosePolygon} disabled={draftPolygon.length < 3}>闭合多边形</Button>
        </View>
        <View className="mask-toolbar-item">
          <Button onClick={handleUndo} disabled={!history.length}>撤销</Button>
        </View>
        <View className="mask-toolbar-item">
          <Button onClick={handleRedo} disabled={!future.length}>重做</Button>
        </View>
        <View className="mask-toolbar-item">
          <Button onClick={handleClearMask} disabled={!hasMaskData && draftPolygon.length === 0}>清空</Button>
        </View>
      </View>

      <View className="editor-section">
        <View
          className="mask-board"
          onClick={handlePolygonTap}
          onTouchStart={handleBoardTouchStart}
          onTouchMove={handleBoardTouchMove}
          onTouchEnd={handleBoardTouchEnd}
        >
          <View className="mask-board-tip">
            <Text>{mode === "POLYGON" ? "点击添加点，完成后点击“闭合多边形”" : "按住拖动进行画笔绘制"}</Text>
          </View>
          {submitPolygons.map((polygon, polygonIndex) =>
            polygon.map((point, pointIndex) => (
              <View
                key={`poly-${polygonIndex}-${pointIndex}-${point[0]}-${point[1]}`}
                className="mask-point mask-point-polygon"
                style={{
                  left: `${(point[0] / IMAGE_WIDTH) * 100}%`,
                  top: `${(point[1] / IMAGE_HEIGHT) * 100}%`
                }}
              />
            ))
          )}
          {draftPolygon.map((point, pointIndex) => (
            <View
              key={`draft-${pointIndex}-${point[0]}-${point[1]}`}
              className="mask-point mask-point-draft"
              style={{
                left: `${(point[0] / IMAGE_WIDTH) * 100}%`,
                top: `${(point[1] / IMAGE_HEIGHT) * 100}%`
              }}
            />
          ))}
          {brushStrokes.map((stroke, strokeIndex) =>
            stroke.filter((_, pointIndex) => pointIndex % 2 === 0).map((point, pointIndex) => (
              <View
                key={`stroke-${strokeIndex}-${pointIndex}-${point[0]}-${point[1]}`}
                className="mask-point mask-point-brush"
                style={{
                  left: `${(point[0] / IMAGE_WIDTH) * 100}%`,
                  top: `${(point[1] / IMAGE_HEIGHT) * 100}%`
                }}
              />
            ))
          )}
          {activeStroke.filter((_, pointIndex) => pointIndex % 2 === 0).map((point, pointIndex) => (
            <View
              key={`active-${pointIndex}-${point[0]}-${point[1]}`}
              className="mask-point mask-point-active"
              style={{
                left: `${(point[0] / IMAGE_WIDTH) * 100}%`,
                top: `${(point[1] / IMAGE_HEIGHT) * 100}%`
              }}
            />
          ))}
        </View>
      </View>

      <View className="editor-section">
        <Text>
          蒙版统计：polygons={submitPolygons.length}（draft={draftPolygon.length} 点） / brushStrokes={brushStrokes.length}
        </Text>
      </View>
      <View className="editor-section">
        <Button type="primary" loading={maskLoading} onClick={handleSubmitMask}>
          提交蒙版并进入任务中心（步骤 2）
        </Button>
      </View>
      <View className="editor-section">
        <Text>当前 taskId：{taskId || "-"}</Text>
      </View>
      <View className="editor-section">
        <Text>maskId/version：{maskId ? `${maskId} / v${maskVersion}` : `- / v${maskVersion}`}</Text>
      </View>
      {errorText ? (
        <View className="editor-section">
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
