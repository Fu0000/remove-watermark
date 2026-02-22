import { Controller, Get, Headers } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { ok } from "../../common/http-response";

@Controller("v1/system")
export class SystemController {
  @Get("capabilities")
  getCapabilities(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    const models = readCsv("SYSTEM_MODELS", ["lama-v1", "sd-inpaint-v1", "propainter-v1"]);
    const renderers = readCsv("SYSTEM_RENDERERS", ["pdfium", "poppler", "pymupdf", "libreoffice-pdf"]);
    const videoPipelines = readCsv("SYSTEM_VIDEO_PIPELINES", ["frame-fast", "temporal-quality"]);
    const riskFlags = readCsv("SYSTEM_RISK_FLAGS", ["MODEL_LICENSE_REVIEW_PENDING"]);

    return ok(
      {
        models,
        renderers,
        videoPipelines,
        riskFlags,
        defaults: {
          taskPolicy: readString("SYSTEM_DEFAULT_TASK_POLICY", "FAST"),
          imageModel: readString("SYSTEM_DEFAULT_IMAGE_MODEL", models[0] || "lama-v1"),
          videoPipeline: readString("SYSTEM_DEFAULT_VIDEO_PIPELINE", videoPipelines[0] || "frame-fast"),
          rendererRoute: readCsv("SYSTEM_DEFAULT_RENDERER_ROUTE", ["pdfium", "poppler", "pymupdf"])
        }
      },
      requestIdHeader
    );
  }
}

function readCsv(name: string, fallback: string[]) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function readString(name: string, fallback: string) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value.trim();
}
