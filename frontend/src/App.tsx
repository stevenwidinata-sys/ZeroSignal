import { useEffect } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SettingsButton, ThemeToggle } from "./components/QuickControls";
import AvatarChip from "./components/AvatarChip";
import DailyLoginDialog from "./components/DailyLoginDialog";
import MusicPlayer from "./components/MusicPlayer";
import RewardToast from "./components/RewardToast";
import SettingsDialog from "./components/SettingsDialog";
import WalletChip from "./components/WalletChip";
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
import { useAuth } from "./store/auth";
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

  useEffect(() => {
    void init();
  }, [init]);

  // Load balances whenever someone signs in; forget them on sign-out.
  useEffect(() => {
    if (user) {
      void refreshWallet();
      void loadDaily();
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
    if (user && wallet) {
      void loadQuests();
      void loadAchievements();
    }
  }, [user, wallet, loadQuests, loadAchievements]);

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
          {user && (
            <NavLink to="/shop" className={navClass}>
              Shop
            </NavLink>
          )}
          {user && (
            <NavLink to="/quests" className={navClass}>
              Quests
              {questsReady > 0 && (
                <span className="nav-badge" aria-label={`${questsReady} ready to claim`}>
                  {questsReady}
                </span>
              )}
            </NavLink>
          )}
          {user && (
            <NavLink to="/achievements" className={navClass}>
              Achievements
              {achievementsReady > 0 && (
                <span className="nav-badge" aria-label={`${achievementsReady} ready to claim`}>
                  {achievementsReady}
                </span>
              )}
            </NavLink>
          )}
          {user ? (
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
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route
            path="/play/:gameId"
            element={
              <RequireAuth>
                <PlayGame />
              </RequireAuth>
            }
          />
          <Route path="/leaderboard" element={<Navigate to="/leaderboard/angry-bird" replace />} />
          <Route path="/leaderboard/:gameId" element={<Leaderboard />} />
          <Route path="/u/:username" element={<PublicProfile />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/shop"
            element={
              <RequireAuth>
                <Shop />
              </RequireAuth>
            }
          />
          <Route
            path="/quests"
            element={
              <RequireAuth>
                <Quests />
              </RequireAuth>
            }
          />
          <Route
            path="/achievements"
            element={
              <RequireAuth>
                <Achievements />
              </RequireAuth>
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
