from __future__ import annotations

import glob
import hashlib
import os
import re
import shutil
import subprocess
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse
from urllib.request import urlopen

import cv2
import fitz
import numpy as np
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from minio import Minio
from minio.error import S3Error
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
    minio_endpoint: str = Field(default_factory=lambda: os.getenv("MINIO_ENDPOINT", "http://127.0.0.1:9000"))
    minio_public_endpoint: str = Field(default_factory=lambda: os.getenv("MINIO_PUBLIC_ENDPOINT", "http://127.0.0.1:9000"))
    minio_region: str = Field(default_factory=lambda: os.getenv("MINIO_REGION", "us-east-1"))
    minio_access_key: str = Field(default_factory=lambda: os.getenv("MINIO_ACCESS_KEY", os.getenv("MINIO_ROOT_USER", "minio")))
    minio_secret_key: str = Field(default_factory=lambda: os.getenv("MINIO_SECRET_KEY", os.getenv("MINIO_ROOT_PASSWORD", "miniopassword")))
    minio_secure: bool = Field(default_factory=lambda: read_bool("MINIO_SECURE", False))
    minio_bucket_results: str = Field(default_factory=lambda: os.getenv("MINIO_BUCKET_RESULTS", "remove-waterremark"))
    minio_result_prefix: str = Field(default_factory=lambda: os.getenv("MINIO_RESULT_PREFIX", "result"))
    queue_wait_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_QUEUE_WAIT_SEC", "60")))
    image_pool_size: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_POOL_IMAGE", "2")))
    video_pool_size: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_POOL_VIDEO", "1")))
    doc_pool_size: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_POOL_DOC", "1")))
    cleanup_interval_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_CLEANUP_INTERVAL_SEC", "300")))
    work_ttl_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_WORK_TTL_SEC", "86400")))
    result_ttl_sec: int = Field(default_factory=lambda: int(os.getenv("INFERENCE_RESULT_TTL_SEC", "86400")))


CONFIG = GatewayConfig()

for base in (CONFIG.asset_dir, CONFIG.result_dir, CONFIG.work_dir):
    Path(base).mkdir(parents=True, exist_ok=True)

INFERENCE_POOLS = {
    "image": BoundedSemaphore(max(1, CONFIG.image_pool_size)),
    "video": BoundedSemaphore(max(1, CONFIG.video_pool_size)),
    "doc": BoundedSemaphore(max(1, CONFIG.doc_pool_size))
}
LAST_CLEANUP_AT = 0.0


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


def resolve_trace_id(trace_id_header: Optional[str], task_id: Optional[str]) -> str:
    if trace_id_header and trace_id_header.strip():
        return trace_id_header.strip()
    seed = task_id or str(time.time_ns())
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:24]
    return f"trc_{digest}"


def run_with_pool(pool_name: str, task_id: str, runner):
    maybe_cleanup_filesystem()
    semaphore = INFERENCE_POOLS.get(pool_name)
    if semaphore is None:
        raise InferenceError(status_code=500, error_code="INFERENCE_POOL_UNKNOWN", message=f"unknown pool: {pool_name}")

    acquired = semaphore.acquire(timeout=max(1, CONFIG.queue_wait_sec))
    if not acquired:
        raise InferenceError(
            status_code=429,
            error_code="INFERENCE_QUEUE_BUSY",
            message=f"inference queue is busy for pool={pool_name}, task={task_id}",
            retryable=True
        )

    started_at = time.monotonic()
    try:
        return runner()
    finally:
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        _ = elapsed_ms
        semaphore.release()


def maybe_cleanup_filesystem() -> None:
    global LAST_CLEANUP_AT

    now_mono = time.monotonic()
    interval = max(1, CONFIG.cleanup_interval_sec)
    if now_mono - LAST_CLEANUP_AT < interval:
        return

    LAST_CLEANUP_AT = now_mono
    now_epoch = time.time()
    sweep_expired_entries(Path(CONFIG.work_dir), now_epoch, max(1, CONFIG.work_ttl_sec))
    sweep_expired_entries(Path(CONFIG.result_dir), now_epoch, max(1, CONFIG.result_ttl_sec))


