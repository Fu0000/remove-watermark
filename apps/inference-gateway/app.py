from __future__ import annotations

import glob
import os
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import cv2
import fitz
import numpy as np
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field

app = FastAPI(title="inference-gateway", version="0.2.0")


def read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class GatewayConfig(BaseModel):
    shared_token: str = Field(default_factory=lambda: os.getenv("INFERENCE_SHARED_TOKEN", "inference-local-token"))
    model_mode: str = Field(default_factory=lambda: os.getenv("INFERENCE_MODEL_MODE", "mock").strip().lower())
    python_bin: str = Field(default_factory=lambda: os.getenv("INFERENCE_PYTHON_BIN", "python3"))
    lama_repo_dir: str = Field(default_factory=lambda: os.getenv("LAMA_REPO_DIR", "/opt/repos/lama"))
    propainter_repo_dir: str = Field(default_factory=lambda: os.getenv("PROPAINTER_REPO_DIR", "/opt/repos/propainter"))
    model_lama_path: str = Field(default_factory=lambda: os.getenv("MODEL_LAMA_PATH", "/opt/models/lama"))
    model_propainter_path: str = Field(default_factory=lambda: os.getenv("MODEL_PROPAINTER_PATH", "/opt/models/propainter"))
    asset_dir: str = Field(default_factory=lambda: os.getenv("INFERENCE_ASSET_DIR", "/data/assets"))
    result_dir: str = Field(default_factory=lambda: os.getenv("INFERENCE_RESULT_DIR", "/data/results"))
    work_dir: str = Field(default_factory=lambda: os.getenv("INFERENCE_WORK_DIR", "/data/work"))
    image_timeout_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_TIMEOUT_IMAGE_SEC", "240")))
    video_timeout_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_TIMEOUT_VIDEO_SEC", "1200")))
    doc_timeout_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_TIMEOUT_DOC_SEC", "300")))
    propainter_fp16: bool = Field(default_factory=lambda: read_bool("PROPAINTER_FP16", True))
    propainter_subvideo_length: int = Field(default_factory=lambda: int(os.getenv("PROPAINTER_SUBVIDEO_LENGTH", "80")))
    propainter_neighbor_length: int = Field(default_factory=lambda: int(os.getenv("PROPAINTER_NEIGHBOR_LENGTH", "10")))
    propainter_ref_stride: int = Field(default_factory=lambda: int(os.getenv("PROPAINTER_REF_STRIDE", "10")))
    propainter_resize_ratio: float = Field(default_factory=lambda: float(os.getenv("PROPAINTER_RESIZE_RATIO", "1.0")))
    lama_refine: bool = Field(default_factory=lambda: read_bool("LAMA_REFINE", False))


CONFIG = GatewayConfig()

for base in (CONFIG.asset_dir, CONFIG.result_dir, CONFIG.work_dir):
    Path(base).mkdir(parents=True, exist_ok=True)


class InferenceError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        error_code: str,
        message: str,
        retryable: bool = False
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.retryable = retryable


@app.exception_handler(InferenceError)
def handle_inference_error(_: Request, exc: InferenceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "errorCode": exc.error_code,
            "errorMessage": exc.message,
            "retryable": exc.retryable
        }
    )


def require_token(token: Optional[str]) -> None:
    if not token or token != CONFIG.shared_token:
        raise InferenceError(status_code=401, error_code="AUTH_INVALID_TOKEN", message="invalid inference token")


def normalize_task_id(task_id: str) -> str:
    return "".join(c for c in task_id if c.isalnum() or c in {"-", "_"})


def build_result_url(task_id: str, ext: str) -> str:
    return f"https://minio.local/result/{task_id}.{ext}"


def task_work_dir(task_id: str) -> Path:
    normalized = normalize_task_id(task_id) or "task"
    path = Path(CONFIG.work_dir) / normalized
    path.mkdir(parents=True, exist_ok=True)
    return path


