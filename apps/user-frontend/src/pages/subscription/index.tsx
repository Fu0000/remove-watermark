import { Text } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";

export default function SubscriptionPage() {
  return (
    <PageShell title="套餐与订阅" subtitle="权益、配额、账单将对齐统一契约">
      <Text>待接入 /v1/plans /v1/subscriptions/me /v1/usage/me。</Text>
    </PageShell>
  );
}
