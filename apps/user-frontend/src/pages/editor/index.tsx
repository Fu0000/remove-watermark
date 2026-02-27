import { useEffect, useRef, useState } from "react";
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

// 角手柄名称
type HandleKey = "TL" | "TR" | "BL" | "BR";
type MaskMode = "RECTANGLE" | "BRUSH";
type MaskPoint = [number, number];
type MaskPath = MaskPoint[];

// 内部矩形结构（存储归一化坐标）
interface Rect {
  x1: number; y1: number; x2: number; y2: number;
}

interface MaskSnapshot {
  rects: Rect[];
  brushStrokes: MaskPath[];
}

interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 拖拽状态
type DragAction =
  | { type: "draw"; startPt: MaskPoint }
  | { type: "move"; rectIdx: number; prevRect: Rect; startPt: MaskPoint }
  | { type: "resize"; rectIdx: number; prevRect: Rect; handle: HandleKey; startPt: MaskPoint };

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function asNum(v: unknown): number | undefined {
  const n = Number(v); return Number.isFinite(n) ? n : undefined;
}
function ptInsideRect(pt: MaskPoint, r: Rect, pad = 0): boolean {
  return pt[0] >= r.x1 - pad && pt[0] <= r.x2 + pad && pt[1] >= r.y1 - pad && pt[1] <= r.y2 + pad;
}
function normalizeRect(r: Rect): Rect {
  return { x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2), x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2) };
}
function rectToPolygon(r: Rect): MaskPath {
  return [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]];
}

// Handle radius in image space units
const HANDLE_R = 40;

function getHandleCenter(r: Rect, h: HandleKey): MaskPoint {
  switch (h) {
    case "TL": return [r.x1, r.y1];
    case "TR": return [r.x2, r.y1];
    case "BL": return [r.x1, r.y2];
    case "BR": return [r.x2, r.y2];
  }
}

function hitHandle(pt: MaskPoint, r: Rect): HandleKey | null {
  const handles: HandleKey[] = ["TL", "TR", "BL", "BR"];
  for (const h of handles) {
    const [hx, hy] = getHandleCenter(r, h);
    if (Math.abs(pt[0] - hx) < HANDLE_R && Math.abs(pt[1] - hy) < HANDLE_R) return h;
  }
  return null;
}

function applyResize(original: Rect, handle: HandleKey, dx: number, dy: number, W: number, H: number): Rect {
  let { x1, y1, x2, y2 } = original;
  if (handle === "TL") { x1 = clamp(x1 + dx, 0, x2 - 10); y1 = clamp(y1 + dy, 0, y2 - 10); }
  if (handle === "TR") { x2 = clamp(x2 + dx, x1 + 10, W); y1 = clamp(y1 + dy, 0, y2 - 10); }
  if (handle === "BL") { x1 = clamp(x1 + dx, 0, x2 - 10); y2 = clamp(y2 + dy, y1 + 10, H); }
  if (handle === "BR") { x2 = clamp(x2 + dx, x1 + 10, W); y2 = clamp(y2 + dy, y1 + 10, H); }
  return { x1, y1, x2, y2 };
}

