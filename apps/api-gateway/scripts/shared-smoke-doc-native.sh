#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STACK_FILE="${ROOT_DIR}/docker-compose.local-stack.yml"
STACK_POSTGRES_PORT="${STACK_POSTGRES_PORT:-}"
STACK_REDIS_PORT="${STACK_REDIS_PORT:-}"
STACK_MINIO_PORT="${STACK_MINIO_PORT:-}"
STACK_MINIO_CONSOLE_PORT="${STACK_MINIO_CONSOLE_PORT:-}"
STACK_INFERENCE_PORT="${STACK_INFERENCE_PORT:-}"
STACK_API_PORT="${STACK_API_PORT:-}"
MINIO_PUBLIC_ENDPOINT="${MINIO_PUBLIC_ENDPOINT:-}"
BASE_URL="${SHARED_BASE_URL:-}"
INFERENCE_HEALTH_URL=""
MAX_POLL="${SHARED_SMOKE_MAX_POLL_ATTEMPTS:-180}"
POLL_INTERVAL_SEC="${SHARED_SMOKE_POLL_INTERVAL_SEC:-1}"
INFERENCE_READY_MAX_ATTEMPTS="${SHARED_SMOKE_INFERENCE_READY_MAX_ATTEMPTS:-120}"
API_READY_MAX_ATTEMPTS="${SHARED_SMOKE_API_READY_MAX_ATTEMPTS:-600}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

for cmd in docker curl jq lsof; do
  require_cmd "$cmd"
done

pick_available_port() {
  local start="$1"
  local end=$((start + 2000))
  local port
  for port in $(seq "${start}" "${end}"); do
    if ! lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "${port}"
      return 0
    fi
  done
  echo "no free tcp port in range ${start}-${end}" >&2
  exit 1
}

resolve_stack_ports() {
  if [[ -z "${STACK_POSTGRES_PORT}" ]]; then
    STACK_POSTGRES_PORT="$(pick_available_port 15432)"
  fi
  if [[ -z "${STACK_REDIS_PORT}" ]]; then
    STACK_REDIS_PORT="$(pick_available_port 16379)"
  fi
  if [[ -z "${STACK_MINIO_PORT}" ]]; then
    STACK_MINIO_PORT="$(pick_available_port 19000)"
  fi
  if [[ -z "${STACK_MINIO_CONSOLE_PORT}" ]]; then
    STACK_MINIO_CONSOLE_PORT="$(pick_available_port "$((STACK_MINIO_PORT + 1))")"
  fi
  if [[ -z "${STACK_INFERENCE_PORT}" ]]; then
    STACK_INFERENCE_PORT="$(pick_available_port 18088)"
  fi
  if [[ -z "${STACK_API_PORT}" ]]; then
    STACK_API_PORT="$(pick_available_port 13000)"
  fi

  if [[ -z "${MINIO_PUBLIC_ENDPOINT}" ]]; then
    MINIO_PUBLIC_ENDPOINT="http://127.0.0.1:${STACK_MINIO_PORT}"
  fi
  if [[ -z "${BASE_URL}" ]]; then
    BASE_URL="http://127.0.0.1:${STACK_API_PORT}"
  fi
  INFERENCE_HEALTH_URL="http://127.0.0.1:${STACK_INFERENCE_PORT}/healthz"
}

idem_key() {
  echo "$1_$(date +%s%N)"
}

to_lower() {
  echo "$1" | tr '[:upper:]' '[:lower:]'
}

request_json() {
  local method="$1"
  local url="$2"
  local token="${3:-}"
  local idempotency="${4:-}"
  local payload="${5:-}"

  local -a curl_args
  curl_args=(-sS -X "$method" "$url" -H "content-type: application/json" -H "x-request-id: req_doc_smoke_$(date +%s%N)")
  if [[ -n "$token" ]]; then
    curl_args+=(-H "authorization: Bearer ${token}")
  fi
  if [[ -n "$idempotency" ]]; then
    curl_args+=(-H "idempotency-key: ${idempotency}")
  fi
  if [[ -n "$payload" ]]; then
    curl_args+=(-d "$payload")
  fi

  curl "${curl_args[@]}"
}

wait_stack_ready() {
  local attempts=0
  until curl -fsS "${INFERENCE_HEALTH_URL}" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge "${INFERENCE_READY_MAX_ATTEMPTS}" ]]; then
      echo "inference-gateway healthz timeout" >&2
      exit 1
    fi
    sleep 1
  done

  attempts=0
  until request_json "POST" "${BASE_URL}/v1/auth/wechat-login" "" "" '{"code":"admin","username":"admin","password":"admin123"}' 2>/dev/null | jq -e '.code == 0' >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge "${API_READY_MAX_ATTEMPTS}" ]]; then
      echo "api-gateway auth readiness timeout" >&2
      exit 1
    fi
    sleep 1
  done
}

