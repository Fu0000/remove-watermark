import { PropsWithChildren } from "react";
import { View, Text } from "@tarojs/components";
import { platformLabel, platformClassName } from "@/utils/platform";

interface PageShellProps {
  title: string;
  subtitle?: string;
}

export function PageShell({ title, subtitle, children }: PropsWithChildren<PageShellProps>) {
  return (
    <View className={`container ${platformClassName()}`}>
      <View className="card">
        <Text>{title}</Text>
        {subtitle ? <View><Text>{subtitle}</Text></View> : null}
        <View><Text>当前端：{platformLabel()}</Text></View>
      </View>
      <View className="card">{children}</View>
    </View>
  );
}
