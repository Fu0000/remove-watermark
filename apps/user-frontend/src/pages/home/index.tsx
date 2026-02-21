import { useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { wechatLogin } from "@/services/auth";
import { ApiError } from "@/services/http";
import { useAuthStore } from "@/stores/auth.store";
import { API_BASE_URL, SHARED_AUTH_CODE, SHARED_PASSWORD, SHARED_USERNAME } from "@/config/runtime";

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

  return (
    <PageShell title="去水印工作台" subtitle="上传 -> 处理 -> 下载">
      <View>
        <Text>{user ? `已登录：${user.userId}（${user.planId}）` : "未登录"}</Text>
      </View>
      <View>
        <Text>{user ? `剩余额度：${user.quotaLeft}` : "首次进入会自动创建联调会话"}</Text>
      </View>
      <View>
        <Text>当前 API：{API_BASE_URL}</Text>
      </View>
      <View>
        <Button loading={loading} onClick={handleStart}>
          {user ? "进入上传编辑" : "登录并开始"}
        </Button>
      </View>
      {errorText ? (
        <View>
          <Text>{errorText}</Text>
        </View>
      ) : null}
    </PageShell>
  );
}
