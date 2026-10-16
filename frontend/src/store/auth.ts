import { create } from "zustand";
import { api, getToken, setToken } from "../api/client";
import type { User } from "../api/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  async init() {
    if (!getToken()) {
      set({ initialized: true });
      return;
    }
    try {
      const user = await api.me();
      set({ user, initialized: true });
    } catch {
      setToken(null);
      set({ user: null, initialized: true });
    }
  },

  async login(username, password) {
    set({ loading: true });
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  async register(username, email, password) {
    set({ loading: true });
    try {
      const res = await api.register(username, email, password);
      setToken(res.token);
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  logout() {
    setToken(null);
    set({ user: null });
  },
}));
