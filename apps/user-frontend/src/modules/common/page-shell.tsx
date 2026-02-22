import { PropsWithChildren } from "react";
import { View, Text } from "@tarojs/components";
import { platformLabel, platformClassName } from "@/utils/platform";
import "./page-shell.scss";

interface PageShellProps {
  title: string;
  subtitle?: string;
}

export function PageShell({ title, subtitle, children }: PropsWithChildren<PageShellProps>) {
  return (
    <View className={`page-shell container ${platformClassName()}`}>
      <View className="page-shell__hero card">
        <Text className="page-shell__title">{title}</Text>
        {subtitle ? (
          <View>
            <Text className="page-shell__subtitle">{subtitle}</Text>
          </View>
        ) : null}
        <View>
          <Text className="page-shell__meta">当前端：{platformLabel()}</Text>
        </View>
      </View>
      <View className="page-shell__body card">{children}</View>
    </View>
  );
}