def sweep_expired_entries(base_dir: Path, now_epoch: float, ttl_sec: int) -> None:
    if not base_dir.exists():
        return

    for entry in base_dir.iterdir():
        try:
            stat = entry.stat()
        except OSError:
            continue
        age_sec = now_epoch - stat.st_mtime
        if age_sec <= ttl_sec:
            continue
        try:
            if entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink(missing_ok=True)
        except OSError:
            continue


def normalize_task_id(task_id: str) -> str:
    return "".join(c for c in task_id if c.isalnum() or c in {"-", "_"})


def trim_trailing_slash(value: str) -> str:
    return value.rstrip("/")


def normalize_object_prefix(prefix: str, fallback: str) -> str:
    normalized = prefix.strip().strip("/")
    return normalized or fallback


def parse_task_created_at(task_created_at: Optional[str]) -> Optional[datetime]:
    if not task_created_at:
        return None
    try:
        normalized = task_created_at.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def build_date_path(task_created_at: Optional[str], entity_id: str) -> str:
    parsed_created_at = parse_task_created_at(task_created_at)
    if parsed_created_at:
        dt = parsed_created_at
    else:
        dt = datetime.now(tz=timezone.utc)
        match = re.match(r"^[a-z]+_(\d{10,13})_", entity_id, re.IGNORECASE)
        if match:
            raw = int(match.group(1))
            epoch_ms = raw * 1000 if len(match.group(1)) <= 10 else raw
            dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    return f"{dt.year:04d}/{dt.month:02d}/{dt.day:02d}"


def build_result_object_key(task_id: str, ext: str, task_created_at: Optional[str] = None) -> str:
    prefix = normalize_object_prefix(CONFIG.minio_result_prefix, "result")
    date_path = build_date_path(task_created_at, task_id)
    return f"{prefix}/{date_path}/{task_id}.{ext}"


def build_result_url(task_id: str, ext: str, task_created_at: Optional[str] = None) -> str:
    endpoint = trim_trailing_slash(CONFIG.minio_public_endpoint)
    return f"{endpoint}/{CONFIG.minio_bucket_results}/{build_result_object_key(task_id, ext, task_created_at)}"


def infer_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".mp4":
        return "video/mp4"
    if suffix == ".pdf":
        return "application/pdf"
    if suffix == ".zip":
        return "application/zip"
    return "application/octet-stream"


def upload_result_to_minio(local_path: Path, task_id: str, ext: str, task_created_at: Optional[str] = None) -> str:
    ensure_path(local_path, kind="result file", code="RESULT_NOT_FOUND")
    object_key = build_result_object_key(task_id, ext, task_created_at)
    endpoint, secure = parse_minio_endpoint()
    client = Minio(
        endpoint,
        access_key=CONFIG.minio_access_key,
        secret_key=CONFIG.minio_secret_key,
        secure=secure,
        region=CONFIG.minio_region
    )

    try:
        client.fput_object(
            CONFIG.minio_bucket_results,
            object_key,
            str(local_path),
            content_type=infer_content_type(local_path)
        )
    except S3Error as exc:
        raise InferenceError(
            status_code=500,
            error_code="RESULT_UPLOAD_FAILED",
            message=f"cannot upload result to minio://{CONFIG.minio_bucket_results}/{object_key}: {exc}",
            retryable=True
        ) from exc

    return build_result_url(task_id, ext, task_created_at)


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


def default_ext(media_type: str) -> str:
    exts = candidate_exts(media_type)
    if exts:
        return exts[0]
    return ".bin"


def ext_from_source(source_path: str, media_type: str) -> str:
    parsed = urlparse(source_path)
    suffix = Path(parsed.path).suffix
    if suffix:
        return suffix
    return default_ext(media_type)


