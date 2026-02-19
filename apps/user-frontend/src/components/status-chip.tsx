import { Text } from "@tarojs/components";
import type { TaskStatus } from "@packages/contracts";

interface StatusChipProps {
  status: TaskStatus;
}

export function StatusChip({ status }: StatusChipProps) {
  return <Text>{status}</Text>;
}
