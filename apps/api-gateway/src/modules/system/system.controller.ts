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

    return ok(
      {
        models: ["lama-v1", "sd-inpaint-v1"],
        renderers: ["pdfium", "poppler", "pymupdf", "libreoffice-pdf"],
        videoPipelines: ["frame-fast", "temporal-quality"],
        riskFlags: [],
        defaults: {
          imagePolicy: "FAST",
          videoPolicy: "FAST",
          rendererFallback: ["pdfium", "poppler", "pymupdf"]
        }
      },
      requestIdHeader
    );
  }
}
