import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Input, Text } from "@tarojs/components";
import { register } from "@/services/auth";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/services/http";
import "./index.scss";

export default function RegisterPage() {
    const [inviteCode, setInviteCode] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const setSession = useAuthStore((state: any) => state.setSession);

    const handleRegister = async () => {
        if (!inviteCode.trim()) { setError("请输入邀请码"); return; }
        if (!phone.trim()) { setError("请输入手机号"); return; }
        if (password.length < 6) { setError("密码至少 6 位"); return; }
        if (password !== confirmPassword) { setError("两次密码不一致"); return; }

        setLoading(true);
        setError("");
        try {
            const res = await register(inviteCode.trim(), phone.trim(), password);
            setSession(res.data);
            Taro.switchTab({ url: "/pages/home/index" });
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message || "注册失败，请重试");
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
            Taro.reLaunch({ url: "/pages/login/index" });
        }
    };

    const goLogin = () => {
        Taro.navigateBack();
    };

    return (
        <View className="register-page">
            {/* 返回按钮 */}
            <View
                onClick={goBack}
                style={{
                    position: "absolute",
                    top: "env(safe-area-inset-top, 20px)",
                    left: "16px",
                    marginTop: "12px",
                    width: "44px",
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.25)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    cursor: "pointer",
                    fontSize: "24px",
                    color: "#fff",
                    zIndex: 10,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                }}
            >
                ‹
            </View>
            {/* 顶部品牌区 */}
            <View className="register-hero">
                <View className="register-logo">🎯</View>
                <Text className="register-title">创建账号</Text>
                <Text className="register-subtitle">使用邀请码开始使用智能去水印</Text>
            </View>

            {/* 表单卡片 */}
            <View className="register-card">
                <View className="register-form">
                    <View className="form-group">
                        <Text className="form-label">邀请码</Text>
                        <Input
                            className="form-input"
                            type="text"
                            placeholder="请输入邀请码（如 INVITE2024）"
                            value={inviteCode}
                            onInput={(e) => setInviteCode(e.detail.value)}
                            maxlength={32}
                        />
                    </View>

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
                            placeholder="至少 6 位"
                            value={password}
                            onInput={(e) => setPassword(e.detail.value)}
                            maxlength={64}
                        />
                    </View>

                    <View className="form-group">
                        <Text className="form-label">确认密码</Text>
                        <Input
                            className="form-input"
                            type="safe-password"
                            password
                            placeholder="再次输入密码"
                            value={confirmPassword}
                            onInput={(e) => setConfirmPassword(e.detail.value)}
                            maxlength={64}
                        />
                    </View>

                    {error ? (
                        <View className="form-error">{error}</View>
                    ) : null}

                    <View
                        onClick={loading ? undefined : handleRegister}
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
                        {loading ? "注册中..." : "立即注册"}
                    </View>
                </View>

                {/* 底部链接 */}
                <View className="register-footer">
                    <Text className="footer-text">已有账号？</Text>
                    <Text className="footer-link" onClick={goLogin}>
                        返回登录
                    </Text>
                </View>
            </View>
        </View>
    );
}
