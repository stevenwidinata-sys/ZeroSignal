import type {
  AuthResponse,
  Bird,
  CfCollection,
  CfMatch,
  CfSpin,
  Difficulty,
  LeaderboardEntry,
  MyScoresResponse,
  ShotInput,
  SubmitResponse,
  User,
} from "./types";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:8080";

const TOKEN_KEY = "pixelplay_token";
const LEGACY_TOKEN_KEY = "angrybird_token";

export function getToken(): string | null {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) return t;
  // One-time migration so existing players stay logged in.
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  return legacy;
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  register(username: string, email: string, password: string) {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  },
  login(username: string, password: string) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return request<User>("/api/me");
  },
  // Platform: per-game leaderboards/history. gameId is URL-encoded defensively.
  leaderboard(gameId: string) {
    return request<LeaderboardEntry[]>(
      `/api/games/${encodeURIComponent(gameId)}/leaderboard`,
    );
  },
  myScores(gameId: string) {
    return request<MyScoresResponse>(
      `/api/games/${encodeURIComponent(gameId)}/scores/me`,
    );
  },
  // Angry Bird specific.
  birds() {
    return request<Bird[]>("/api/games/angry-bird/birds");
  },
  submitScore(level: number, shots: ShotInput[]) {
    return request<SubmitResponse>("/api/games/angry-bird/scores", {
      method: "POST",
      body: JSON.stringify({ level, shots }),
    });
  },
};

const CF = "/api/games/connect-four";
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

/** Connect Four: the server owns the board; we only ever send a column. */
export const connectFour = {
  createMatch(difficulty: Difficulty, bestOf: 3 | 5, skin: string) {
    return post<CfMatch>(`${CF}/matches`, { difficulty, best_of: bestOf, skin });
  },
  /** Resolves to null when there is no unfinished series. */
  async activeMatch(): Promise<CfMatch | null> {
    try {
      return await request<CfMatch>(`${CF}/matches/active`);
    } catch (e) {
      if (e instanceof Error && e.message === "not found") return null;
      throw e;
    }
  },
  move(id: string, column: number) {
    return post<CfMatch>(`${CF}/matches/${encodeURIComponent(id)}/move`, { column });
  },
  undo(id: string) {
    return post<CfMatch>(`${CF}/matches/${encodeURIComponent(id)}/undo`);
  },
  nextGame(id: string) {
    return post<CfMatch>(`${CF}/matches/${encodeURIComponent(id)}/next`);
  },
  forfeit(id: string) {
    return post<CfMatch>(`${CF}/matches/${encodeURIComponent(id)}/forfeit`);
  },
  skins() {
    return request<CfCollection>(`${CF}/skins`);
  },
  spin() {
    return post<CfSpin>(`${CF}/spins`);
  },
};
