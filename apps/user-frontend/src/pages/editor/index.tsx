import { useState } from "react";
import { Button, View, Text } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";

export default function EditorPage() {
  const [agreement, setAgreement] = useState(false);

  return (
    <PageShell title="上传与编辑" subtitle="多端同构：统一业务逻辑，按端适配交互细节">
      <View>
        <Text>上传前请确认素材权属授权。</Text>
      </View>
      <View>
        <Button onClick={() => setAgreement((v) => !v)}>
          {agreement ? "已勾选授权声明" : "勾选授权声明"}
        </Button>
      </View>
    </PageShell>
  );
}
