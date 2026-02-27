import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Input, Text } from "@tarojs/components";
import { login } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/services/http";
import "./index.scss";

export default function LoginPage() {
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const setSession = useAuthStore((state: any) => state.setSession);

    const handleLogin = async () => {
        if (!phone.trim() || !password.trim()) {
            setError("请输入手机号和密码");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await login(phone.trim(), password);
            setSession(res.data);
            // 返回首页
            Taro.switchTab({ url: "/pages/home/index" });
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message || "登录失败，请重试");
            } else {
                setError("网络错误，请检查连接后重试");
            }
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => {
        const pages = Taro.getCurrentPages();
        if (pages.length > 1) {
            Taro.navigateBack();
        } else {
            Taro.reLaunch({ url: "/pages/home/index" });
        }
    };

    const goRegister = () => {
        Taro.navigateTo({ url: "/pages/register/index" });
    };

    return (
        <View className="login-page">
            {/* 返回按钮 */}
            <View
                onClick={goBack}
                style={{
                    position: "absolute",
                    top: "20px",
                    left: "20px",
                    width: "36px",
                    height: "36px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    cursor: "pointer",
                    fontSize: "20px",
                    color: "#fff",
                    zIndex: 10
                }}
            >
                ‹
            </View>
            {/* 顶部品牌区 */}
            <View className="login-hero">
                <View className="login-logo">✨</View>
                <Text className="login-title">智能去水印</Text>
                <Text className="login-subtitle">登录后享受 AI 一键消除服务</Text>
            </View>

            {/* 表单卡片 */}
            <View className="login-card">
                <View className="login-form">
                    <View className="form-group">
                        <Text className="form-label">手机号</Text>
                        <Input
                            className="form-input"
                            type="number"
                            placeholder="请输入手机号"
                            value={phone}
                            onInput={(e) => setPhone(e.detail.value)}
                            maxlength={11}
                        />
                    </View>

                    <View className="form-group">
                        <Text className="form-label">密码</Text>
                        <Input
                            className="form-input"
                            type="safe-password"
                            password
                            placeholder="请输入密码"
                            value={password}
                            onInput={(e) => setPassword(e.detail.value)}
                            maxlength={64}
                        />
                    </View>

                    {error ? (
                        <View className="form-error">{error}</View>
                    ) : null}

                    <View
                        className={`login-btn ${loading ? "login-btn-loading" : ""}`}
                        onClick={loading ? undefined : handleLogin}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "52px",
                            borderRadius: "26px",
                            background: loading
                                ? "rgba(99,102,241,0.5)"
                                : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                            color: "#fff",
                            fontSize: "16px",
                            fontWeight: "600",
                            cursor: loading ? "not-allowed" : "pointer",
                            marginTop: "8px",
                            boxShadow: "0 4px 15px rgba(99,102,241,0.4)"
                        }}
                    >
                        {loading ? "登录中..." : "登 录"}
                    </View>
                </View>

                {/* 底部链接区 */}
                <View className="login-footer">
                    <Text className="footer-text">还没有账号？</Text>
                    <Text className="footer-link" onClick={goRegister}>
                        立即注册
                    </Text>
                </View>

                {/* 微信登录占位 */}
                <View className="wechat-divider">
                    <View className="divider-line" />
                    <Text className="divider-text">或</Text>
                    <View className="divider-line" />
                </View>
                <View
                    className="wechat-btn"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "48px",
                        borderRadius: "24px",
                        border: "1px solid #e2e8f0",
                        color: "#94a3b8",
                        fontSize: "15px",
                        cursor: "not-allowed",
                        gap: "8px",
                        background: "#f8fafc"
                    }}
                >
                    <Text style={{ fontSize: "20px" }}>💬</Text>
                    <Text>微信登录（即将上线）</Text>
                </View>
            </View>
        </View>
    );
}
