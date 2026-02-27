import { useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { useAuthStore } from "@/stores/auth.store";
import { useMediaStore } from "@/stores/media.store";
import { isH5 } from "@/utils/platform";
import "./index.scss";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const user = useAuthStore((state: any) => state.user);
  const setMedia = useMediaStore((state: any) => state.setMedia);

  /** 如果未登录，跳转到登录页；已登录返回 true */
  const requireLogin = (): boolean => {
    if (user) return true;
    // navigateTo forbidden from tabBar pages in Taro H5
    Taro.reLaunch({ url: "/pages/login/index" });
    return false;
  };

  // 从视频文件抽取首帧作为画板背景
  const extractVideoFirstFrame = (videoUrl: string): Promise<{ dataUrl: string; width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        video.currentTime = 0.1; // seek to 0.1s to avoid black frame
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve({
              dataUrl: canvas.toDataURL("image/jpeg", 0.85),
              width: canvas.width,
              height: canvas.height
            });
          } else {
            reject(new Error("canvas not supported"));
          }
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(videoUrl);
        }
      };
      video.onerror = () => reject(new Error("video load failed"));
      video.src = videoUrl;
    });

  // H5 模式选择图片
  const pickImageForH5 = () =>
    new Promise<boolean>((resolve) => {
      if (typeof document === "undefined") { resolve(false); return; }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(false); return; }
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
          setMedia("IMAGE", {
            fileName: file.name || "image.png",
            fileSize: file.size || 1,
            mimeType: file.type || "image/png",
            sourcePath: url,
            file,
            imageWidth: img.naturalWidth || 1920,
            imageHeight: img.naturalHeight || 1080
          });
          resolve(true);
        };
        img.onerror = () => {
          setMedia("IMAGE", { fileName: file.name || "image.png", fileSize: file.size || 1, mimeType: file.type || "image/png", sourcePath: url, file });
          resolve(true);
        };
        img.src = url;
      };
      input.click();
    });

  // H5 模式选择视频
  const pickVideoForH5 = () =>
    new Promise<boolean>((resolve) => {
      if (typeof document === "undefined") { resolve(false); return; }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.style.display = "none";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(false); return; }
        const videoUrl = URL.createObjectURL(file);
        try {
          const frame = await extractVideoFirstFrame(videoUrl);
          setMedia("VIDEO", {
            fileName: file.name || "video.mp4",
            fileSize: file.size || 1,
            mimeType: file.type || "video/mp4",
            sourcePath: frame.dataUrl, // 首帧 dataURL 作为画板背景
            file,
            imageWidth: frame.width,
            imageHeight: frame.height
          });
        } catch {
          // 如果首帧抽取失败，仍然存储视频但不设背景
          setMedia("VIDEO", {
            fileName: file.name || "video.mp4",
            fileSize: file.size || 1,
            mimeType: file.type || "video/mp4",
            sourcePath: videoUrl,
            file
          });
        }
        resolve(true);
      };
      input.click();
    });

  const pickImageForTaro = async () => {
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

  const pickVideoForTaro = async () => {
    try {
      const result = await Taro.chooseVideo({
        sourceType: ["album", "camera"],
        compressed: true,
        maxDuration: 120
      });
      if (!result.tempFilePath) return false;
      const fallbackName = result.tempFilePath.split("/").pop() || "video.mp4";
      setMedia("VIDEO", {
        fileName: fallbackName,
        fileSize: result.size || 1,
        mimeType: "video/mp4",
        sourcePath: result.thumbTempFilePath || result.tempFilePath,
        imageWidth: result.width || 1920,
        imageHeight: result.height || 1080
      });
      return true;
    } catch {
      return false;
    }
  };

  const handlePickImage = async () => {
    setLoading(true);
    setErrorText("");
    const loggedIn = requireLogin();
    if (!loggedIn) { setLoading(false); return; }
    const picked = isH5() ? await pickImageForH5() : await pickImageForTaro();
    setLoading(false);
    if (picked) Taro.navigateTo({ url: "/pages/editor/index" });
  };

  const handlePickVideo = async () => {
    setLoading(true);
    setErrorText("");
    const loggedIn = requireLogin();
    if (!loggedIn) { setLoading(false); return; }
    const picked = isH5() ? await pickVideoForH5() : await pickVideoForTaro();
    setLoading(false);
    if (picked) Taro.navigateTo({ url: "/pages/editor/index" });
  };

  return (
    <PageShell title="超纯净去水印" subtitle="AI 像素级抹除 / 智能瑕疵修复">
      <View className="home-dashboard-container animate-slide-up" style={{ animationDelay: "0.1s" }}>

        <View className="home-main-cta">
          <View className="home-dual-btns">
            <Button
              className="home-btn-huge-start"
              loading={loading}
              onClick={handlePickImage}
            >
              <Text className="home-btn-huge-icon">📸</Text>
              <Text className="home-btn-huge-text">图片去水印</Text>
            </Button>
            <Button
              className="home-btn-huge-start home-btn-video"
              loading={loading}
              onClick={handlePickVideo}
            >
              <Text className="home-btn-huge-icon">🎬</Text>
              <Text className="home-btn-huge-text">视频去水印</Text>
            </Button>
          </View>
          <Text className="home-main-hint">支持 JPG/PNG/HEIC/MP4/MOV，最高 4K 分辨率处理无损画质。</Text>
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

        {errorText ? (
          <View className="home-error">
            <Text>{errorText}</Text>
          </View>
        ) : null}
      </View>
    </PageShell>
  );
}