def source_cache_file(task_id: str, source_path: str, media_type: str) -> Path:
    token = hashlib.sha1(source_path.encode("utf-8")).hexdigest()[:16]
    target_dir = task_work_dir(task_id) / "sources"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / f"{token}{ext_from_source(source_path, media_type)}"


def parse_minio_endpoint() -> Tuple[str, bool]:
    parsed = urlparse(CONFIG.minio_endpoint)
    if parsed.scheme and parsed.netloc:
        secure = parsed.scheme.lower() == "https"
        endpoint = parsed.netloc
    else:
        endpoint = CONFIG.minio_endpoint.replace("http://", "").replace("https://", "").strip("/")
        secure = False
    return endpoint, (CONFIG.minio_secure or secure)


def download_minio_source(task_id: str, source_path: str, media_type: str) -> Path:
    parsed = urlparse(source_path)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    if not bucket or not key:
        raise InferenceError(
            status_code=422,
            error_code="ASSET_NOT_FOUND",
            message=f"invalid minio source path: {source_path}"
        )

    endpoint, secure = parse_minio_endpoint()
    target = source_cache_file(task_id, source_path, media_type)
    client = Minio(
        endpoint,
        access_key=CONFIG.minio_access_key,
        secret_key=CONFIG.minio_secret_key,
        secure=secure,
        region=CONFIG.minio_region
    )
    try:
        response = client.get_object(bucket, key)
        with target.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        response.close()
        response.release_conn()
    except S3Error as exc:
        raise InferenceError(
            status_code=422,
            error_code="ASSET_NOT_FOUND",
            message=f"cannot download source from minio://{bucket}/{key}: {exc}"
        ) from exc

    return ensure_path(target, kind="source asset", code="ASSET_NOT_FOUND")


def download_http_source(task_id: str, source_path: str, media_type: str) -> Path:
    target = source_cache_file(task_id, source_path, media_type)
    try:
        with urlopen(source_path, timeout=30) as response:  # nosec B310
            if response.status and response.status >= 400:
                raise InferenceError(
                    status_code=422,
                    error_code="ASSET_NOT_FOUND",
                    message=f"cannot download source: {source_path} ({response.status})"
                )
            with target.open("wb") as handle:
                shutil.copyfileobj(response, handle)
    except InferenceError:
        raise
    except Exception as exc:
        raise InferenceError(
            status_code=422,
            error_code="ASSET_NOT_FOUND",
            message=f"cannot download source: {source_path}"
        ) from exc

    return ensure_path(target, kind="source asset", code="ASSET_NOT_FOUND")


def resolve_source_path(task_id: str, source_path: str, media_type: str) -> Path:
    local_path = Path(source_path)
    if local_path.exists():
        return ensure_path(local_path, kind="source asset", code="ASSET_NOT_FOUND")

    if source_path.startswith("minio://") or source_path.startswith("s3://"):
        return download_minio_source(task_id, source_path, media_type)

    if source_path.startswith("http://") or source_path.startswith("https://"):
        return download_http_source(task_id, source_path, media_type)

    raise InferenceError(status_code=422, error_code="ASSET_NOT_FOUND", message=f"source asset not found: {source_path}")


def resolve_asset_path(task_id: str, asset_id: str, media_type: str, source_path: Optional[str] = None) -> Path:
    if source_path:
        return resolve_source_path(task_id, source_path, media_type)

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


def run_lama_once(
    task_id: str,
    image_path: Path,
    region_payload: Dict[str, Any] | List[Dict[str, Any]] | None,
    run_suffix: str
) -> Path:
    repo = ensure_path(Path(CONFIG.lama_repo_dir), kind="LaMa repo", code="LAMA_REPO_NOT_FOUND")
    ensure_path(repo / "bin" / "predict.py", kind="LaMa predict script", code="LAMA_SCRIPT_NOT_FOUND")
    ensure_path(Path(CONFIG.model_lama_path), kind="LaMa model", code="LAMA_MODEL_NOT_FOUND")

    task_dir = task_work_dir(task_id)
    input_dir = task_dir / f"lama-input-{run_suffix}"
    output_dir = task_dir / f"lama-output-{run_suffix}"
    if input_dir.exists():
        shutil.rmtree(input_dir)
    if output_dir.exists():
        shutil.rmtree(output_dir)
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
    return resolve_lama_output(output_dir)