def run_command(command: Sequence[str], *, cwd: Path, timeout_sec: int) -> None:
    try:
        completed = subprocess.run(
            list(command),
            cwd=str(cwd),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_sec,
            env=os.environ.copy()
        )
    except subprocess.TimeoutExpired as exc:
        raise InferenceError(
            status_code=504,
            error_code="INFERENCE_TIMEOUT",
            message=f"command timeout after {timeout_sec}s: {' '.join(command)}",
            retryable=True
        ) from exc

    if completed.returncode == 0:
        return

    stderr = (completed.stderr or "").strip()
    message = stderr[-1200:] if stderr else (completed.stdout or "").strip()[-1200:]
    if not message:
        message = f"command failed with code {completed.returncode}"

    raise InferenceError(
        status_code=500,
        error_code="INFERENCE_RUNTIME_FAILED",
        message=message,
        retryable=True
    )


def ensure_path(path: Path, *, kind: str, code: str) -> Path:
    if not path.exists():
        raise InferenceError(status_code=422, error_code=code, message=f"{kind} not found: {path}")
    return path


def candidate_exts(media_type: str) -> Tuple[str, ...]:
    upper = media_type.upper()
    if upper == "IMAGE":
        return (".png", ".jpg", ".jpeg", ".bmp", ".webp")
    if upper == "VIDEO":
        return (".mp4", ".mov", ".mkv", ".avi", ".webm")
    if upper == "PDF":
        return (".pdf",)
    if upper == "PPT":
        return (".ppt", ".pptx")
    return ()


def resolve_asset_path(asset_id: str, media_type: str, source_path: Optional[str] = None) -> Path:
    if source_path:
        return ensure_path(Path(source_path), kind="source asset", code="ASSET_NOT_FOUND")

    exts = candidate_exts(media_type)
    asset_root = Path(CONFIG.asset_dir)
    for ext in exts:
        direct = asset_root / f"{asset_id}{ext}"
        if direct.exists():
            return direct

    patterns = [str(asset_root / f"{asset_id}*{ext}") for ext in exts]
    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            return Path(matches[0])

    raise InferenceError(
        status_code=422,
        error_code="ASSET_NOT_FOUND",
        message=f"asset file for {asset_id} not found in {asset_root}"
    )


