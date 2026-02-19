import Taro from "@tarojs/taro";
import { Button, View } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";

export default function HomePage() {
  return (
    <PageShell title="去水印工作台" subtitle="上传 -> 处理 -> 下载">
      <View>
        <Button onClick={() => Taro.navigateTo({ url: "/pages/editor/index" })}>开始处理素材</Button>
      </View>
    </PageShell>
  );
}
