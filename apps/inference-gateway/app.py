from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="inference-gateway", version="0.1.0")


def require_token(token: Optional[str]) -> None:
    expected = os.getenv("INFERENCE_SHARED_TOKEN", "inference-local-token")
    if not token or token != expected:
        raise HTTPException(status_code=401, detail="invalid inference token")


def build_result_url(task_id: str, ext: str) -> str:
    return f"https://minio.local/result/{task_id}.{ext}"


class InpaintImageRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str = Field(default="IMAGE")
    regions: Dict[str, Any] | List[Dict[str, Any]] | None = None


class InpaintVideoRequest(BaseModel):
    taskId: str
    assetId: str
    regions: Dict[str, Any] | List[Dict[str, Any]] | None = None


class PptToPdfRequest(BaseModel):
    taskId: str
    assetId: str


class RenderPdfRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str


class DocPackageRequest(BaseModel):
    taskId: str
    assetId: str
    mediaType: str
    staged: Dict[str, Any] | None = None


@app.get("/healthz")
def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/inpaint/image")
def inpaint_image(payload: InpaintImageRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_token(x_inference_token)
    # Placeholder implementation. Integrate LaMa service here.
    time.sleep(0.01)
    return {"outputUrl": build_result_url(payload.taskId, "png")}


@app.post("/internal/inpaint/video")
def inpaint_video(payload: InpaintVideoRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_token(x_inference_token)
    # Placeholder implementation. Integrate ProPainter service here.
    time.sleep(0.02)
    return {"outputUrl": build_result_url(payload.taskId, "mp4")}


@app.post("/internal/doc/ppt-to-pdf")
def ppt_to_pdf(payload: PptToPdfRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_token(x_inference_token)
    # Placeholder for LibreOffice conversion.
    return {"pdfUrl": build_result_url(payload.taskId, "pdf")}


@app.post("/internal/doc/render-pdf")
def render_pdf(payload: RenderPdfRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_inference_token)
    # Placeholder for PDFium -> Poppler -> PyMuPDF rendering fallback.
    return {
        "renderer": os.getenv("DEFAULT_PDF_RENDERER", "pdfium"),
        "pageImagePrefix": f"https://minio.local/intermediate/{payload.taskId}/page"
    }


@app.post("/internal/doc/package")
def package_doc(payload: DocPackageRequest, x_inference_token: Optional[str] = Header(default=None)) -> Dict[str, str]:
    require_token(x_inference_token)
    # Placeholder for document repackaging.
    return {
        "resultUrl": build_result_url(payload.taskId, "pdf"),
        "pdfUrl": build_result_url(payload.taskId, "pdf"),
        "zipUrl": build_result_url(payload.taskId, "zip")
    }
