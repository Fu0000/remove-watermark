import { create } from "zustand";

export interface SelectedMedia {
    fileName: string;
    fileSize: number;
    mimeType: string;
    sourcePath: string; // 本地选择的文件路径（临时地址）
}

export type MediaType = "IMAGE" | "VIDEO";

interface MediaState {
    mediaType: MediaType;
    selectedMedia: SelectedMedia | null;
    setMedia: (type: MediaType, media: SelectedMedia) => void;
    reset: () => void;
}

export const useMediaStore = create<MediaState>((set) => ({
    mediaType: "IMAGE",
    selectedMedia: null,
    setMedia: (mediaType, selectedMedia) => set({ mediaType, selectedMedia }),
    reset: () => set({ mediaType: "IMAGE", selectedMedia: null })
}));