def run_lama(task_id: str, image_path: Path, region_payload: Dict[str, Any] | List[Dict[str, Any]] | None) -> Path:
    output = run_lama_once(task_id, image_path, region_payload, "image")
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


def split_doc_regions(regions: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[int, List[Dict[str, Any]]]]:
    global_regions: List[Dict[str, Any]] = []
    keyed_regions: Dict[int, List[Dict[str, Any]]] = {}

    for region in regions:
        raw_index = region.get("pageIndex")
        if raw_index is None:
            global_regions.append(region)
            continue
        try:
            page_index = int(raw_index)
        except (TypeError, ValueError):
            continue
        keyed_regions.setdefault(max(0, page_index), []).append(region)

    return global_regions, keyed_regions


def run_opencv_inpaint(page: Path, active_regions: List[Dict[str, Any]]) -> None:
    image = cv2.imread(str(page), cv2.IMREAD_COLOR)
    if image is None:
        raise InferenceError(status_code=422, error_code="DOC_INPAINT_FAILED", message=f"cannot read page image: {page}")
    height, width = image.shape[:2]
    mask = np.array(draw_region_mask(width, height, active_regions))
    inpainted = cv2.inpaint(image, mask, 3, cv2.INPAINT_TELEA)
    ok = cv2.imwrite(str(page), inpainted)
    if not ok:
        raise InferenceError(status_code=500, error_code="DOC_INPAINT_FAILED", message=f"cannot write page image: {page}")


def run_lama_batch_for_doc(
    task_id: str,
    page_batches: List[Tuple[int, Path, List[Dict[str, Any]]]]
) -> None:
    repo = ensure_path(Path(CONFIG.lama_repo_dir), kind="LaMa repo", code="LAMA_REPO_NOT_FOUND")
    ensure_path(repo / "bin" / "predict.py", kind="LaMa predict script", code="LAMA_SCRIPT_NOT_FOUND")
    ensure_path(Path(CONFIG.model_lama_path), kind="LaMa model", code="LAMA_MODEL_NOT_FOUND")

    task_dir = task_work_dir(task_id)
    input_dir = task_dir / "lama-doc-batch-input"
    output_dir = task_dir / "lama-doc-batch-output"
    if input_dir.exists():
        shutil.rmtree(input_dir)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    page_mapping: List[Tuple[Path, str]] = []
    for index, page, active_regions in page_batches:
        image = Image.open(page).convert("RGB")
        width, height = image.size
        mask = draw_region_mask(width, height, active_regions)
        stem = f"page_{index:04d}"
        input_image = input_dir / f"{stem}.png"
        input_mask = input_dir / f"{stem}_mask001.png"
        image.save(input_image)
        mask.save(input_mask)
        page_mapping.append((page, stem))

    command: List[str] = [
        CONFIG.python_bin,
        "bin/predict.py",
        f"model.path={CONFIG.model_lama_path}",
        f"indir={input_dir}",
        f"outdir={output_dir}"
    ]
    if CONFIG.lama_refine:
        command.append("refine=True")

    run_command(command, cwd=repo, timeout_sec=CONFIG.doc_timeout_sec)

    for page, stem in page_mapping:
        candidates = sorted(
            [
                candidate
                for candidate in output_dir.glob(f"{stem}.*")
                if candidate.suffix.lower() in {".png", ".jpg", ".jpeg"}
            ]
        )
        if not candidates:
            raise InferenceError(
                status_code=500,
                error_code="DOC_INPAINT_FAILED",
                message=f"lama output missing for {stem}"
            )
        shutil.copyfile(candidates[0], page)


