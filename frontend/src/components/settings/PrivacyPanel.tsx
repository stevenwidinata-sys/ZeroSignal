import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Privacy } from "../../api/types";
import { useSync } from "../../platform/settingsSync";
import { useAuth } from "../../store/auth";
import { useSettings } from "../../store/settings";

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="row-label">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <input type="checkbox" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Settings → Privacy: leaderboard and profile visibility, pop-up switches. */
export default function PrivacyPanel({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const s = useSettings();
  const privacy = useSync((x) => x.privacy);
  const setPrivacy = useSync((x) => x.setPrivacy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const member = !!user && !user.is_guest;

  async function change(patch: Partial<Privacy>) {
    setBusy(true);
    setError(null);
    try {
      setPrivacy((await api.savePrivacy(patch)).privacy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <fieldset>
        <legend>Privacy</legend>
        {member ? (
          privacy ? (
            <>
              <Switch
                label="Hide me on leaderboards"
                hint="You still play and earn everything, but your name isn't on public leaderboards and you can't win weekly prizes."
                checked={privacy.hide_on_leaderboards}
                disabled={busy}
                onChange={(v) => void change({ hide_on_leaderboards: v })}
              />
              <Switch
                label="Private profile"
                hint="Your public page shows only your name: no level, character, stats or achievements."
                checked={privacy.private_profile}
                disabled={busy}
                onChange={(v) => void change({ private_profile: v })}
              />
              {user && (
                <p className="wam-hint">
                  Your page:{" "}
                  <Link to={`/u/${encodeURIComponent(user.username)}`} onClick={onClose}>
                    /u/{user.username}
                  </Link>
                </p>
              )}
            </>
          ) : (
            <div className="loading">Loading</div>
          )
        ) : (
          <p className="wam-hint">
            {user ? "Guests are never shown on leaderboards and have no public profile." : "Log in to choose who sees you."}{" "}
            <Link to="/register" onClick={onClose}>
              Register
            </Link>{" "}
            to get on the leaderboards.
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Pop-ups</legend>
        <Switch
          label="Daily login reward pop-up"
          hint="Off: claim it from the 🎁 button on the Hub instead."
          checked={s.dailyLoginPopup}
          onChange={(v) => s.update({ dailyLoginPopup: v })}
        />
        <Switch
          label="Level-up pop-up"
          hint="The big celebration with your new unlocks when you level up."
          checked={s.levelUpPopup}
          onChange={(v) => s.update({ levelUpPopup: v })}
        />
        <Switch
          label="Reward toasts"
          hint="The small +coins / +XP message after each game."
          checked={s.rewardToasts}
          onChange={(v) => s.update({ rewardToasts: v })}
        />
      </fieldset>
    </>
  );
}
