# inference-gateway

FastAPI service that exposes internal inference/document-processing endpoints for `worker-orchestrator`.

## Endpoints
- `POST /internal/inpaint/image`
- `POST /internal/inpaint/video`
- `POST /internal/doc/ppt-to-pdf`
- `POST /internal/doc/render-pdf`
- `POST /internal/doc/package`

## Security
All internal endpoints require header `x-inference-token` matching `INFERENCE_SHARED_TOKEN`.

## Local Run
```bash
cd apps/inference-gateway
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
INFERENCE_SHARED_TOKEN=inference-local-token uvicorn app:app --reload --port 8088
```
