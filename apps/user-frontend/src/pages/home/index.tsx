import { useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { wechatLogin } from "@/services/auth";
import { ApiError } from "@/services/http";
import { useAuthStore } from "@/stores/auth.store";
import { useMediaStore } from "@/stores/media.store";
import { isH5 } from "@/utils/platform";
import { SHARED_AUTH_CODE, SHARED_PASSWORD, SHARED_USERNAME } from "@/config/runtime";
import "./index.scss";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const user = useAuthStore((state: any) => state.user);
  const setSession = useAuthStore((state: any) => state.setSession);
  const setMedia = useMediaStore((state: any) => state.setMedia);

  const performLoginIfNeeded = async () => {
    if (user) return true;
    try {
      const response = await wechatLogin({
        code: SHARED_AUTH_CODE,
        username: SHARED_USERNAME,
        password: SHARED_PASSWORD
      });
      setSession(response.data);
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("网络初始化失败，请稍后重试");
      }
      return false;
    }
  };

  const pickMediaForH5 = (accept: string) =>
    new Promise<boolean>((resolve) => {
      if (typeof document === "undefined") {
        resolve(false);
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(false);
          return;
        }
        const url = URL.createObjectURL(file);
        setMedia("IMAGE", {
          fileName: file.name || "image.png",
          fileSize: file.size || 1,
          mimeType: file.type || "image/png",
          sourcePath: url
        });
        resolve(true);
      };
      input.click();
    });

  const pickMediaForTaro = async () => {
    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed", "original"],
        sourceType: ["album", "camera"]
      });
      const path = result.tempFilePaths?.[0];
      if (!path) return false;

      const fileRecord = result.tempFiles?.[0] as { size?: number; type?: string } | undefined;
      const fallbackName = path.split("/").pop() || "image.png";

      setMedia("IMAGE", {
        fileName: fallbackName,
        fileSize: fileRecord?.size || 1,
        mimeType: fileRecord?.type || "image/png",
        sourcePath: path
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleStartPick = async () => {
    setLoading(true);
    setErrorText("");

    // Ensure auth first
    const loggedIn = await performLoginIfNeeded();
    if (!loggedIn) {
      setLoading(false);
      return;
    }

    // Pick media
    const picked = isH5() ? await pickMediaForH5("image/*") : await pickMediaForTaro();
    setLoading(false);

    // If successfully picked, go to editor
    if (picked) {
      Taro.navigateTo({ url: "/pages/editor/index" });
    }
  };

  const handleGoSubscription = () => {
    void Taro.navigateTo({ url: "/pages/subscription/index" });
  };

  const handleGoLab = () => {
    void Taro.navigateTo({ url: "/pages/lab/index" });
  };

  return (
    <PageShell title="超纯净去水印" subtitle="AI 像素级抹除 / 智能瑕疵修复">
      <View className="home-dashboard-container animate-slide-up" style={{ animationDelay: "0.1s" }}>

        <View className="home-main-cta">
          <Button
            className="home-btn-huge-start"
            loading={loading}
            onClick={handleStartPick}
          >
            <Text className="home-btn-huge-icon">📸</Text>
            <Text className="home-btn-huge-text">极速上传 · 开始消除</Text>
          </Button>
          <Text className="home-main-hint">支持 JPG/PNG/HEIC，最高 4K 分辨率处理无损画质。</Text>
        </View>

        <View className="home-stats-grid">
          <View className="home-stats-panel">
            <Text className="home-status-label">当前账户</Text>
            <Text className="home-status-value">{user ? `${user.userId}` : "自动联接"}</Text>
          </View>
          <View className="home-stats-panel">
            <Text className="home-status-label">算力配额</Text>
            <Text className="home-status-value">{user ? String(user.quotaLeft) : "-"}</Text>
          </View>
        </View>

        <View className="home-nav-actions">
          <Button className="home-btn home-btn-ghost" onClick={handleGoSubscription}>
            了解订阅与高阶面源计划
          </Button>
          <Button className="home-btn home-btn-ghost" onClick={handleGoLab}>
            多端联调实验室 🧪
          </Button>
        </View>

        {errorText ? (
          <View className="home-error">
            <Text>{errorText}</Text>
          </View>
        ) : null}
      </View>
    </PageShell>
  );
}
