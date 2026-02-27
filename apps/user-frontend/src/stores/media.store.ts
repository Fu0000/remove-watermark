import { create } from "zustand";

export interface SelectedMedia {
    fileName: string;
    fileSize: number;
    mimeType: string;
    sourcePath: string; // 本地选择的文件路径（临时地址）
    file?: File;        // H5 模式下的 File 对象，用于上传到 COS
    imageWidth?: number;  // 真实资源宽度
    imageHeight?: number; // 真实资源高度
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
