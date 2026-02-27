import Taro from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/modules/common/page-shell";
import { useAuthStore } from "@/stores/auth.store";
import { listTasks } from "@/services/task";
import "./index.scss";

export default function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state: any) => state.clearSession);

  // 拉取用户任务统计
  const tasksQuery = useQuery({
    queryKey: ["account-tasks-summary"],
    queryFn: listTasks,
    enabled: !!user
  });

  const totalTasks = tasksQuery.data?.data.items.length || 0;
  const succeededTasks = tasksQuery.data?.data.items.filter(
    (t: any) => t.status === "SUCCEEDED"
  ).length || 0;

  const handleLogout = () => {
    Taro.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      confirmText: "退出",
      cancelText: "取消",
      confirmColor: "#ef4444",
      success: (res) => {
        if (res.confirm) {
          clearSession();
          Taro.switchTab({ url: "/pages/home/index" });
        }
      }
    });
  };

  const goLogin = () => {
    Taro.navigateTo({ url: "/pages/login/index" });
  };

  const menuItems = [
    {
      icon: "📋",
      label: "处理记录",
      desc: "查看所有任务历史",
      action: () => Taro.switchTab({ url: "/pages/tasks/index" })
    },
    {
      icon: "💡",
      label: "使用帮助",
      desc: "了解如何高效去水印",
      action: () =>
        Taro.showModal({
          title: "使用帮助",
          content:
            "1. 在首页点击上传图片\n2. 在编辑器中涂抹水印区域\n3. 点击一键消除\n4. 等待 AI 处理完成\n5. 预览并保存结果",
          showCancel: false,
          confirmText: "知道了"
        })
    },
    {
      icon: "⚙️",
      label: "清除缓存",
      desc: "释放本地存储空间",
      action: () => {
        Taro.clearStorage();
        Taro.showToast({ title: "缓存已清除", icon: "success" });
      }
    },
    {
      icon: "📝",
      label: "意见反馈",
      desc: "帮助我们做得更好",
      action: () =>
        Taro.showModal({
          title: "意见反馈",
          content: "如有问题或建议，请发送邮件至 support@removewm.com",
          showCancel: false,
          confirmText: "好的"
        })
    },
    {
      icon: "ℹ️",
      label: "关于",
      desc: "版本 v1.0.0",
      action: () =>
        Taro.showModal({
          title: "关于去水印",
          content: "版本：v1.0.0\n基于 AI 推理引擎的智能水印擦除工具。",
          showCancel: false,
          confirmText: "好的"
        })
    }
  ];

  return (
    <PageShell title="我的" subtitle="个人中心">
      {/* ═══ 用户头像卡 ═══ */}
      <View className="profile-card animate-fade-in">
        <View className="profile-avatar">
          <Text className="profile-avatar-emoji">👤</Text>
        </View>
        <View className="profile-info">
          <Text className="profile-name">
            {user?.userId || "未登录"}
          </Text>
          <Text className="profile-status">
            {user ? `📱 ${(user as any).phone || "已登录"}` : "请登录以使用完整功能"}
          </Text>
        </View>
      </View>

      {/* 未登录引导 */}
      {!user && (
        <View
          onClick={goLogin}
          style={{
            margin: "0 0 16px",
            padding: "16px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            textAlign: "center",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(99,102,241,0.35)"
          }}
        >
          🚀 登录 / 注册，开启 AI 去水印
        </View>
      )}

      {/* ═══ 数据面板 ═══ */}
      <View className="stats-row animate-slide-up" style={{ animationDelay: "0.05s" }}>
        <View className="stats-item">
          <Text className="stats-number">{totalTasks}</Text>
          <Text className="stats-label">总任务</Text>
        </View>
        <View className="stats-divider" />
        <View className="stats-item">
          <Text className="stats-number">{succeededTasks}</Text>
          <Text className="stats-label">已完成</Text>
        </View>
        <View className="stats-divider" />
        <View className="stats-item">
          <Text className="stats-number">
            {user ? String((user as any).quotaLeft ?? "-") : "∞"}
          </Text>
          <Text className="stats-label">剩余配额</Text>
        </View>
      </View>

      {/* ═══ 功能菜单 ═══ */}
      <View className="menu-section animate-slide-up" style={{ animationDelay: "0.1s" }}>
        {menuItems.map((item, index) => (
          <View
            key={index}
            className="menu-item"
            onClick={item.action}
          >
            <Text className="menu-item-icon">{item.icon}</Text>
            <View className="menu-item-body">
              <Text className="menu-item-label">{item.label}</Text>
              <Text className="menu-item-desc">{item.desc}</Text>
            </View>
            <Text className="menu-item-arrow">›</Text>
          </View>
        ))}
      </View>

      {/* ═══ 退出登录 ═══ */}
      {user && (
        <View
          onClick={handleLogout}
          style={{
            margin: "16px 0 24px",
            padding: "14px",
            borderRadius: "14px",
            border: "1.5px solid rgba(239,68,68,0.25)",
            color: "#ef4444",
            textAlign: "center",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            background: "rgba(239,68,68,0.04)"
          }}
        >
          退出登录
        </View>
      )}
    </PageShell>
  );
}
