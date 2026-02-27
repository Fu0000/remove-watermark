import { useEffect, useMemo, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { getUploadPolicy, uploadFileToCOS } from "@/services/asset";
import { createTask, upsertTaskMask } from "@/services/task";
import { ApiError } from "@/services/http";
import { buildIdempotencyKey } from "@/utils/idempotency";
import { useTaskStore } from "@/stores/task.store";
import { useAuthStore } from "@/stores/auth.store";
import { useMediaStore } from "@/stores/media.store";
import type { TaskStatus } from "@packages/contracts";
import "./index.scss";

const DEFAULT_IMAGE_WIDTH = 1920;
const DEFAULT_IMAGE_HEIGHT = 1080;

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
  const { selectedMedia: _selectedMedia, mediaType: _mediaType, setMedia } = useMediaStore();

  // DEV ONLY: ?mock=1 injects a placeholder image so layout can be verified without backend
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mock') === '1' && !_selectedMedia) {
        setMedia('IMAGE', {
          sourcePath: 'https://picsum.photos/seed/watermark/800/600',
          fileName: 'test-watermark.jpg',
          fileSize: 102400,
          mimeType: 'image/jpeg',
          imageWidth: 800,
          imageHeight: 600,
        });
      }
    }
  }, []);

  const selectedMedia = _selectedMedia;
  const mediaType = _mediaType;

  // Use actual image dimensions from store, or fall back to defaults
  const IMAGE_WIDTH = selectedMedia?.imageWidth || DEFAULT_IMAGE_WIDTH;
  const IMAGE_HEIGHT = selectedMedia?.imageHeight || DEFAULT_IMAGE_HEIGHT;




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
    if (typeof user.quotaLeft === "number" && user.quotaLeft <= 0) {
      setErrorText("当前配额已用完，请升级套餐后再继续");
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
      // 1. Get upload policy
      const uploadPolicy = await getUploadPolicy({
        fileName: selectedMedia.fileName,
        fileSize: selectedMedia.fileSize,
        mediaType: mediaType === "IMAGE" ? "image" : "video",
        mimeType: selectedMedia.mimeType
      });
      const assetId = uploadPolicy.data.assetId;

      // 2. Actually upload file bytes to COS/MinIO
      const fileOrPath = selectedMedia.file || selectedMedia.sourcePath;
      await uploadFileToCOS(
        uploadPolicy.data.uploadUrl,
        uploadPolicy.data.headers,
        fileOrPath
      );

      // 3. Create orchestration task
      const task = await createTask(
        { assetId, mediaType, taskPolicy: "FAST" },
        buildIdempotencyKey()
      );
      const newTaskId = task.data.taskId;

      // Update global store
      setTask(newTaskId, task.data.status as TaskStatus);

      // 4. Submit drawn masks
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
    return (
      <PageShell title="智能消除工作台" subtitle="请先选择文件">
        <View className="editor-empty-state">
          <Text style={{ fontSize: "64px" }}>📂</Text>
          <Text style={{ fontSize: "16px", fontWeight: "600", color: "var(--rw-text, #1e293b)", marginTop: "16px" }}>未检测到待处理文件</Text>
          <Text style={{ fontSize: "13px", color: "var(--rw-text-secondary, #64748b)", marginTop: "8px" }}>请从首页选择图片或视频后进入编辑</Text>
          <Button
            style={{ marginTop: "24px", background: "var(--rw-accent-gradient, linear-gradient(135deg, #3b82f6, #8b5cf6))", color: "#fff", border: "none", borderRadius: "44px", height: "44px", width: "200px", fontSize: "15px", fontWeight: "600" }}
            onClick={() => Taro.switchTab({ url: "/pages/home/index" })}
          >返回首页</Button>
        </View>
      </PageShell>
    );
  }

  return (
    <PageShell title="智能消除工作台" subtitle={`${mediaType === "VIDEO" ? "🎬 视频" : "🖼️ 图片"} · ${selectedMedia.fileName}`}>

      {/* 极简顶栏工具集 */}
      <View className="editor-nav-pills animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
        <View className="editor-pill-group" style={{ display: 'flex', gap: '8px' }}>
          <View
            className={`editor-pill ${mode === "BRUSH" ? "editor-pill-active" : ""}`}
            onClick={() => setMode("BRUSH")}
            style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '14px', background: mode === "BRUSH" ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'transparent', color: mode === "BRUSH" ? '#fff' : '#64748b' }}
          >🖌️ 手绘涂抹</View>
          <View
            className={`editor-pill ${mode === "POLYGON" ? "editor-pill-active" : ""}`}
            onClick={() => setMode("POLYGON")}
            style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '14px', background: mode === "POLYGON" ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'transparent', color: mode === "POLYGON" ? '#fff' : '#64748b' }}
          >⬡ 多边套索</View>
        </View>
        <View className="editor-pill-group" style={{ display: 'flex', gap: '8px' }}>
          <View
            className="editor-pill"
            onClick={history.length ? handleUndo : undefined}
            style={{ padding: '8px 12px', borderRadius: '20px', fontSize: '14px', opacity: history.length ? 1 : 0.4 }}
          >↩️ 撤回</View>
          <View
            className="editor-pill"
            onClick={future.length ? handleRedo : undefined}
            style={{ padding: '8px 12px', borderRadius: '20px', fontSize: '14px', opacity: future.length ? 1 : 0.4 }}
          >↪️ 重做</View>
          <View
            className="editor-pill"
            onClick={(hasMaskData || draftPolygon.length > 0) ? handleClearMask : undefined}
            style={{ padding: '8px 12px', borderRadius: '20px', fontSize: '14px', opacity: (hasMaskData || draftPolygon.length > 0) ? 1 : 0.4 }}
          >🗑️ 清除</View>
        </View>
      </View>

      {/* 当处于多边形模式下，且存在顶点，给出闭合提示 */}
      {mode === "POLYGON" && draftPolygon.length > 0 && (
        <View className="editor-tip-float">
          <Button className="editor-tip-btn" onClick={handleClosePolygon}>点此闭合当前多边形</Button>
        </View>
      )}

      {/* 主力暗黑画板 */}
      <View
        className="editor-workspace"
        style={{
          width: '100%',
          height: 'calc(100vh - 220px)', // 留出顶栏(~120px) + 底部按钮栏(~100px) 的空间
          minHeight: '300px',
          background: '#0f172a',
          borderRadius: '16px',
          overflow: 'hidden',
          marginTop: '12px',
          marginBottom: '80px', // 底部按钮 position:fixed 需要留出 margin
        }}
      >
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
      <View className="editor-bottom-bar animate-slide-up" style={{ animationDelay: "0.2s", padding: '16px', position: 'fixed', bottom: 0, left: 0, width: '100%', boxSizing: 'border-box', background: 'linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.7) 50%, transparent 100%)' }}>
        <View
          className={`editor-start-btn ${!hasMaskData ? 'editor-start-btn-disabled' : ''}`}
          onClick={!loading && hasMaskData ? handleStartErase : undefined}
          style={{
            width: '100%',
            height: '52px',
            borderRadius: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '17px',
            fontWeight: 'bold',
            background: hasMaskData ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(100, 116, 139, 0.3)',
            color: hasMaskData ? '#fff' : 'rgba(255, 255, 255, 0.4)',
            boxShadow: hasMaskData ? '0 4px 20px rgba(59, 130, 246, 0.5)' : 'none',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "处理中..." : "开始智能抹除 ✨"}
        </View>
      </View>

    </PageShell>
  );
}