def regions_list(raw: Dict[str, Any] | List[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        nested = raw.get("regions")
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        return [raw]
    return []


def normalize_value(value: float, limit: int) -> float:
    if value <= 1.0:
        return value * limit
    if value <= 1000.0:
        return value / 1000.0 * limit
    return value


def normalize_box(raw_box: Sequence[Any], width: int, height: int) -> Tuple[int, int, int, int]:
    if len(raw_box) != 4:
        raise InferenceError(status_code=422, error_code="REGION_INVALID", message="box_2d must have 4 values")

    x1 = normalize_value(float(raw_box[0]), width)
    y1 = normalize_value(float(raw_box[1]), height)
    x2 = normalize_value(float(raw_box[2]), width)
    y2 = normalize_value(float(raw_box[3]), height)

    left = int(max(0, min(width - 1, min(x1, x2))))
    right = int(max(0, min(width, max(x1, x2))))
    top = int(max(0, min(height - 1, min(y1, y2))))
    bottom = int(max(0, min(height, max(y1, y2))))
    if right <= left:
        right = min(width, left + 1)
    if bottom <= top:
        bottom = min(height, top + 1)
    return (left, top, right, bottom)


def normalize_polygon(raw_points: Sequence[Any], width: int, height: int) -> List[Tuple[int, int]]:
    points: List[Tuple[int, int]] = []
    for raw in raw_points:
        if not isinstance(raw, (list, tuple)) or len(raw) != 2:
            continue
        x = normalize_value(float(raw[0]), width)
        y = normalize_value(float(raw[1]), height)
        points.append((int(max(0, min(width - 1, x))), int(max(0, min(height - 1, y)))))
    return points


def draw_region_mask(width: int, height: int, regions: Iterable[Dict[str, Any]]) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    painted = False

    for region in regions:
        box = region.get("box_2d")
        if isinstance(box, (list, tuple)) and len(box) == 4:
            draw.rectangle(normalize_box(box, width, height), fill=255)
            painted = True
            continue

        polygon = region.get("polygon")
        if isinstance(polygon, (list, tuple)):
            points = normalize_polygon(polygon, width, height)
            if len(points) >= 3:
                draw.polygon(points, fill=255)
                painted = True
                continue

        polygons = region.get("polygons")
        if isinstance(polygons, list):
            for poly in polygons:
                if isinstance(poly, (list, tuple)):
                    points = normalize_polygon(poly, width, height)
                    if len(points) >= 3:
                        draw.polygon(points, fill=255)
                        painted = True

    if not painted:
        raise InferenceError(
            status_code=422,
            error_code="REGION_INVALID",
            message="regions must contain at least one valid box_2d or polygon"
        )
    return mask


def resolve_lama_output(output_dir: Path) -> Path:
    candidates = sorted([path for path in output_dir.glob("*") if path.suffix.lower() in {".png", ".jpg", ".jpeg"}])
    if not candidates:
        raise InferenceError(status_code=500, error_code="LAMA_OUTPUT_MISSING", message=f"No output image in {output_dir}")
    return candidates[0]


def run_lama(task_id: str, image_path: Path, region_payload: Dict[str, Any] | List[Dict[str, Any]] | None) -> Path:
    repo = ensure_path(Path(CONFIG.lama_repo_dir), kind="LaMa repo", code="LAMA_REPO_NOT_FOUND")
    ensure_path(repo / "bin" / "predict.py", kind="LaMa predict script", code="LAMA_SCRIPT_NOT_FOUND")
    ensure_path(Path(CONFIG.model_lama_path), kind="LaMa model", code="LAMA_MODEL_NOT_FOUND")

    task_dir = task_work_dir(task_id)
    input_dir = task_dir / "lama-input"
    output_dir = task_dir / "lama-output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    mask = draw_region_mask(width, height, regions_list(region_payload))

    input_image = input_dir / "frame.png"
    input_mask = input_dir / "frame_mask001.png"
    image.save(input_image)
    mask.save(input_mask)

    command: List[str] = [
        CONFIG.python_bin,
        "bin/predict.py",
        f"model.path={CONFIG.model_lama_path}",
        f"indir={input_dir}",
        f"outdir={output_dir}"
    ]
    if CONFIG.lama_refine:
        command.append("refine=True")

    run_command(command, cwd=repo, timeout_sec=CONFIG.image_timeout_sec)

    output = resolve_lama_output(output_dir)
    final_output = Path(CONFIG.result_dir) / f"{normalize_task_id(task_id)}.png"
    shutil.copyfile(output, final_output)
    return final_output


def split_video_regions(regions: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[int, List[Dict[str, Any]]]]:
    global_regions: List[Dict[str, Any]] = []
    keyed_regions: Dict[int, List[Dict[str, Any]]] = {}

    for region in regions:
        raw_index = region.get("frameIndex")
        if raw_index is None:
            global_regions.append(region)
            continue
        try:
            frame_index = int(raw_index)
        except (TypeError, ValueError):
            continue
        keyed_regions.setdefault(max(0, frame_index), []).append(region)

    return global_regions, keyed_regions


def interpolate_box(
    prev_box: Tuple[int, int, int, int],
    next_box: Tuple[int, int, int, int],
    ratio: float
) -> Tuple[int, int, int, int]:
    return tuple(int(prev_box[i] + (next_box[i] - prev_box[i]) * ratio) for i in range(4))  # type: ignore[return-value]


def frame_regions(
    index: int,
    width: int,
    height: int,
    global_regions: List[Dict[str, Any]],
    keyed_regions: Dict[int, List[Dict[str, Any]]]
) -> List[Dict[str, Any]]:
    if not keyed_regions:
        return list(global_regions)
    if index in keyed_regions:
        return list(global_regions) + keyed_regions[index]

    prev_candidates = [k for k in keyed_regions.keys() if k < index]
    next_candidates = [k for k in keyed_regions.keys() if k > index]
    if not prev_candidates and not next_candidates:
        return list(global_regions)
    if not prev_candidates:
        return list(global_regions) + keyed_regions[min(next_candidates)]
    if not next_candidates:
        return list(global_regions) + keyed_regions[max(prev_candidates)]

    prev_idx = max(prev_candidates)
    next_idx = min(next_candidates)
    prev_regions = keyed_regions[prev_idx]
    next_regions = keyed_regions[next_idx]
    ratio = (index - prev_idx) / max(1, next_idx - prev_idx)

    if len(prev_regions) == 1 and len(next_regions) == 1:
        prev_box_raw = prev_regions[0].get("box_2d")
        next_box_raw = next_regions[0].get("box_2d")
        if isinstance(prev_box_raw, (list, tuple)) and isinstance(next_box_raw, (list, tuple)):
            prev_box = normalize_box(prev_box_raw, width, height)
            next_box = normalize_box(next_box_raw, width, height)
            mixed_box = interpolate_box(prev_box, next_box, ratio)
            return list(global_regions) + [{"box_2d": list(mixed_box)}]

    return list(global_regions) + prev_regions


def create_video_mask(video_path: Path, task_id: str, region_payload: Dict[str, Any] | List[Dict[str, Any]] | None) -> Path:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise InferenceError(status_code=422, error_code="VIDEO_OPEN_FAILED", message=f"cannot open video: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if width <= 0 or height <= 0 or frame_count <= 0:
        capture.release()
        raise InferenceError(status_code=422, error_code="VIDEO_META_INVALID", message=f"invalid video metadata: {video_path}")

    task_dir = task_work_dir(task_id)
    _ = fps
    mask_dir = task_dir / "mask-frames"
    if mask_dir.exists():
        for stale in mask_dir.glob("*.png"):
            stale.unlink(missing_ok=True)
    mask_dir.mkdir(parents=True, exist_ok=True)

    global_regions, keyed_regions = split_video_regions(regions_list(region_payload))
    if not global_regions and not keyed_regions:
        capture.release()
        raise InferenceError(status_code=422, error_code="REGION_INVALID", message="video regions are empty")

    frame_index = 0
    while True:
        ok, _ = capture.read()
        if not ok:
            break

        active_regions = frame_regions(frame_index, width, height, global_regions, keyed_regions)
        mask_img = draw_region_mask(width, height, active_regions)
        mask_frame = np.array(mask_img)
        cv2.imwrite(str(mask_dir / f"{frame_index:05d}.png"), mask_frame)
        frame_index += 1

    capture.release()
    if frame_index == 0:
        raise InferenceError(status_code=422, error_code="VIDEO_EMPTY", message=f"video has no decodable frames: {video_path}")

    return mask_dir


def resolve_video_output(output_dir: Path) -> Path:
    candidates = sorted([path for path in output_dir.rglob("*.mp4") if path.is_file()])
    if not candidates:
        raise InferenceError(status_code=500, error_code="PROPAINTER_OUTPUT_MISSING", message=f"No output video in {output_dir}")
    return candidates[0]


def run_propainter(task_id: str, video_path: Path, mask_video_path: Path) -> Path:
    repo = ensure_path(Path(CONFIG.propainter_repo_dir), kind="ProPainter repo", code="PROPAINTER_REPO_NOT_FOUND")
    ensure_path(repo / "inference_propainter.py", kind="ProPainter script", code="PROPAINTER_SCRIPT_NOT_FOUND")
    ensure_path(Path(CONFIG.model_propainter_path), kind="ProPainter model", code="PROPAINTER_MODEL_NOT_FOUND")

    task_dir = task_work_dir(task_id)
    output_dir = task_dir / "propainter-output"
    output_dir.mkdir(parents=True, exist_ok=True)

    command: List[str] = [
        CONFIG.python_bin,
        "inference_propainter.py",
        "--video",
        str(video_path),
        "--mask",
        str(mask_video_path),
        "--output",
        str(output_dir),
        "--subvideo_length",
        str(CONFIG.propainter_subvideo_length),
        "--neighbor_length",
        str(CONFIG.propainter_neighbor_length),
        "--ref_stride",
        str(CONFIG.propainter_ref_stride),
        "--resize_ratio",
        str(CONFIG.propainter_resize_ratio)
    ]
    if CONFIG.propainter_fp16:
        command.append("--fp16")

    run_command(command, cwd=repo, timeout_sec=CONFIG.video_timeout_sec)

    output_video = resolve_video_output(output_dir)
    final_output = Path(CONFIG.result_dir) / f"{normalize_task_id(task_id)}.mp4"
    shutil.copyfile(output_video, final_output)
    return final_output


def run_ppt_to_pdf(task_id: str, ppt_path: Path) -> Path:
    task_dir = task_work_dir(task_id) / "doc"
    task_dir.mkdir(parents=True, exist_ok=True)
    for stale in task_dir.glob("*.pdf"):
        stale.unlink(missing_ok=True)

    command = [
        "libreoffice",
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        str(task_dir),
        str(ppt_path)
    ]
    run_command(command, cwd=task_dir, timeout_sec=CONFIG.doc_timeout_sec)

    converted_candidates = sorted(task_dir.glob("*.pdf"))
    if not converted_candidates:
        raise InferenceError(status_code=422, error_code="DOC_CONVERT_FAILED", message=f"no pdf generated for {ppt_path}")

    canonical_pdf = task_dir / "converted.pdf"
    shutil.copyfile(converted_candidates[0], canonical_pdf)
    return canonical_pdf


def render_pdf_with_poppler(pdf_path: Path, page_prefix: Path) -> None:
    command = [
        "pdftoppm",
        "-png",
        str(pdf_path),
        str(page_prefix)
    ]
    run_command(command, cwd=page_prefix.parent, timeout_sec=CONFIG.doc_timeout_sec)


def render_pdf_with_pymupdf(pdf_path: Path, page_prefix: Path) -> None:
    document = fitz.open(pdf_path)
    if document.page_count == 0:
        raise InferenceError(status_code=422, error_code="DOC_RENDER_FAILED", message="pdf has no pages")
    for index in range(document.page_count):
        page = document.load_page(index)
        pix = page.get_pixmap(alpha=False)
        pix.save(str(page_prefix.parent / f"{page_prefix.name}-{index + 1}.png"))
    document.close()


def run_render_pdf(task_id: str, pdf_path: Path) -> Tuple[str, Path]:
    task_dir = task_work_dir(task_id) / "doc"
    task_dir.mkdir(parents=True, exist_ok=True)
    page_prefix = task_dir / "page"

    try:
        render_pdf_with_poppler(pdf_path, page_prefix)
        renderer = "poppler"
    except InferenceError:
        render_pdf_with_pymupdf(pdf_path, page_prefix)
        renderer = "pymupdf"

    images = sorted(task_dir.glob("page-*.png"))
    if not images:
        raise InferenceError(status_code=422, error_code="DOC_RENDER_FAILED", message=f"no page images generated for {task_id}")
    return renderer, page_prefix


def package_doc_files(task_id: str, pdf_path: Path) -> Tuple[Path, Path]:
    task_dir = task_work_dir(task_id) / "doc"
    pages = sorted(task_dir.glob("page-*.png"))
    if not pages:
        raise InferenceError(status_code=422, error_code="DOC_PACKAGE_FAILED", message=f"no rendered pages for {task_id}")

    result_pdf = Path(CONFIG.result_dir) / f"{normalize_task_id(task_id)}.pdf"
    result_zip = Path(CONFIG.result_dir) / f"{normalize_task_id(task_id)}.zip"
    shutil.copyfile(pdf_path, result_pdf)

    with zipfile.ZipFile(result_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for page in pages:
            archive.write(page, arcname=page.name)

    return result_pdf, result_zip


class InpaintImageRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str = Field(default="IMAGE")
    regions: Dict[str, Any] | List[Dict[str, Any]] | None = None
    sourcePath: Optional[str] = None


class InpaintVideoRequest(BaseModel):
    taskId: str
    assetId: str
    regions: Dict[str, Any] | List[Dict[str, Any]] | None = None
    sourcePath: Optional[str] = None


class PptToPdfRequest(BaseModel):
    taskId: str
    assetId: str
    sourcePath: Optional[str] = None


class RenderPdfRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str
    sourcePath: Optional[str] = None


class DocPackageRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str
    staged: Dict[str, Any] | None = None
    sourcePath: Optional[str] = None


@app.get("/healthz")
def healthz() -> Dict[str, Any]:
    return {
        "status": "ok",
        "mode": CONFIG.model_mode,
        "lamaRepoReady": Path(CONFIG.lama_repo_dir).exists(),
        "propainterRepoReady": Path(CONFIG.propainter_repo_dir).exists()
    }


@app.post("/internal/inpaint/image")
def inpaint_image(payload: InpaintImageRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_inference_token)
    if CONFIG.model_mode == "mock":
        return {"outputUrl": build_result_url(payload.taskId, "png"), "backend": "mock"}

    source_image = resolve_asset_path(payload.assetId, "IMAGE", payload.sourcePath)
    output = run_lama(payload.taskId, source_image, payload.regions)
    return {
        "outputUrl": build_result_url(payload.taskId, "png"),
        "outputPath": str(output),
        "backend": "lama"
    }


@app.post("/internal/inpaint/video")
def inpaint_video(payload: InpaintVideoRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_inference_token)
    if CONFIG.model_mode == "mock":
        return {"outputUrl": build_result_url(payload.taskId, "mp4"), "backend": "mock"}

    source_video = resolve_asset_path(payload.assetId, "VIDEO", payload.sourcePath)
    mask_video = create_video_mask(source_video, payload.taskId, payload.regions)
    output = run_propainter(payload.taskId, source_video, mask_video)
    return {
        "outputUrl": build_result_url(payload.taskId, "mp4"),
        "outputPath": str(output),
        "backend": "propainter"
    }


@app.post("/internal/doc/ppt-to-pdf")
def ppt_to_pdf(payload: PptToPdfRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_token(x_inference_token)
    if CONFIG.model_mode == "mock":
        return {"pdfUrl": build_result_url(payload.taskId, "pdf"), "backend": "mock"}

    ppt_file = resolve_asset_path(payload.assetId, "PPT", payload.sourcePath)
    pdf_path = run_ppt_to_pdf(payload.taskId, ppt_file)
    return {
        "pdfUrl": build_result_url(payload.taskId, "pdf"),
        "pdfPath": str(pdf_path),
        "backend": "libreoffice"
    }


@app.post("/internal/doc/render-pdf")
def render_pdf(payload: RenderPdfRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_inference_token)
    if CONFIG.model_mode == "mock":
        return {
            "renderer": os.getenv("DEFAULT_PDF_RENDERER", "pdfium"),
            "pageImagePrefix": f"https://minio.local/intermediate/{payload.taskId}/page",
            "backend": "mock"
        }

    media_type = payload.mediaType.upper()
    if media_type == "PPT":
        ppt_pdf = task_work_dir(payload.taskId) / "doc" / "converted.pdf"
        pdf_file = ensure_path(ppt_pdf, kind="ppt converted pdf", code="DOC_CONVERT_FAILED")
    else:
        pdf_file = resolve_asset_path(payload.assetId, "PDF", payload.sourcePath)

    renderer, prefix = run_render_pdf(payload.taskId, pdf_file)
    return {
        "renderer": renderer,
        "pageImagePrefix": str(prefix),
        "backend": "doc-render"
    }


@app.post("/internal/doc/package")
def package_doc(payload: DocPackageRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_token(x_inference_token)
    if CONFIG.model_mode == "mock":
        return {
            "resultUrl": build_result_url(payload.taskId, "pdf"),
            "pdfUrl": build_result_url(payload.taskId, "pdf"),
            "zipUrl": build_result_url(payload.taskId, "zip"),
            "backend": "mock"
        }

    media_type = payload.mediaType.upper()
    if media_type == "PPT":
        ppt_pdf = task_work_dir(payload.taskId) / "doc" / "converted.pdf"
        pdf_file = ensure_path(ppt_pdf, kind="ppt converted pdf", code="DOC_CONVERT_FAILED")
    else:
        pdf_file = resolve_asset_path(payload.assetId, "PDF", payload.sourcePath)

    result_pdf, result_zip = package_doc_files(payload.taskId, pdf_file)
    return {
        "resultUrl": build_result_url(payload.taskId, "pdf"),
        "pdfUrl": build_result_url(payload.taskId, "pdf"),
        "zipUrl": build_result_url(payload.taskId, "zip"),
        "pdfPath": str(result_pdf),
        "zipPath": str(result_zip),
        "backend": "doc-package"
    }