export default function EditorPage() {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [mode, setMode] = useState<MaskMode>("BRUSH");
  const [rects, setRects] = useState<Rect[]>([]);
  const [brushStrokes, setBrushStrokes] = useState<MaskPath[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // ongoing drag/draw preview (not yet committed)
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);

  const [activeStroke, setActiveStroke] = useState<MaskPath>([]);
  const activeStrokeRef = useRef<MaskPath>([]);
  const dragRef = useRef<DragAction | null>(null);

  const [history, setHistory] = useState<MaskSnapshot[]>([]);
  const [future, setFuture] = useState<MaskSnapshot[]>([]);
  const [boardRect, setBoardRect] = useState<BoardRect | null>(null);

  const user = useAuthStore((state: any) => state.user);
  const { setTask } = useTaskStore();
  const { selectedMedia: _selectedMedia, mediaType: _mediaType, setMedia } = useMediaStore();

  // DEV: mock=1
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mock") === "1" && !_selectedMedia) {
        setMedia("IMAGE", {
          sourcePath: "https://picsum.photos/seed/watermark/800/600",
          fileName: "test-watermark.jpg",
          fileSize: 102400,
          mimeType: "image/jpeg",
          imageWidth: 800,
          imageHeight: 600,
        });
      }
    }
  }, []);

  const selectedMedia = _selectedMedia;
  const mediaType = _mediaType;
  const IMAGE_WIDTH = selectedMedia?.imageWidth || DEFAULT_IMAGE_WIDTH;
  const IMAGE_HEIGHT = selectedMedia?.imageHeight || DEFAULT_IMAGE_HEIGHT;

  // ── undo/redo ──
  const snapshotNow = (): MaskSnapshot => ({
    rects: rects.map(r => ({ ...r })),
    brushStrokes: brushStrokes.map(s => s.map(([x, y]) => [x, y])),
  });

  const applySnapshot = (snap: MaskSnapshot) => {
    setRects(snap.rects.map(r => ({ ...r })));
    setBrushStrokes(snap.brushStrokes.map(s => s.map(([x, y]) => [x, y])));
    setPreviewRect(null);
    dragRef.current = null;
    setActiveStroke([]);
    activeStrokeRef.current = [];
    setSelectedIdx(null);
  };

  const commit = (snap: MaskSnapshot) => {
    setHistory(h => [...h, snapshotNow()].slice(-40));
    setFuture([]);
    applySnapshot(snap);
  };

  // ── board rect ──
  const refreshBoardRect = () => {
    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select(".mask-board")
        .boundingClientRect((rect: any) => {
          const rv = Array.isArray(rect) ? rect[0] : rect;
          if (!rv || typeof rv !== "object") return;
          const r = rv as Record<string, unknown>;
          const w = asNum(r.width), h = asNum(r.height), l = asNum(r.left), t = asNum(r.top);
          if (!w || !h || l === undefined || t === undefined) return;
          setBoardRect({ left: l, top: t, width: w, height: h });
        })
        .exec();
    });
  };

  Taro.useDidShow(() => refreshBoardRect());
  useEffect(() => {
    const tm = setTimeout(refreshBoardRect, 20);
    const onR = () => refreshBoardRect();
    const ok = typeof Taro.onWindowResize === "function";
    if (ok) Taro.onWindowResize(onR);
    return () => { clearTimeout(tm); if (ok) Taro.offWindowResize(onR); };
  }, []);

  // ── coordinate helpers ──
  const pointFromEvent = (event: unknown): MaskPoint | undefined => {
    if (!boardRect) return undefined;
    const ev = event as any;
    const touch = ev.touches?.[0] || ev.changedTouches?.[0];
    const rx = asNum(touch?.clientX) ?? asNum(touch?.x) ?? asNum(ev.clientX) ?? asNum(ev.detail?.clientX);
    const ry = asNum(touch?.clientY) ?? asNum(touch?.y) ?? asNum(ev.clientY) ?? asNum(ev.detail?.clientY);
    if (rx === undefined || ry === undefined) return undefined;
    const lx = clamp(rx - boardRect.left, 0, boardRect.width);
    const ly = clamp(ry - boardRect.top, 0, boardRect.height);
    return [
      Math.round((lx / boardRect.width) * IMAGE_WIDTH),
      Math.round((ly / boardRect.height) * IMAGE_HEIGHT),
    ];
  };

  // ── pointer down ──
  const handlePointerDown = (event: unknown) => {
    const pt = pointFromEvent(event);
    if (!pt) return;

    if (mode === "BRUSH") {
      setSelectedIdx(null);
      activeStrokeRef.current = [pt];
      setActiveStroke([pt]);
      return;
    }

    // RECTANGLE mode: hit-test handles of selected rect first
    if (selectedIdx !== null && selectedIdx < rects.length) {
      const selRect = rects[selectedIdx];
      const h = hitHandle(pt, selRect);
      if (h) {
        dragRef.current = { type: "resize", rectIdx: selectedIdx, prevRect: { ...selRect }, handle: h, startPt: pt };
        setPreviewRect({ ...selRect });
        return;
      }
      // inside selected rect → move
      if (ptInsideRect(pt, selRect, HANDLE_R / 2)) {
        dragRef.current = { type: "move", rectIdx: selectedIdx, prevRect: { ...selRect }, startPt: pt };
        setPreviewRect({ ...selRect });
        return;
      }
    }

    // Check if clicking any other rect (select it)
    for (let i = rects.length - 1; i >= 0; i--) {
      if (i === selectedIdx) continue;
      if (ptInsideRect(pt, rects[i])) {
        setSelectedIdx(i);
        dragRef.current = { type: "move", rectIdx: i, prevRect: { ...rects[i] }, startPt: pt };
        setPreviewRect({ ...rects[i] });
        return;
      }
    }

    // draw new rect
    setSelectedIdx(null);
    dragRef.current = { type: "draw", startPt: pt };
    setPreviewRect({ x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1] });
  };

  // ── pointer move ──
  const handlePointerMove = (event: unknown) => {
    const pt = pointFromEvent(event);
    if (!pt) return;
    // BRUSH: independent of dragRef
    if (mode === "BRUSH") {
      if (!activeStrokeRef.current.length) return;
      activeStrokeRef.current = [...activeStrokeRef.current, pt];
      setActiveStroke([...activeStrokeRef.current]);
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.type === "draw") {
      setPreviewRect({ x1: drag.startPt[0], y1: drag.startPt[1], x2: pt[0], y2: pt[1] });
    } else if (drag.type === "move") {
      const dx = pt[0] - drag.startPt[0];
      const dy = pt[1] - drag.startPt[1];
      const pr = drag.prevRect;
      const w = pr.x2 - pr.x1, h = pr.y2 - pr.y1;
      const nx1 = clamp(pr.x1 + dx, 0, IMAGE_WIDTH - w);
      const ny1 = clamp(pr.y1 + dy, 0, IMAGE_HEIGHT - h);
      setPreviewRect({ x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h });
    } else if (drag.type === "resize") {
      const dx = pt[0] - drag.startPt[0];
      const dy = pt[1] - drag.startPt[1];
      const updated = applyResize(drag.prevRect, drag.handle, dx, dy, IMAGE_WIDTH, IMAGE_HEIGHT);
      setPreviewRect(updated);
    }
  };

  // ── pointer up ──
  const handlePointerUp = () => {
    const drag = dragRef.current;

    if (mode === "BRUSH") {
      if (activeStrokeRef.current.length >= 2) {
        commit({
          rects: rects.map(r => ({ ...r })),
          brushStrokes: [...brushStrokes.map(s => s.map(([x, y]) => [x, y] as MaskPoint)), [...activeStrokeRef.current]],
        });
      }
      setActiveStroke([]);
      activeStrokeRef.current = [];
      dragRef.current = null;
      return;
    }

    if (!drag || !previewRect) {
      setPreviewRect(null);
      dragRef.current = null;
      return;
    }

    if (drag.type === "draw") {
      const nr = normalizeRect(previewRect);
      if (nr.x2 - nr.x1 > 5 && nr.y2 - nr.y1 > 5) {
        const newRects = [...rects.map(r => ({ ...r })), nr];
        const newIdx = newRects.length - 1;
        commit({ rects: newRects, brushStrokes: brushStrokes.map(s => s.map(([x, y]) => [x, y])) });
        setSelectedIdx(newIdx);
      }
    } else if (drag.type === "move" || drag.type === "resize") {
      const nr = normalizeRect(previewRect);
      const newRects = rects.map((r, i) => i === drag.rectIdx ? nr : { ...r });
      commit({ rects: newRects, brushStrokes: brushStrokes.map(s => s.map(([x, y]) => [x, y])) });
      setSelectedIdx(drag.rectIdx);
    }

    setPreviewRect(null);
    dragRef.current = null;
  };

  // ── undo / redo ──
  const handleUndo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setFuture(f => [snapshotNow(), ...f].slice(0, 40));
    applySnapshot(prev);
  };
  const handleRedo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setHistory(h => [...h, snapshotNow()].slice(-40));
    applySnapshot(next);
  };

  const handleDeleteSelected = () => {
    if (selectedIdx === null) return;
    const newRects = rects.filter((_, i) => i !== selectedIdx);
    commit({ rects: newRects, brushStrokes: brushStrokes.map(s => s.map(([x, y]) => [x, y])) });
    setSelectedIdx(null);
  };

  const handleClearMask = () => {
    commit({ rects: [], brushStrokes: [] });
    setSelectedIdx(null);
  };

  const hasMaskData = rects.length > 0 || brushStrokes.length > 0;

  // ── api submit ──
  const handleStartErase = async () => {
    if (!user) { setErrorText("登录状态失效，请返回重新连接"); return; }
    if (typeof user.quotaLeft === "number" && user.quotaLeft <= 0) { setErrorText("当前配额已用完，请升级套餐后再继续"); return; }
    if (!selectedMedia) { setErrorText("未找到待处理文件缓存"); return; }
    if (!hasMaskData) { setErrorText("请在画面上圈择要擦除的水印区域"); return; }

    setLoading(true);
    setErrorText("");
    try {
      const uploadPolicy = await getUploadPolicy({
        fileName: selectedMedia.fileName,
        fileSize: selectedMedia.fileSize,
        mediaType: mediaType === "IMAGE" ? "image" : "video",
        mimeType: selectedMedia.mimeType,
      });
      const assetId = uploadPolicy.data.assetId;
      await uploadFileToCOS(uploadPolicy.data.uploadUrl, uploadPolicy.data.headers, selectedMedia.file || selectedMedia.sourcePath);

      const task = await createTask({ assetId, mediaType, taskPolicy: "FAST" }, buildIdempotencyKey());
      const newTaskId = task.data.taskId;
      setTask(newTaskId, task.data.status as TaskStatus);

      await upsertTaskMask(newTaskId, {
        imageWidth: IMAGE_WIDTH,
        imageHeight: IMAGE_HEIGHT,
        polygons: rects.map(r => rectToPolygon(normalizeRect(r))),
        brushStrokes,
        version: 0,
      }, buildIdempotencyKey());

      Taro.switchTab({ url: "/pages/tasks/index" });
    } catch (error) {
      setErrorText(error instanceof ApiError ? `[网络请求错误] ${error.code} ${error.message}` : "处理启动异常，请检查网络后重试");
      setLoading(false);
    }
  };

  // ── render helpers ──
  function pct(v: number, total: number) { return `${(v / total) * 100}%`; }

  function renderHandle(key: HandleKey, r: Rect) {
    const [cx, cy] = getHandleCenter(r, key);
    const size = 14;
    return (
      <View
        key={key}
        style={{
          position: "absolute",
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "3px",
          background: "#fff",
          border: "2px solid #3b82f6",
          left: `calc(${pct(cx, IMAGE_WIDTH)} - ${size / 2}px)`,
          top: `calc(${pct(cy, IMAGE_HEIGHT)} - ${size / 2}px)`,
          zIndex: 20,
          cursor: key === "TL" || key === "BR" ? "nwse-resize" : "nesw-resize",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}
      />
    );
  }

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

      {/* 顶栏工具集 */}
      <View className="editor-nav-pills animate-fade-in" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
        <View className="editor-pill-group" style={{ display: "flex", gap: "8px" }}>
          <View
            className={`editor-pill ${mode === "BRUSH" ? "editor-pill-active" : ""}`}
            onClick={() => { setMode("BRUSH"); setSelectedIdx(null); }}
            style={{ padding: "8px 16px", borderRadius: "20px", fontSize: "14px", background: mode === "BRUSH" ? "linear-gradient(135deg, #3b82f6, #8b5cf6)" : "transparent", color: mode === "BRUSH" ? "#fff" : "#64748b" }}
          >🖌️ 手绘涂抹</View>
          <View
            className={`editor-pill ${mode === "RECTANGLE" ? "editor-pill-active" : ""}`}
            onClick={() => setMode("RECTANGLE")}
            style={{ padding: "8px 16px", borderRadius: "20px", fontSize: "14px", background: mode === "RECTANGLE" ? "linear-gradient(135deg, #3b82f6, #8b5cf6)" : "transparent", color: mode === "RECTANGLE" ? "#fff" : "#64748b" }}
          >⬡ 图形框选</View>
        </View>
        <View className="editor-pill-group" style={{ display: "flex", gap: "8px" }}>
          {selectedIdx !== null && mode === "RECTANGLE" && (
            <View
              className="editor-pill"
              onClick={handleDeleteSelected}
              style={{ padding: "8px 12px", borderRadius: "20px", fontSize: "14px", color: "#f87171" }}
            >🗑️ 删除</View>
          )}
          <View className="editor-pill" onClick={history.length ? handleUndo : undefined} style={{ padding: "8px 12px", borderRadius: "20px", fontSize: "14px", opacity: history.length ? 1 : 0.4 }}>↩️ 撤回</View>
          <View className="editor-pill" onClick={future.length ? handleRedo : undefined} style={{ padding: "8px 12px", borderRadius: "20px", fontSize: "14px", opacity: future.length ? 1 : 0.4 }}>↪️ 重做</View>
          <View className="editor-pill" onClick={hasMaskData ? handleClearMask : undefined} style={{ padding: "8px 12px", borderRadius: "20px", fontSize: "14px", opacity: hasMaskData ? 1 : 0.4 }}>🗑️ 清除</View>
        </View>
      </View>

      {/* 操作提示 */}
      {mode === "RECTANGLE" && (
        <View style={{ padding: "4px 0 8px", fontSize: "12px", color: "#64748b" }}>
          {selectedIdx !== null ? "拖动矩形移动 · 拖动角点缩放 · 点击空白取消选中" : "拖拽画框框选水印区域"}
        </View>
      )}

      {/* 画板 */}
      <View
        className="editor-workspace"
        style={{
          width: "100%",
          height: "calc(100vh - 220px)",
          minHeight: "300px",
          background: "#0f172a",
          borderRadius: "16px",
          overflow: "hidden",
          marginTop: "12px",
          marginBottom: "80px",
        }}
      >
        <View
          className="mask-board"
          // @ts-ignore
          onMouseDown={handlePointerDown}
          // @ts-ignore
          onMouseMove={handlePointerMove}
          // @ts-ignore
          onMouseUp={handlePointerUp}
          // @ts-ignore
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={selectedMedia.sourcePath
            ? { backgroundImage: `url(${selectedMedia.sourcePath})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center", touchAction: "none" }
            : { touchAction: "none" }}
        >
          {/* 已提交的矩形 */}
          {rects.map((rect, i) => {
            const r = normalizeRect(rect);
            const isSelected = i === selectedIdx;
            // If currently dragging this rect, use previewRect instead
            const display = dragRef.current && (dragRef.current as any).rectIdx === i && previewRect
              ? normalizeRect(previewRect)
              : r;
            return (
              <View key={`rect-${i}`}>
                <View
                  style={{
                    position: "absolute",
                    left: pct(display.x1, IMAGE_WIDTH),
                    top: pct(display.y1, IMAGE_HEIGHT),
                    width: pct(display.x2 - display.x1, IMAGE_WIDTH),
                    height: pct(display.y2 - display.y1, IMAGE_HEIGHT),
                    backgroundColor: isSelected ? "rgba(59, 130, 246, 0.35)" : "rgba(59, 130, 246, 0.25)",
                    border: isSelected ? "2px solid #3b82f6" : "2px solid rgba(59, 130, 246, 0.6)",
                    zIndex: 5,
                    cursor: mode === "RECTANGLE" ? "move" : "default",
                    boxSizing: "border-box",
                  }}
                />
                {/* 角手柄 — 仅选中时显示 */}
                {isSelected && mode === "RECTANGLE" && (["TL", "TR", "BL", "BR"] as HandleKey[]).map(h => renderHandle(h, display))}
              </View>
            );
          })}

          {/* 绘制中的新矩形预览 */}
          {dragRef.current?.type === "draw" && previewRect && (() => {
            const pr = normalizeRect(previewRect);
            return (
              <View
                style={{
                  position: "absolute",
                  left: pct(pr.x1, IMAGE_WIDTH),
                  top: pct(pr.y1, IMAGE_HEIGHT),
                  width: pct(pr.x2 - pr.x1, IMAGE_WIDTH),
                  height: pct(pr.y2 - pr.y1, IMAGE_HEIGHT),
                  border: "2px dashed #3b82f6",
                  backgroundColor: "rgba(59, 130, 246, 0.2)",
                  zIndex: 10,
                  boxSizing: "border-box",
                }}
              />
            );
          })()}

          {/* 手绘涂抹 */}
          {brushStrokes.map((stroke, strokeIndex) =>
            stroke.filter((_, i) => i % 2 === 0).map((point, i) => (
              <View
                key={`stroke-${strokeIndex}-${i}`}
                className="mask-point mask-point-brush"
                style={{ left: pct(point[0], IMAGE_WIDTH), top: pct(point[1], IMAGE_HEIGHT) }}
              />
            ))
          )}
          {activeStroke.filter((_, i) => i % 2 === 0).map((point, i) => (
            <View
              key={`active-${i}`}
              className="mask-point mask-point-active"
              style={{ left: pct(point[0], IMAGE_WIDTH), top: pct(point[1], IMAGE_HEIGHT) }}
            />
          ))}
        </View>
      </View>

      {/* 报错横幅 */}
      {errorText && (
        <View className="editor-error-banner animate-slide-up">
          <Text>{errorText}</Text>
        </View>
      )}

      {/* 底部悬浮按钮 */}
      <View className="editor-bottom-bar animate-slide-up" style={{ animationDelay: "0.2s", padding: "16px", position: "fixed", bottom: 0, left: 0, width: "100%", boxSizing: "border-box", background: "linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.7) 50%, transparent 100%)" }}>
        <View
          className={`editor-start-btn ${!hasMaskData ? "editor-start-btn-disabled" : ""}`}
          onClick={!loading && hasMaskData ? handleStartErase : undefined}
          style={{
            width: "100%",
            height: "52px",
            borderRadius: "26px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "17px",
            fontWeight: "bold",
            background: hasMaskData ? "linear-gradient(135deg, #3b82f6, #8b5cf6)" : "rgba(100, 116, 139, 0.3)",
            color: hasMaskData ? "#fff" : "rgba(255, 255, 255, 0.4)",
            boxShadow: hasMaskData ? "0 4px 20px rgba(59, 130, 246, 0.5)" : "none",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "处理中..." : "开始智能抹除 ✨"}
        </View>
      </View>

    </PageShell>
  );
}