def run_doc_inpaint_pages(task_id: str, region_payload: Dict[str, Any] | List[Dict[str, Any]] | None) -> int:
    task_dir = task_work_dir(task_id) / "doc"
    pages = sorted(task_dir.glob("page-*.png"))
    if not pages:
        raise InferenceError(status_code=422, error_code="DOC_RENDER_FAILED", message=f"no page images generated for {task_id}")

    global_regions, keyed_regions = split_doc_regions(regions_list(region_payload))
    if not global_regions and not keyed_regions:
        raise InferenceError(status_code=422, error_code="REGION_INVALID", message="document regions are empty")

    page_batches: List[Tuple[int, Path, List[Dict[str, Any]]]] = []
    for index, page in enumerate(pages):
        active_regions = list(global_regions) + keyed_regions.get(index, [])
        if not active_regions:
            continue
        page_batches.append((index, page, active_regions))

    if not page_batches:
        raise InferenceError(
            status_code=422,
            error_code="REGION_INVALID",
            message="document regions did not match any rendered page"
        )

    try:
        run_lama_batch_for_doc(task_id, page_batches)
    except InferenceError:
        for _, page, active_regions in page_batches:
            run_opencv_inpaint(page, active_regions)

    return len(page_batches)


def build_pdf_from_pages(page_images: List[Path], output_pdf: Path) -> None:
    document = fitz.open()
    for image_path in page_images:
        with Image.open(image_path) as image:
            width, height = image.size
        page = document.new_page(width=float(width), height=float(height))
        page.insert_image(page.rect, filename=str(image_path))
    document.save(str(output_pdf))
    document.close()


def package_doc_files(task_id: str, pdf_path: Path) -> Tuple[Path, Path]:
    task_dir = task_work_dir(task_id) / "doc"
    pages = sorted(task_dir.glob("page-*.png"))
    if not pages:
        raise InferenceError(status_code=422, error_code="DOC_PACKAGE_FAILED", message=f"no rendered pages for {task_id}")

    result_pdf = Path(CONFIG.result_dir) / f"{normalize_task_id(task_id)}.pdf"
    result_zip = Path(CONFIG.result_dir) / f"{normalize_task_id(task_id)}.zip"
    build_pdf_from_pages(pages, result_pdf)

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
    taskCreatedAt: Optional[str] = None


class InpaintVideoRequest(BaseModel):
    taskId: str
    assetId: str
    regions: Dict[str, Any] | List[Dict[str, Any]] | None = None
    sourcePath: Optional[str] = None
    taskCreatedAt: Optional[str] = None


class PptToPdfRequest(BaseModel):
    taskId: str
    assetId: str
    sourcePath: Optional[str] = None
    taskCreatedAt: Optional[str] = None


class RenderPdfRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str
    sourcePath: Optional[str] = None
    taskCreatedAt: Optional[str] = None


class DocInpaintPagesRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str
    regions: Dict[str, Any] | List[Dict[str, Any]] | None = None
    sourcePath: Optional[str] = None
    taskCreatedAt: Optional[str] = None


class DocPackageRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str
    staged: Dict[str, Any] | None = None
    sourcePath: Optional[str] = None
    taskCreatedAt: Optional[str] = None


@app.get("/healthz")
def healthz() -> Dict[str, Any]:
    return {
        "status": "ok",
        "mode": CONFIG.model_mode,
        "lamaRepoReady": Path(CONFIG.lama_repo_dir).exists(),
        "propainterRepoReady": Path(CONFIG.propainter_repo_dir).exists(),
        "pool": {
            "image": CONFIG.image_pool_size,
            "video": CONFIG.video_pool_size,
            "doc": CONFIG.doc_pool_size
        }
    }


