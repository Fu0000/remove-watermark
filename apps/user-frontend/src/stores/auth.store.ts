import { create } from "zustand";

interface UserProfile {
  userId: string;
  planId: string;
  quotaLeft: number;
}

interface AuthState {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: UserProfile;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: UserProfile;
  }) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  setSession: (payload) => set(payload),
  clearSession: () =>
    set({
      accessToken: undefined,
      refreshToken: undefined,
      expiresIn: undefined,
      user: undefined
    })
}));
