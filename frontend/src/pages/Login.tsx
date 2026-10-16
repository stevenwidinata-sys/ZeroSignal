import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuth((s) => s.login);
  const loading = useAuth((s) => s.loading);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only allow redirecting to in-app paths (no open redirects).
  const from = (location.state as { from?: { pathname?: string } } | null)?.from
    ?.pathname;
  const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow">▶ PLAYER 1</p>
        <h2>Welcome back</h2>
        <p className="auth-sub">Log in to save scores and climb the board.</p>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Press start"}
        </button>
        <p className="auth-alt">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