@app.post("/internal/inpaint/image")
def inpaint_image(
    payload: InpaintImageRequest,
    x_inference_token: Optional[str] = Header(default=None),
    x_trace_id: Optional[str] = Header(default=None)
) -> Dict[str, Any]:
    require_token(x_inference_token)
    trace_id = resolve_trace_id(x_trace_id, payload.taskId)
    if CONFIG.model_mode == "mock":
        return {
            "outputUrl": build_result_url(payload.taskId, "png", payload.taskCreatedAt),
            "backend": "mock",
            "traceId": trace_id
        }

    def execute() -> Dict[str, Any]:
        source_image = resolve_asset_path(payload.taskId, payload.assetId, "IMAGE", payload.sourcePath)
        output = run_lama(payload.taskId, source_image, payload.regions)
        output_url = upload_result_to_minio(output, payload.taskId, "png", payload.taskCreatedAt)
        return {
            "outputUrl": output_url,
            "outputPath": str(output),
            "backend": "lama",
            "traceId": trace_id
        }

    return run_with_pool("image", payload.taskId, execute)


@app.post("/internal/inpaint/video")
def inpaint_video(
    payload: InpaintVideoRequest,
    x_inference_token: Optional[str] = Header(default=None),
    x_trace_id: Optional[str] = Header(default=None)
) -> Dict[str, Any]:
    require_token(x_inference_token)
    trace_id = resolve_trace_id(x_trace_id, payload.taskId)
    if CONFIG.model_mode == "mock":
        return {
            "outputUrl": build_result_url(payload.taskId, "mp4", payload.taskCreatedAt),
            "backend": "mock",
            "traceId": trace_id
        }

    def execute() -> Dict[str, Any]:
        source_video = resolve_asset_path(payload.taskId, payload.assetId, "VIDEO", payload.sourcePath)
        mask_video = create_video_mask(source_video, payload.taskId, payload.regions)
        output = run_propainter(payload.taskId, source_video, mask_video)
        output_url = upload_result_to_minio(output, payload.taskId, "mp4", payload.taskCreatedAt)
        return {
            "outputUrl": output_url,
            "outputPath": str(output),
            "backend": "propainter",
            "traceId": trace_id
        }

    return run_with_pool("video", payload.taskId, execute)


@app.post("/internal/doc/ppt-to-pdf")
def ppt_to_pdf(
    payload: PptToPdfRequest,
    x_inference_token: Optional[str] = Header(default=None),
    x_trace_id: Optional[str] = Header(default=None)
) -> Dict[str, str]:
    require_token(x_inference_token)
    trace_id = resolve_trace_id(x_trace_id, payload.taskId)
    if CONFIG.model_mode == "mock":
        return {
            "pdfUrl": build_result_url(payload.taskId, "pdf", payload.taskCreatedAt),
            "backend": "mock",
            "traceId": trace_id
        }

    def execute() -> Dict[str, str]:
        ppt_file = resolve_asset_path(payload.taskId, payload.assetId, "PPT", payload.sourcePath)
        pdf_path = run_ppt_to_pdf(payload.taskId, ppt_file)
        return {
            "pdfUrl": build_result_url(payload.taskId, "pdf", payload.taskCreatedAt),
            "pdfPath": str(pdf_path),
            "backend": "libreoffice",
            "traceId": trace_id
        }

    return run_with_pool("doc", payload.taskId, execute)


