import { create } from "zustand";
import { api, getToken, setToken } from "../api/client";
import type { AuthResponse, MergeSummary, User } from "../api/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  /** One-time message after register/login (e.g. "your guest progress was kept"). */
  notice: string | null;
  init: () => Promise<void>;
  /** Make sure someone is signed in, starting a guest session if needed. */
  ensureGuest: () => Promise<User | null>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearNotice: () => void;
}

/** True for a real (registered) account. */
export function isMember(user: User | null): boolean {
  return !!user && !user.is_guest;
}

const fmt = (n: number) => n.toLocaleString();

/** Notice shown after logging in from a guest session. */
export function mergeNotice(m: MergeSummary): string {
  const parts: string[] = [];
  if (m.scores) parts.push(`${fmt(m.scores)} score${m.scores === 1 ? "" : "s"}`);
  if (m.coins) parts.push(`${fmt(m.coins)} coins`);
  if (m.tokens) parts.push(`${m.tokens} token${m.tokens === 1 ? "" : "s"}`);
  if (m.xp) parts.push(`${fmt(m.xp)} XP`);
  if (m.items) parts.push(`${m.items} item${m.items === 1 ? "" : "s"}`);
  if (parts.length === 0) return "Welcome back! Your guest session had nothing to move.";
  const capped = m.coins_capped > 0 ? ` (${fmt(m.coins_capped)} coins didn't fit under today's 1,000-coin limit)` : "";
  return `Your guest progress moved to this account: ${parts.join(", ")}${capped}.`;
}

let guestPromise: Promise<User | null> | null = null;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,
  notice: null,

  async init() {
    if (!getToken()) {
      set({ initialized: true });
      return;
    }
    try {
      const { token, ...user } = await api.me();
      if (token) setToken(token); // guests: keep the session alive
      set({ user, initialized: true });
    } catch {
      setToken(null);
      set({ user: null, initialized: true });
    }
  },

  ensureGuest() {
    const current = get().user;
    if (current) return Promise.resolve(current);
    guestPromise ??= api
      .guest()
      .then((res) => {
        setToken(res.token);
        set({ user: res.user });
        return res.user;
      })
      .finally(() => {
        guestPromise = null;
      });
    return guestPromise;
  },

  async login(username, password) {
    set({ loading: true });
    try {
      const res = await api.login(username, password);
      finish(res);
      set({ notice: res.merged ? mergeNotice(res.merged) : null });
    } finally {
      set({ loading: false });
    }
  },

  async register(username, email, password) {
    set({ loading: true });
    try {
      const res = await api.register(username, email, password);
      finish(res);
      set({
        notice: res.kept_guest_progress ? "Account created! Everything you played as a guest is saved to it." : null,
      });
    } finally {
      set({ loading: false });
    }
  },

  logout() {
    setToken(null);
    set({ user: null, notice: null });
  },

  clearNotice() {
    set({ notice: null });
  },
}));

function finish(res: AuthResponse) {
  setToken(res.token);
  useAuth.setState({ user: res.user });
}
