import { Text } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";

export default function ResultPage() {
  return (
    <PageShell title="结果下载" subtitle="仅使用签名 URL，避免永久直链泄露">
      <Text>结果预览与下载入口将接入 /v1/tasks/{'{taskId}'}/result。</Text>
    </PageShell>
  );
}