@app.post("/internal/doc/render-pdf")
def render_pdf(
    payload: RenderPdfRequest,
    x_inference_token: Optional[str] = Header(default=None),
    x_trace_id: Optional[str] = Header(default=None)
) -> Dict[str, Any]:
    require_token(x_inference_token)
    trace_id = resolve_trace_id(x_trace_id, payload.taskId)
    if CONFIG.model_mode == "mock":
        endpoint = trim_trailing_slash(CONFIG.minio_public_endpoint)
        date_path = build_date_path(payload.taskCreatedAt, payload.taskId)
        result_prefix = normalize_object_prefix(CONFIG.minio_result_prefix, "result")
        return {
            "renderer": os.getenv("DEFAULT_PDF_RENDERER", "pdfium"),
            "pageImagePrefix": f"{endpoint}/{CONFIG.minio_bucket_results}/{result_prefix}/{date_path}/intermediate/{payload.taskId}/page",
            "backend": "mock",
            "traceId": trace_id
        }

    def execute() -> Dict[str, Any]:
        media_type = payload.mediaType.upper()
        if media_type == "PPT":
            ppt_pdf = task_work_dir(payload.taskId) / "doc" / "converted.pdf"
            pdf_file = ensure_path(ppt_pdf, kind="ppt converted pdf", code="DOC_CONVERT_FAILED")
        else:
            pdf_file = resolve_asset_path(payload.taskId, payload.assetId, "PDF", payload.sourcePath)

        renderer, prefix = run_render_pdf(payload.taskId, pdf_file)
        return {
            "renderer": renderer,
            "pageImagePrefix": str(prefix),
            "backend": "doc-render",
            "traceId": trace_id
        }

    return run_with_pool("doc", payload.taskId, execute)


@app.post("/internal/doc/inpaint-pages")
def inpaint_doc_pages(
    payload: DocInpaintPagesRequest,
    x_inference_token: Optional[str] = Header(default=None),
    x_trace_id: Optional[str] = Header(default=None)
) -> Dict[str, Any]:
    require_token(x_inference_token)
    trace_id = resolve_trace_id(x_trace_id, payload.taskId)
    if CONFIG.model_mode == "mock":
        return {
            "outputUrl": build_result_url(payload.taskId, "pdf", payload.taskCreatedAt),
            "backend": "mock",
            "traceId": trace_id
        }

    def execute() -> Dict[str, Any]:
        processed = run_doc_inpaint_pages(payload.taskId, payload.regions)
        return {
            "outputUrl": build_result_url(payload.taskId, "pdf", payload.taskCreatedAt),
            "processedPages": processed,
            "backend": "doc-lama",
            "traceId": trace_id
        }

    return run_with_pool("doc", payload.taskId, execute)


@app.post("/internal/doc/package")
def package_doc(
    payload: DocPackageRequest,
    x_inference_token: Optional[str] = Header(default=None),
    x_trace_id: Optional[str] = Header(default=None)
) -> Dict[str, str]:
    require_token(x_inference_token)
    trace_id = resolve_trace_id(x_trace_id, payload.taskId)
    if CONFIG.model_mode == "mock":
        return {
            "resultUrl": build_result_url(payload.taskId, "pdf", payload.taskCreatedAt),
            "pdfUrl": build_result_url(payload.taskId, "pdf", payload.taskCreatedAt),
            "zipUrl": build_result_url(payload.taskId, "zip", payload.taskCreatedAt),
            "backend": "mock",
            "traceId": trace_id
        }

    def execute() -> Dict[str, str]:
        media_type = payload.mediaType.upper()
        if media_type == "PPT":
            ppt_pdf = task_work_dir(payload.taskId) / "doc" / "converted.pdf"
            pdf_file = ensure_path(ppt_pdf, kind="ppt converted pdf", code="DOC_CONVERT_FAILED")
        else:
            pdf_file = resolve_asset_path(payload.taskId, payload.assetId, "PDF", payload.sourcePath)

        result_pdf, result_zip = package_doc_files(payload.taskId, pdf_file)
        pdf_url = upload_result_to_minio(result_pdf, payload.taskId, "pdf", payload.taskCreatedAt)
        zip_url = upload_result_to_minio(result_zip, payload.taskId, "zip", payload.taskCreatedAt)
        return {
            "resultUrl": pdf_url,
            "pdfUrl": pdf_url,
            "zipUrl": zip_url,
            "pdfPath": str(result_pdf),
            "zipPath": str(result_zip),
            "backend": "doc-package",
            "traceId": trace_id
        }

    return run_with_pool("doc", payload.taskId, execute)
