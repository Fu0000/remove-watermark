import { useEffect, useMemo, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { getUploadPolicy } from "@/services/asset";
import { createTask, upsertTaskMask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import { useAuthStore } from "@/stores/auth.store";
import { useMediaStore } from "@/stores/media.store";
import type { TaskStatus } from "@packages/contracts";
import "./index.scss";

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

export default function EditorPage() {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [mode, setMode] = useState<MaskMode>("BRUSH");
  const [polygons, setPolygons] = useState<MaskPath[]>([]);
  const [brushStrokes, setBrushStrokes] = useState<MaskPath[]>([]);
  const [draftPolygon, setDraftPolygon] = useState<MaskPath>([]);
  const [activeStroke, setActiveStroke] = useState<MaskPath>([]);
  const activeStrokeRef = useRef<MaskPath>([]);
  const [history, setHistory] = useState<MaskSnapshot[]>([]);
  const [future, setFuture] = useState<MaskSnapshot[]>([]);
  const [boardRect, setBoardRect] = useState<BoardRect | null>(null);

  const user = useAuthStore((state: any) => state.user);
  const { setTask } = useTaskStore();

  // Connect to the new Media store
  const { selectedMedia, mediaType } = useMediaStore();

  useEffect(() => {
    // Return to home if no media selected
    if (!selectedMedia) {
      Taro.showToast({ title: "请先选择媒体文件", icon: "none" });
      setTimeout(() => Taro.navigateBack(), 1000);
    }
  }, [selectedMedia]);

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
        .boundingClientRect((rect: any) => {
          const rectValue = Array.isArray(rect) ? rect[0] : rect;
          if (!rectValue || typeof rectValue !== "object") return;
          const rectRecord = rectValue as Record<string, unknown>;
          const width = asFiniteNumber(rectRecord.width);
          const height = asFiniteNumber(rectRecord.height);
          const left = asFiniteNumber(rectRecord.left);
          const top = asFiniteNumber(rectRecord.top);

          if (!width || !height || left === undefined || top === undefined) return;
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
    const canListenResize = typeof Taro.onWindowResize === "function" && typeof Taro.offWindowResize === "function";
    if (canListenResize) Taro.onWindowResize(onResize);
    return () => {
      clearTimeout(timer);
      if (canListenResize) Taro.offWindowResize(onResize);
    };
  }, []);

  const pointFromEvent = (event: unknown): MaskPoint | undefined => {
    if (!boardRect) return undefined;
    const record = event as { touches?: any[]; changedTouches?: any[]; detail?: any };
    const touched = record.touches?.[0] || record.changedTouches?.[0];
    const rawX = asFiniteNumber(touched?.x) ?? asFiniteNumber(touched?.clientX) ?? asFiniteNumber(touched?.pageX) ?? asFiniteNumber(record.detail?.x) ?? asFiniteNumber(record.detail?.clientX);
    const rawY = asFiniteNumber(touched?.y) ?? asFiniteNumber(touched?.clientY) ?? asFiniteNumber(touched?.pageY) ?? asFiniteNumber(record.detail?.y) ?? asFiniteNumber(record.detail?.clientY);
    if (rawX === undefined || rawY === undefined) return undefined;

    const localX = clamp(rawX - boardRect.left, 0, boardRect.width);
    const localY = clamp(rawY - boardRect.top, 0, boardRect.height);
    const normalizedX = Math.round((localX / boardRect.width) * IMAGE_WIDTH);
    const normalizedY = Math.round((localY / boardRect.height) * IMAGE_HEIGHT);
    return [normalizedX, normalizedY];
  };

  const handlePolygonTap = (event: unknown) => {
    if (mode !== "POLYGON") return;
    const point = pointFromEvent(event);
    if (!point) return;
    commitSnapshot({
      polygons: deepClonePaths(polygons),
      brushStrokes: deepClonePaths(brushStrokes),
      draftPolygon: [...deepClonePath(draftPolygon), point]
    });
  };

  const handleBoardTouchStart = (event: unknown) => {
    if (mode !== "BRUSH") return;
    const point = pointFromEvent(event);
    if (!point) return;
    activeStrokeRef.current = [point];
    setActiveStroke([point]);
  };

  const handleBoardTouchMove = (event: unknown) => {
    if (mode !== "BRUSH" || !activeStrokeRef.current.length) return;
    const point = pointFromEvent(event);
    if (!point) return;
    activeStrokeRef.current = [...activeStrokeRef.current, point];
    setActiveStroke([...activeStrokeRef.current]);
  };

  const handleBoardTouchEnd = () => {
    if (mode !== "BRUSH") return;
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
      setErrorText("提示：多边形至少需要 3 个点才能闭合");
      setTimeout(() => setErrorText(""), 2000);
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
    commitSnapshot({ polygons: [], brushStrokes: [], draftPolygon: [] });
  };

  const handleUndo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setFuture([snapshotCurrent(), ...future].slice(0, 40));
    applySnapshot(previous);
  };

  const handleRedo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture(future.slice(1));
    setHistory([...history, snapshotCurrent()].slice(-40));
    applySnapshot(next);
  };

  const submitPolygons = useMemo(() => {
    if (draftPolygon.length >= 3) return [...polygons, draftPolygon];
    return polygons;
  }, [polygons, draftPolygon]);

  const hasMaskData = submitPolygons.length > 0 || brushStrokes.length > 0;

  // ====核心集成动作：一键消除====
  const handleStartErase = async () => {
    if (!user) {
      setErrorText("登录状态失效，请返回重新连接");
      return;
    }
    if (!selectedMedia) {
      setErrorText("未找到待处理文件缓存");
      return;
    }
    if (!hasMaskData) {
      setErrorText("请在画面上圈择要擦除的水印区域");
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      // 1. Get upload policy (in a real app, you'd upload the local file here to COS)
      const uploadPolicy = await getUploadPolicy({
        fileName: selectedMedia.fileName,
        fileSize: selectedMedia.fileSize,
        mediaType: mediaType === "IMAGE" ? "image" : "video",
        mimeType: selectedMedia.mimeType
      });
      const assetId = uploadPolicy.data.assetId;

      // 2. Create orchestration task
      const task = await createTask(
        { assetId, mediaType, taskPolicy: "FAST" },
        buildIdempotencyKey()
      );
      const newTaskId = task.data.taskId;

      // Update global store
      setTask(newTaskId, task.data.status as TaskStatus);

      // 3. Submit drawn masks
      await upsertTaskMask(
        newTaskId,
        {
          imageWidth: IMAGE_WIDTH,
          imageHeight: IMAGE_HEIGHT,
          polygons: submitPolygons,
          brushStrokes,
          version: 0
        },
        buildIdempotencyKey()
      );

      // Successfully processed all atomic steps, now entering monitoring state
      Taro.switchTab({ url: "/pages/tasks/index" });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`[网络请求错误] ${error.code} ${error.message}`);
      } else {
        setErrorText("处理启动异常，请检查网络后重试");
      }
      setLoading(false);
    }
  };

  if (!selectedMedia) {
    return <PageShell title="超纯净去水印" subtitle="读取媒体流失败..." />;
  }

  return (
    <PageShell title="智能消除工作台" subtitle={`已加载: ${selectedMedia.fileName}`}>

      {/* 极简顶栏工具集 */}
      <View className="editor-nav-pills animate-fade-in">
        <View className="editor-pill-group">
          <Button className={`editor-pill ${mode === "BRUSH" ? "editor-pill-active" : ""}`} onClick={() => setMode("BRUSH")}>🖌️ 手绘涂抹</Button>
          <Button className={`editor-pill ${mode === "POLYGON" ? "editor-pill-active" : ""}`} onClick={() => setMode("POLYGON")}>⬡ 多边套索</Button>
        </View>
        <View className="editor-pill-group">
          <Button className="editor-pill" onClick={handleUndo} disabled={!history.length}>↩️ 撤回</Button>
          <Button className="editor-pill" onClick={handleRedo} disabled={!future.length}>↪️ 重做</Button>
          <Button className="editor-pill" onClick={handleClearMask} disabled={!hasMaskData && draftPolygon.length === 0}>🗑️ 清除</Button>
        </View>
      </View>

      {/* 当处于多边形模式下，且存在顶点，给出闭合提示 */}
      {mode === "POLYGON" && draftPolygon.length > 0 && (
        <View className="editor-tip-float">
          <Button className="editor-tip-btn" onClick={handleClosePolygon}>点此闭合当前多边形</Button>
        </View>
      )}

      {/* 主力暗黑画板 */}
      <View className="editor-workspace">
        <View
          className="mask-board"
          onClick={handlePolygonTap}
          onTouchStart={handleBoardTouchStart}
          onTouchMove={handleBoardTouchMove}
          onTouchEnd={handleBoardTouchEnd}
          style={selectedMedia.sourcePath ? { backgroundImage: `url(${selectedMedia.sourcePath})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {}}
        >
          {/* 画板绘制点位阵列 */}
          {submitPolygons.map((polygon, polygonIndex) =>
            polygon.map((point, pointIndex) => (
              <View
                key={`poly-${polygonIndex}-${pointIndex}-${point[0]}-${point[1]}`}
                className="mask-point mask-point-polygon"
                style={{ left: `${(point[0] / IMAGE_WIDTH) * 100}%`, top: `${(point[1] / IMAGE_HEIGHT) * 100}%` }}
              />
            ))
          )}
          {draftPolygon.map((point, pointIndex) => (
            <View
              key={`draft-${pointIndex}-${point[0]}-${point[1]}`}
              className="mask-point mask-point-draft"
              style={{ left: `${(point[0] / IMAGE_WIDTH) * 100}%`, top: `${(point[1] / IMAGE_HEIGHT) * 100}%` }}
            />
          ))}
          {brushStrokes.map((stroke, strokeIndex) =>
            stroke.filter((_, pointIndex) => pointIndex % 2 === 0).map((point, pointIndex) => (
              <View
                key={`stroke-${strokeIndex}-${pointIndex}-${point[0]}-${point[1]}`}
                className="mask-point mask-point-brush"
                style={{ left: `${(point[0] / IMAGE_WIDTH) * 100}%`, top: `${(point[1] / IMAGE_HEIGHT) * 100}%` }}
              />
            ))
          )}
          {activeStroke.filter((_, pointIndex) => pointIndex % 2 === 0).map((point, pointIndex) => (
            <View
              key={`active-${pointIndex}-${point[0]}-${point[1]}`}
              className="mask-point mask-point-active"
              style={{ left: `${(point[0] / IMAGE_WIDTH) * 100}%`, top: `${(point[1] / IMAGE_HEIGHT) * 100}%` }}
            />
          ))}
        </View>
      </View>

      {/* 报错小横幅 */}
      {errorText && (
        <View className="editor-error-banner animate-slide-up">
          <Text>{errorText}</Text>
        </View>
      )}

      {/* 底部悬浮核心一键执行 Button */}
      <View className="editor-bottom-bar animate-slide-up" style={{ animationDelay: "0.2s" }}>
        <Button
          className={`editor-start-btn ${!hasMaskData ? 'editor-start-btn-disabled' : ''}`}
          loading={loading}
          onClick={handleStartErase}
        >
          开始智能抹除 ✨
        </Button>
      </View>

    </PageShell>
  );
}
