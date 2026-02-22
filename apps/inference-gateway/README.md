# inference-gateway

FastAPI service that exposes internal inference/document-processing endpoints for `worker-orchestrator`.

## Model Backends

- LaMa image inpainting: [advimman/lama](https://github.com/advimman/lama)
- ProPainter video inpainting: [sczhou/ProPainter](https://github.com/sczhou/ProPainter)

The gateway supports two modes:

- `INFERENCE_MODEL_MODE=mock` (default): return deterministic URLs for local API/worker smoke.
- `INFERENCE_MODEL_MODE=native`: run LaMa/ProPainter/LibreOffice/Poppler pipeline.

## Endpoints

- `POST /internal/inpaint/image` (LaMa)
- `POST /internal/inpaint/video` (ProPainter)
- `POST /internal/doc/ppt-to-pdf` (LibreOffice)
- `POST /internal/doc/render-pdf` (Poppler -> PyMuPDF fallback)
- `POST /internal/doc/package` (PDF + page ZIP)

## Required Env (native mode)

- `INFERENCE_SHARED_TOKEN`
- `LAMA_REPO_DIR` (must contain `bin/predict.py`)
- `PROPAINTER_REPO_DIR` (must contain `inference_propainter.py`)
- `MODEL_LAMA_PATH`
- `MODEL_PROPAINTER_PATH`
- `INFERENCE_ASSET_DIR` (input files, named with `assetId` prefix)
- `INFERENCE_RESULT_DIR` (generated outputs)
- `INFERENCE_WORK_DIR` (tmp/intermediate files)

Optional tuning:

- `PROPAINTER_FP16=true`
- `PROPAINTER_SUBVIDEO_LENGTH=80`
- `PROPAINTER_NEIGHBOR_LENGTH=10`
- `PROPAINTER_REF_STRIDE=10`
- `PROPAINTER_RESIZE_RATIO=1.0`
- `LAMA_REFINE=false`

## Local Run

```bash
cd apps/inference-gateway
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# smoke mode (no models)
INFERENCE_MODEL_MODE=mock \
INFERENCE_SHARED_TOKEN=inference-local-token \
uvicorn app:app --reload --port 8088
```

Native mode example:

```bash
INFERENCE_MODEL_MODE=native \
INFERENCE_SHARED_TOKEN=inference-local-token \
LAMA_REPO_DIR=/opt/repos/lama \
PROPAINTER_REPO_DIR=/opt/repos/propainter \
MODEL_LAMA_PATH=/opt/models/lama \
MODEL_PROPAINTER_PATH=/opt/models/propainter \
INFERENCE_ASSET_DIR=/data/assets \
INFERENCE_RESULT_DIR=/data/results \
INFERENCE_WORK_DIR=/data/work \
uvicorn app:app --host 0.0.0.0 --port 8088
```

Bootstrap model repo directories (optional helper):

```bash
bash apps/inference-gateway/scripts/bootstrap-model-repos.sh
```

## Notes

- Current gateway resolves source files from `INFERENCE_ASSET_DIR` by `assetId` prefix or explicit `sourcePath`.
- Results are written to `INFERENCE_RESULT_DIR` and returned as URL placeholders (`https://minio.local/...`) for `/v1` compatibility.