generate_doc_sources() {
  local host_dir="${ROOT_DIR}/.runtime/inference-assets/smoke-doc-src"
  mkdir -p "${host_dir}"
  cat > "${host_dir}/source.html" <<'HTML'
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>doc smoke</title></head>
  <body>
    <h1>Remove Watermark Smoke</h1>
    <p>This file is generated for native PDF/PPT smoke testing.</p>
    <p style="position:absolute;left:380px;top:520px;background:#efefef;padding:8px;">WM</p>
  </body>
</html>
HTML

  docker compose -f "${STACK_FILE}" exec -T inference-gateway sh -lc '
    set -e
    mkdir -p /data/assets/smoke-doc-src
    libreoffice --headless --convert-to pdf --outdir /data/assets/smoke-doc-src /data/assets/smoke-doc-src/source.html
    python3 - <<'"'"'PY'"'"'
from pptx import Presentation
from pptx.util import Inches

prs = Presentation()
slide = prs.slides.add_slide(prs.slide_layouts[6])
title = slide.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(8.0), Inches(1.2))
title.text_frame.text = "Remove Watermark Smoke"
body = slide.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(8.5), Inches(1.4))
body.text_frame.text = "This file is generated for native PDF/PPT smoke testing."
wm = slide.shapes.add_textbox(Inches(5.3), Inches(4.8), Inches(2.2), Inches(0.8))
wm.text_frame.text = "WM"
prs.save("/data/assets/smoke-doc-src/source.pptx")
PY
  '

  [[ -f "${host_dir}/source.pdf" ]] || { echo "failed to generate source.pdf" >&2; exit 1; }
  [[ -f "${host_dir}/source.pptx" ]] || { echo "failed to generate source.pptx" >&2; exit 1; }
}

upload_asset() {
  local token="$1"
  local media_type="$2"
  local mime_type="$3"
  local file_path="$4"
  local file_name
  file_name="$(basename "${file_path}")"
  local file_size
  file_size="$(wc -c < "${file_path}" | tr -d ' ')"

  local payload
  payload="$(jq -n \
    --arg fileName "${file_name}" \
    --arg mimeType "${mime_type}" \
    --arg mediaType "${media_type}" \
    --argjson fileSize "${file_size}" \
    '{fileName:$fileName,fileSize:$fileSize,mediaType:$mediaType,mimeType:$mimeType}')"

  local policy
  policy="$(request_json "POST" "${BASE_URL}/v1/assets/upload-policy" "${token}" "" "${payload}")"
  echo "${policy}" | jq -e '.code == 0' >/dev/null

  local asset_id upload_url
  asset_id="$(echo "${policy}" | jq -r '.data.assetId')"
  upload_url="$(echo "${policy}" | jq -r '.data.uploadUrl')"
  local signed_headers_param signed_headers_decoded
  signed_headers_param="$(echo "${upload_url}" | sed -n 's/.*[?&]X-Amz-SignedHeaders=\([^&]*\).*/\1/p')"
  if [[ -z "${signed_headers_param}" ]]; then
    echo "upload policy missing X-Amz-SignedHeaders" >&2
    exit 1
  fi
  signed_headers_decoded="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]))' "${signed_headers_param}")"

  local header_file
  header_file="$(mktemp)"
  echo "${policy}" | jq -r '.data.headers | to_entries[] | select((.value | tostring | length) > 0) | "\(.key): \(.value)"' > "${header_file}"

  local -a header_args
  local signed_headers_csv=";"
  local provided_headers_csv=";"
  header_args=()
  local signed_header_name
  IFS=';' read -r -a signed_header_names <<< "${signed_headers_decoded}"
  for signed_header_name in "${signed_header_names[@]}"; do
    if [[ -n "${signed_header_name}" ]]; then
      signed_headers_csv="${signed_headers_csv}${signed_header_name};"
    fi
  done

  while IFS= read -r line; do
    local header_name
    header_name="$(echo "${line%%:*}" | tr '[:upper:]' '[:lower:]' | xargs)"
    if [[ "${signed_headers_csv}" == *";${header_name};"* ]]; then
      provided_headers_csv="${provided_headers_csv}${header_name};"
      header_args+=(-H "${line}")
    fi
  done < "${header_file}"
  rm -f "${header_file}"

  for signed_header_name in "${signed_header_names[@]}"; do
    if [[ "${signed_header_name}" == "host" ]]; then
      continue
    fi
    if [[ "${provided_headers_csv}" != *";${signed_header_name};"* ]]; then
      echo "missing signed upload header: ${signed_header_name}" >&2
      exit 1
    fi
  done

  local status
  if [[ "${#header_args[@]}" -gt 0 ]]; then
    status="$(
      curl -sS -o /tmp/doc_smoke_upload.out -w "%{http_code}" \
        -X PUT "${upload_url}" \
        "${header_args[@]}" \
        --upload-file "${file_path}"
    )"
  else
    status="$(
      curl -sS -o /tmp/doc_smoke_upload.out -w "%{http_code}" \
        -X PUT "${upload_url}" \
        --upload-file "${file_path}"
    )"
  fi

  if [[ "${status}" != "200" && "${status}" != "204" ]]; then
    echo "upload failed: status=${status}" >&2
    cat /tmp/doc_smoke_upload.out >&2 || true
    exit 1
  fi

  echo "${asset_id}"
}

