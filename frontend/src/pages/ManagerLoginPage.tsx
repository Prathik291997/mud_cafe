import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, clearTokens, readApiError, setTokens } from "../lib/api";

export function ManagerLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("manager@mudcup.local");
  const [password, setPassword] = useState("manager123");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await apiFetch("/auth/login/", { method: "POST", auth: false, body: JSON.stringify({ email, password }) });
    setLoading(false);
    if (!res.ok) {
      setErr(await readApiError(res));
      return;
    }
    const data = (await res.json()) as { access: string; refresh: string };
    setTokens(data.access, data.refresh);
    const me = await apiFetch("/auth/me/");
    const mj = (await me.json()) as { user?: { role?: string } };
    if (mj.user?.role !== "MANAGER" && mj.user?.role !== "ADMIN") {
      clearTokens();
      setErr("This account is not a manager.");
      return;
    }
    nav("/manager");
  }

  return (
    <div className="page narrow">
      <h1>Manager sign in</h1>
      <p className="muted">Tables, orders, payments, ETA — Mudcup.</p>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <p className="error">{err}</p>}
        <button type="submit" className="btn btn-amber" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="center muted">
        <Link to="/">Back home</Link>
      </p>
    </div>
  );
}
