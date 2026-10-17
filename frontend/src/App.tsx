import { useEffect } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SettingsButton, ThemeToggle } from "./components/QuickControls";
import SettingsDialog from "./components/SettingsDialog";
import Hub from "./pages/Hub";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import PlayGame from "./pages/PlayGame";
import Register from "./pages/Register";
import { useAuth } from "./store/auth";
import { useSettingsDialog } from "./store/settingsDialog";

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
  const { pathname } = useLocation();

  useEffect(() => {
    void init();
  }, [init]);

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
          {user ? (
            <>
              <span className="user-chip" title="Signed in">
                <span className="dot" aria-hidden="true" />
                {user.username}
              </span>
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
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="footer">
        ZERO SIGNAL · Scores are verified server-side. No cheats, just skill.
      </footer>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
