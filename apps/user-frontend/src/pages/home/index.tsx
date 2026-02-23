import { useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { wechatLogin } from "@/services/auth";
import { ApiError } from "@/services/http";
import { useAuthStore } from "@/stores/auth.store";
import { API_BASE_URL, SHARED_AUTH_CODE, SHARED_PASSWORD, SHARED_USERNAME } from "@/config/runtime";
import "./index.scss";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);

  const handleStart = async () => {
    setLoading(true);
    setErrorText("");
    try {
      if (!user) {
        const response = await wechatLogin({
          code: SHARED_AUTH_CODE,
          username: SHARED_USERNAME,
          password: SHARED_PASSWORD
        });
        setSession(response.data);
      }

      Taro.navigateTo({ url: "/pages/editor/index" });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorText(`${error.code} ${error.message}`);
      } else {
        setErrorText("登录失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoSubscription = () => {
    void Taro.navigateTo({ url: "/pages/subscription/index" });
  };

  const handleGoLab = () => {
    void Taro.navigateTo({ url: "/pages/lab/index" });
  };

  return (
    <PageShell title="去水印工作台" subtitle="上传 -> 处理 -> 下载">
      <View className="home-status">
        <Text className="home-status-label">{user ? "已登录" : "未登录"}</Text>
        <Text className="home-status-value">{user ? `${user.userId}（${user.planId}）` : "首次进入会自动创建联调会话"}</Text>
      </View>
      <View className="home-status">
        <Text className="home-status-label">当前 API</Text>
        <Text className="home-status-value">{API_BASE_URL}</Text>
      </View>
      <View className="home-status">
        <Text className="home-status-label">剩余额度</Text>
        <Text className="home-status-value">{user ? String(user.quotaLeft) : "-"}</Text>
      </View>
      <View className="home-actions">
        <Button className="home-btn home-btn-primary" loading={loading} onClick={handleStart}>
          {user ? "进入上传编辑" : "登录并开始"}
        </Button>
      </View>
      <View className="home-actions">
        <Button className="home-btn home-btn-ghost" onClick={handleGoSubscription}>
          套餐与订阅
        </Button>
      </View>
      <View className="home-actions">
        <Button className="home-btn home-btn-ghost" onClick={handleGoLab}>
          联调实验室（4 媒体）
        </Button>
      </View>
      {errorText ? (
        <View className="home-error">
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
