import type {
  AchievementClaim,
  AchievementsView,
  AuthResponse,
  Bird,
  BoxResponse,
  CfCollection,
  CfMatch,
  CfSpin,
  CharacterView,
  Difficulty,
  ItemWheelResponse,
  LeaderboardEntry,
  LoadoutDto,
  LoginClaim,
  LoginStatus,
  MyScoresResponse,
  PublicProfile,
  QuestClaim,
  QuestsView,
  ShotInput,
  SubmitResponse,
  TttCollection,
  TttDifficulty,
  TttMatch,
  TttSpin,
  User,
  Wallet,
  MfDifficulty,
  MfGame,
  WamFinish,
  WamMode,
  WamStart,
  WamTap,
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

/** Raw authenticated fetch for non-JSON bodies (photos). */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok && res.status !== 404) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res;
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
  wallet() {
    return request<Wallet>("/api/me/wallet");
  },
  dailyLogin() {
    return request<LoginStatus>("/api/me/daily-login");
  },
  claimDailyLogin() {
    return request<LoginClaim>("/api/me/daily-login/claim", { method: "POST" });
  },
  quests() {
    return request<QuestsView>("/api/me/quests");
  },
  claimQuest(slot: number) {
    return request<QuestClaim>(`/api/me/quests/${slot}/claim`, { method: "POST" });
  },
  rerollQuest(slot: number) {
    return request<QuestsView>(`/api/me/quests/${slot}/reroll`, { method: "POST" });
  },
  achievements() {
    return request<AchievementsView>("/api/me/achievements");
  },
  claimAchievement(id: string) {
    return request<AchievementClaim>(`/api/me/achievements/${encodeURIComponent(id)}/claim`, { method: "POST" });
  },
  character() {
    return request<CharacterView>("/api/me/character");
  },
  saveLoadout(loadout: LoadoutDto) {
    return request<CharacterView>("/api/me/character/loadout", {
      method: "PUT",
      body: JSON.stringify({ loadout }),
    });
  },
  savePreset(slotNo: 1 | 2 | 3, name: string, loadout: LoadoutDto) {
    return request<CharacterView>(`/api/me/character/presets/${slotNo}`, {
      method: "PUT",
      body: JSON.stringify({ name, loadout }),
    });
  },
  buyItem(itemId: string) {
    return request<CharacterView>("/api/shop/buy", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId }),
    });
  },
  openMysteryBox() {
    return request<BoxResponse>("/api/shop/mystery-box", { method: "POST" });
  },
  spinItemWheel() {
    return request<ItemWheelResponse>("/api/shop/wheel", { method: "POST" });
  },
  profile(username: string) {
    return request<PublicProfile>(`/api/users/${encodeURIComponent(username)}/profile`);
  },
  // Platform: per-game leaderboards/history. gameId is URL-encoded defensively.
  /** `level` picks one board of a game (e.g. a Whack-a-Mole mode). */
  leaderboard(gameId: string, filter: { level?: number; period?: "all" | "today" } = {}) {
    const q = new URLSearchParams();
    if (filter.level !== undefined) q.set("level", String(filter.level));
    if (filter.period) q.set("period", filter.period);
    const qs = q.toString();
    return request<LeaderboardEntry[]>(
      `/api/games/${encodeURIComponent(gameId)}/leaderboard${qs ? `?${qs}` : ""}`,
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

const TTT = "/api/games/tic-tac-toe";

/** Tic-Tac-Toe: the server owns the board; we only ever send a cell number. */
export const ticTacToe = {
  createMatch(difficulty: TttDifficulty, bestOf: 3 | 5, face: string, board: string) {
    return post<TttMatch>(`${TTT}/matches`, { difficulty, best_of: bestOf, face, board });
  },
  async activeMatch(): Promise<TttMatch | null> {
    try {
      return await request<TttMatch>(`${TTT}/matches/active`);
    } catch (e) {
      if (e instanceof Error && e.message === "not found") return null;
      throw e;
    }
  },
  move(id: string, cell: number) {
    return post<TttMatch>(`${TTT}/matches/${encodeURIComponent(id)}/move`, { cell });
  },
  undo(id: string) {
    return post<TttMatch>(`${TTT}/matches/${encodeURIComponent(id)}/undo`);
  },
  nextGame(id: string) {
    return post<TttMatch>(`${TTT}/matches/${encodeURIComponent(id)}/next`);
  },
  forfeit(id: string) {
    return post<TttMatch>(`${TTT}/matches/${encodeURIComponent(id)}/forfeit`);
  },
  collection() {
    return request<TttCollection>(`${TTT}/collection`);
  },
  buy(kind: "board" | "face", id: string) {
    return post<TttCollection>(`${TTT}/buy`, { kind, id });
  },
  spin() {
    return post<TttSpin>(`${TTT}/spins`);
  },
};

/** Your private photo (used as a Tic-Tac-Toe face). Never shown to others. */
export const photo = {
  /** Resolves to null when you haven't added a photo. */
  async get(): Promise<Blob | null> {
    const res = await authFetch("/api/me/photo");
    return res.status === 404 ? null : res.blob();
  },
  async put(image: Blob): Promise<void> {
    await authFetch("/api/me/photo", { method: "PUT", headers: { "Content-Type": image.type }, body: image });
  },
  async remove(): Promise<void> {
    await authFetch("/api/me/photo", { method: "DELETE" });
  },
};

const WAM = "/api/games/whack-a-mole";

/** Whack-a-Mole: the server gives a seed and scores the taps itself. */
export const whackAMole = {
  start(mode: WamMode, grid: 3 | 4) {
    return post<WamStart>(`${WAM}/runs`, { mode, grid });
  },
  finish(runId: string, taps: WamTap[]) {
    return post<WamFinish>(`${WAM}/runs/${encodeURIComponent(runId)}/finish`, { taps });
  },
};

const MF = "/api/games/minefield/games";

/** Minefield: the server keeps the mines; we send cells and get back what's visible. */
export const minefield = {
  create(difficulty: MfDifficulty) {
    return post<MfGame>(MF, { difficulty });
  },
  active() {
    return request<MfGame | null>(`${MF}/active`);
  },
  reveal(id: string, cell: number) {
    return post<MfGame>(`${MF}/${encodeURIComponent(id)}/reveal`, { cell });
  },
  chord(id: string, cell: number, flags: number[]) {
    return post<MfGame>(`${MF}/${encodeURIComponent(id)}/chord`, { cell, flags });
  },
  hint(id: string) {
    return post<MfGame>(`${MF}/${encodeURIComponent(id)}/hint`);
  },
  forfeit(id: string) {
    return post<MfGame | null>(`${MF}/${encodeURIComponent(id)}/forfeit`);
  },
};
