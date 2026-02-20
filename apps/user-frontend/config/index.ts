import { defineConfig } from "@tarojs/cli";
import path from "node:path";

export default defineConfig({
  projectName: "remove-watermark-user-frontend",
  date: "2026-02-19",
  designWidth: 375,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: "src",
  outputRoot: `dist/${process.env.TARO_ENV || "h5"}`,
  alias: {
    "@": path.resolve(__dirname, "..", "src")
  },
  framework: "react",
  compiler: {
    type: "webpack5"
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {}
      }
    }
  },
  h5: {
    publicPath: "/",
    staticDirectory: "static"
  }
});
