import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { AccountView } from "../../api/types";
import { useAuth } from "../../store/auth";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "long" });

/** One small form with its own busy / error / done state. */
function Section({
  title,
  hint,
  submit,
  submitLabel,
  danger,
  onSubmit,
  children,
}: {
  title: string;
  hint?: ReactNode;
  submit: boolean;
  submitLabel: string;
  danger?: boolean;
  onSubmit: () => Promise<string | void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDone((await onSubmit()) || "Saved.");
    } catch (err) {
      setError(errMsg(err, "something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`account-section${danger ? " danger" : ""}`} onSubmit={handle}>
      <h3>{title}</h3>
      {hint && <p className="wam-hint">{hint}</p>}
      {children}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {done && (
        <p className="account-done" role="status">
          ✓ {done}
        </p>
      )}
      <button type="submit" className={`btn-sm ${danger ? "btn-danger" : "btn-blue"}`} disabled={!submit || busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <label className="account-field">
      {props.label}
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        maxLength={props.maxLength}
        required
      />
    </label>
  );
}

/** Settings → Account: username, email, password, delete account. */
export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const renamed = useAuth((s) => s.renamed);
  const deleted = useAuth((s) => s.deleted);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [delName, setDelName] = useState("");
  const [delPw, setDelPw] = useState("");

  const member = !!user && !user.is_guest;
  useEffect(() => {
    if (!member) return;
    api
      .account()
      .then((a) => {
        setAccount(a);
        setEmail(a.email);
      })
      .catch((e) => setLoadError(errMsg(e, "could not load your account")));
  }, [member]);

  if (!user) {
    return (
      <p className="account-empty">
        <Link to="/login" onClick={onClose}>
          Log in
        </Link>{" "}
        to manage your account.
      </p>
    );
  }
  if (user.is_guest) {
    return (
      <div className="account-empty">
        <p>You're playing as a guest. Register (free) to get a username, a password and your own account settings. Everything you've played is kept.</p>
        <div className="game-controls">
          <Link to="/register" className="btn btn-green btn-sm" onClick={onClose}>
            Register
          </Link>
          <Link to="/login" className="btn btn-ghost btn-sm" onClick={onClose}>
            Log in
          </Link>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="error" role="alert">
        {loadError}
      </div>
    );
  }
  if (!account) return <div className="loading">Loading your account</div>;

  const canRename = !account.next_rename_at;

  return (
    <div className="account-panel">
      <p className="wam-hint">
        Signed in as <strong>{account.username}</strong> · {account.email} · playing since {day(account.joined)}
      </p>

      <Section
        title="Username"
        hint={canRename ? "Free, once every 30 days." : `You can change it again on ${day(account.next_rename_at!)}.`}
        submit={canRename && name.trim().length >= 3}
        submitLabel="Change username"
        onSubmit={async () => {
          const r = await api.changeUsername(name.trim());
          renamed(r.token, r.user);
          setAccount(r.account);
          setName("");
          return `You're now ${r.user.username}.`;
        }}
      >
        <Field label="New username" value={name} onChange={setName} autoComplete="username" minLength={3} maxLength={32} />
      </Section>

      <Section
        title="Email"
        submit={email.trim() !== account.email && emailPw.length > 0}
        submitLabel="Change email"
        onSubmit={async () => {
          const a = await api.changeEmail(emailPw, email.trim());
          setAccount(a);
          setEmailPw("");
          return "Email updated.";
        }}
      >
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Current password" type="password" value={emailPw} onChange={setEmailPw} autoComplete="current-password" />
      </Section>

      <Section
        title="Password"
        hint={newPw2 && newPw !== newPw2 ? "The new passwords don't match." : "At least 8 characters."}
        submit={curPw.length > 0 && newPw.length >= 8 && newPw === newPw2}
        submitLabel="Change password"
        onSubmit={async () => {
          await api.changePassword(curPw, newPw);
          setCurPw("");
          setNewPw("");
          setNewPw2("");
          return "Password changed.";
        }}
      >
        <Field label="Current password" type="password" value={curPw} onChange={setCurPw} autoComplete="current-password" />
        <Field label="New password" type="password" value={newPw} onChange={setNewPw} autoComplete="new-password" minLength={8} />
        <Field label="New password again" type="password" value={newPw2} onChange={setNewPw2} autoComplete="new-password" minLength={8} />
      </Section>

      <Section
        title="Delete account"
        danger
        hint={
          <>
            Your account is hidden and you're signed out right away. It's <strong>deleted for good after 7 days</strong>, with every
            score, coin and item. Log in within those 7 days to cancel. Type <strong>{account.username}</strong> to confirm.
          </>
        }
        submit={delName === account.username && delPw.length > 0}
        submitLabel="Delete my account"
        onSubmit={async () => {
          const r = await api.deleteAccount(delPw, delName);
          deleted(r.delete_at);
          onClose();
        }}
      >
        <Field label="Your username" value={delName} onChange={setDelName} autoComplete="off" />
        <Field label="Current password" type="password" value={delPw} onChange={setDelPw} autoComplete="current-password" />
      </Section>
    </div>
  );
}
