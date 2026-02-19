import { Controller, Get } from "@nestjs/common";

@Controller("v1/system")
export class SystemController {
  @Get("capabilities")
  getCapabilities() {
    return {
      code: 0,
      message: "ok",
      requestId: crypto.randomUUID(),
      data: {
        models: ["lama-v1", "sd-inpaint-v1"],
        renderers: ["pdfium", "poppler", "pymupdf", "libreoffice-pdf"],
        videoPipelines: ["frame-fast", "temporal-quality"],
        riskFlags: [],
        defaults: {
          imagePolicy: "FAST",
          videoPolicy: "FAST",
          rendererFallback: ["pdfium", "poppler", "pymupdf"]
        }
      }
    };
  }
}
