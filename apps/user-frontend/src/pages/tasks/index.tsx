import { View, Text } from "@tarojs/components";
import { PageShell } from "@/modules/common/page-shell";
import { useTaskStore } from "@/stores/task.store";

export default function TasksPage() {
  const { taskId, status } = useTaskStore();

  return (
    <PageShell title="任务中心" subtitle="状态机字面量与后端完全一致">
      <View>
        <Text>taskId: {taskId || "-"}</Text>
      </View>
      <View>
        <Text>status: {status}</Text>
      </View>
    </PageShell>
  );
}
