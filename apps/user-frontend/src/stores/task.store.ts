import { create } from "zustand";
import type { TaskStatus } from "@packages/contracts";

interface TaskState {
  taskId?: string;
  status: TaskStatus;
  setTask: (taskId: string, status: TaskStatus) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  status: "UPLOADED",
  setTask: (taskId, status) => set({ taskId, status })
}));
