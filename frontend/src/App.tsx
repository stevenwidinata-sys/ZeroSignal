import { useEffect } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SettingsButton, ThemeToggle } from "./components/QuickControls";
import AvatarChip from "./components/AvatarChip";
import DailyLoginDialog from "./components/DailyLoginDialog";
import { AuthNotice, GuestBanner, GuestGate } from "./components/Guest";
import MusicPlayer from "./components/MusicPlayer";
import RewardToast from "./components/RewardToast";
import SettingsDialog from "./components/SettingsDialog";
import WalletChip from "./components/WalletChip";
import { useLeaveGuardListeners } from "./platform/leaveGuard";
import { useSettingsSync } from "./platform/settingsSync";
import Hub from "./pages/Hub";
import Achievements from "./pages/Achievements";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import PlayGame from "./pages/PlayGame";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Quests from "./pages/Quests";
import Register from "./pages/Register";
import Shop from "./pages/Shop";
import Stats from "./pages/Stats";
import { isMember, useAuth } from "./store/auth";
import { useAchievements } from "./store/achievements";
import { useCharacter } from "./store/character";
import { useDailyLogin } from "./store/dailyLogin";
import { readyCount, useQuests } from "./store/quests";
import { usePhoto } from "./store/photo";
import { useSettingsDialog } from "./store/settingsDialog";
import { useWallet } from "./store/wallet";

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);
  const location = useLocation();
  if (!initialized) return <div className="loading">Loading</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

/** Account-only pages: guests see why and how to register instead. */
function RequireMember({ feature, children }: { feature: string; children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  if (user?.is_guest) return <GuestGate feature={feature} />;
  return <RequireAuth>{children}</RequireAuth>;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link${isActive ? " active" : ""}`;

export default function App() {
  const user = useAuth((s) => s.user);
  const init = useAuth((s) => s.init);
  const logout = useAuth((s) => s.logout);
  const settingsOpen = useSettingsDialog((s) => s.open);
  const setSettingsOpen = useSettingsDialog((s) => s.setOpen);
  const refreshWallet = useWallet((s) => s.refresh);
  const clearWallet = useWallet((s) => s.clear);
  const clearCharacter = useCharacter((s) => s.clear);
  const clearPhoto = usePhoto((s) => s.clear);
  const loadDaily = useDailyLogin((s) => s.load);
  const clearDaily = useDailyLogin((s) => s.clear);
  const wallet = useWallet((s) => s.wallet);
  const loadQuests = useQuests((s) => s.load);
  const clearQuests = useQuests((s) => s.clear);
  const questsReady = useQuests((s) => readyCount(s.view));
  const loadAchievements = useAchievements((s) => s.load);
  const clearAchievements = useAchievements((s) => s.clear);
  const achievementsReady = useAchievements((s) => s.view?.ready ?? 0);
  const { pathname } = useLocation();
  const member = isMember(user);
  useLeaveGuardListeners();
  useSettingsSync(member);

  useEffect(() => {
    void init();
  }, [init]);

  // Load balances whenever someone signs in; forget them on sign-out.
  useEffect(() => {
    if (user) {
      void refreshWallet();
      // The login reward is for accounts only.
      if (!user.is_guest) void loadDaily();
      else clearDaily();
    } else {
      clearWallet();
      clearCharacter();
      clearPhoto();
      clearDaily();
      clearQuests();
      clearAchievements();
    }
  }, [user, refreshWallet, clearWallet, clearCharacter, clearPhoto, loadDaily, clearDaily, clearQuests, clearAchievements]);

  // Every server payout refreshes the wallet; quests and achievements may have moved too.
  useEffect(() => {
    if (member && wallet) {
      void loadQuests();
      void loadAchievements();
    }
  }, [member, wallet, loadQuests, loadAchievements]);

  // Scroll to top on page change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="nav">
        <Link to="/" className="brand" aria-label="Zero Signal home">
          <span className="brand-logo" aria-hidden="true">
            ▶
          </span>
          <span className="brand-text">
            ZERO<span>SIGNAL</span>
          </span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/" end className={navClass}>
            Games
          </NavLink>
          <NavLink to="/leaderboard" className={navClass}>
            Leaderboards
          </NavLink>
          {member && (
            <NavLink to="/shop" className={navClass}>
              Shop
            </NavLink>
          )}
          {user && (
            <NavLink to="/stats" className={navClass}>
              Stats
            </NavLink>
          )}
          {member && (
            <NavLink to="/quests" className={navClass}>
              Quests
              {questsReady > 0 && (
                <span className="nav-badge" aria-label={`${questsReady} ready to claim`}>
                  {questsReady}
                </span>
              )}
            </NavLink>
          )}
          {member && (
            <NavLink to="/achievements" className={navClass}>
              Achievements
              {achievementsReady > 0 && (
                <span className="nav-badge" aria-label={`${achievementsReady} ready to claim`}>
                  {achievementsReady}
                </span>
              )}
            </NavLink>
          )}
          {user?.is_guest ? (
            <>
              <WalletChip />
              <span className="user-chip guest-chip" title="Playing as a guest">
                👤 Guest
              </span>
              <NavLink to="/register" className="btn btn-green btn-sm">
                Register
              </NavLink>
              <NavLink to="/login" className={navClass}>
                Log in
              </NavLink>
            </>
          ) : user ? (
            <>
              <WalletChip />
              <AvatarChip username={user.username} />
              <button className="btn-ghost btn-sm" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className={navClass}>
              Log in
            </NavLink>
          )}
          <ThemeToggle />
          <SettingsButton />
        </nav>
      </header>

      <main id="main">
        <AuthNotice />
        <GuestBanner />
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route
            path="/play/:gameId"
            element={<PlayGame />}
          />
          <Route path="/leaderboard" element={<Navigate to="/leaderboard/angry-bird" replace />} />
          <Route path="/leaderboard/:gameId" element={<Leaderboard />} />
          <Route path="/u/:username" element={<PublicProfile />} />
          <Route
            path="/profile"
            element={
              <RequireMember feature="Your character">
                <Profile />
              </RequireMember>
            }
          />
          <Route
            path="/stats"
            element={
              <RequireAuth>
                <Stats />
              </RequireAuth>
            }
          />
          <Route
            path="/shop"
            element={
              <RequireMember feature="The shop">
                <Shop />
              </RequireMember>
            }
          />
          <Route
            path="/quests"
            element={
              <RequireMember feature="Daily quests">
                <Quests />
              </RequireMember>
            }
          />
          <Route
            path="/achievements"
            element={
              <RequireMember feature="Achievements">
                <Achievements />
              </RequireMember>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="footer">
        ZERO SIGNAL · Scores are verified server-side. No cheats, just skill.
      </footer>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DailyLoginDialog />
      <MusicPlayer />
      <RewardToast />
    </div>
  );
}