create_task_and_wait() {
  local token="$1"
  local media_type="$2"
  local asset_id="$3"

  local create_payload
  create_payload="$(jq -n --arg assetId "${asset_id}" --arg mediaType "${media_type}" '{assetId:$assetId,mediaType:$mediaType,taskPolicy:"FAST"}')"
  local create_resp
  create_resp="$(request_json "POST" "${BASE_URL}/v1/tasks" "${token}" "$(idem_key "idem_doc_create_$(to_lower "${media_type}")")" "${create_payload}")"
  echo "${create_resp}" | jq -e '.code == 0' >/dev/null
  local task_id
  task_id="$(echo "${create_resp}" | jq -r '.data.taskId')"

  local regions_payload
  regions_payload="$(jq -n \
    --arg mediaType "${media_type}" \
    '{version:0,mediaType:$mediaType,schemaVersion:"gemini-box-2d/v1",regions:[{pageIndex:0,box_2d:[380,520,460,580]}]}')"
  local regions_resp
  regions_resp="$(request_json "POST" "${BASE_URL}/v1/tasks/${task_id}/regions" "${token}" "$(idem_key "idem_doc_regions_$(to_lower "${media_type}")")" "${regions_payload}")"
  echo "${regions_resp}" | jq -e '.code == 0' >/dev/null

  local attempt
  for attempt in $(seq 1 "${MAX_POLL}"); do
    local detail
    detail="$(request_json "GET" "${BASE_URL}/v1/tasks/${task_id}" "${token}")"
    local status
    status="$(echo "${detail}" | jq -r '.data.status')"
    if [[ "${status}" == "SUCCEEDED" ]]; then
      local result
      result="$(request_json "GET" "${BASE_URL}/v1/tasks/${task_id}/result" "${token}")"
      echo "${result}" | jq -e '.code == 0' >/dev/null
      local result_url
      result_url="$(echo "${result}" | jq -r '.data.resultUrl')"
      echo "[doc-smoke] ${media_type} succeeded task=${task_id} resultUrl=${result_url}"
      return 0
    fi
    if [[ "${status}" == "FAILED" || "${status}" == "CANCELED" ]]; then
      echo "[doc-smoke] ${media_type} terminal status=${status} task=${task_id}" >&2
      echo "${detail}" | jq . >&2
      return 1
    fi
    sleep "${POLL_INTERVAL_SEC}"
  done

  echo "[doc-smoke] ${media_type} timeout waiting task" >&2
  return 1
}

main() {
  resolve_stack_ports
  echo "[doc-smoke] ports postgres=${STACK_POSTGRES_PORT} redis=${STACK_REDIS_PORT} minio=${STACK_MINIO_PORT} minio_console=${STACK_MINIO_CONSOLE_PORT} inference=${STACK_INFERENCE_PORT} api=${STACK_API_PORT}"
  echo "[doc-smoke] boot local stack"
  export STACK_POSTGRES_PORT STACK_REDIS_PORT STACK_MINIO_PORT STACK_MINIO_CONSOLE_PORT STACK_INFERENCE_PORT STACK_API_PORT MINIO_PUBLIC_ENDPOINT
  INFERENCE_MODEL_MODE=native docker compose --progress=plain -f "${STACK_FILE}" build inference-gateway
  INFERENCE_MODEL_MODE=native docker compose -f "${STACK_FILE}" up -d minio minio-init postgres redis inference-gateway api-gateway worker-orchestrator
  wait_stack_ready

  echo "[doc-smoke] generate local PDF/PPT source files inside inference container"
  generate_doc_sources

  local login_resp token
  login_resp="$(request_json "POST" "${BASE_URL}/v1/auth/wechat-login" "" "" '{"code":"admin","username":"admin","password":"admin123"}')"
  token="$(echo "${login_resp}" | jq -r '.data.accessToken')"
  [[ -n "${token}" && "${token}" != "null" ]] || { echo "login failed" >&2; exit 1; }

  local pdf_asset ppt_asset
  pdf_asset="$(upload_asset "${token}" "pdf" "application/pdf" "${ROOT_DIR}/.runtime/inference-assets/smoke-doc-src/source.pdf")"
  ppt_asset="$(upload_asset "${token}" "ppt" "application/vnd.openxmlformats-officedocument.presentationml.presentation" "${ROOT_DIR}/.runtime/inference-assets/smoke-doc-src/source.pptx")"
  echo "[doc-smoke] uploaded assets pdf=${pdf_asset} ppt=${ppt_asset}"

  create_task_and_wait "${token}" "PDF" "${pdf_asset}"
  create_task_and_wait "${token}" "PPT" "${ppt_asset}"

  echo "[doc-smoke] PDF/PPT native smoke passed"
}

main "$@"
