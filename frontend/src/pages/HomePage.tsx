import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="page home">
      <main className="dashboard">
        <header className="dashboard-header">
          <p className="eyebrow">Mudcup</p>
          <h1>Who are you?</h1>
          <p className="lead tight">Pick a role to continue.</p>
        </header>

        <div className="role-grid">
          <Link to="/customer" className="role-card role-customer">
            <span className="role-icon" aria-hidden>
              📷
            </span>
            <h2>Customer</h2>
            <p>Scan your table QR, browse the menu, pay by scanning our payment QR, then confirm your order.</p>
            <span className="role-cta">Start →</span>
          </Link>

          <Link to="/manager/login" className="role-card role-manager">
            <span className="role-icon" aria-hidden>
              📋
            </span>
            <h2>Manager</h2>
            <p>View tables, orders, payment status, and send prep time to guests.</p>
            <span className="role-cta">Sign in →</span>
          </Link>

          <Link to="/admin/login" className="role-card role-admin">
            <span className="role-icon" aria-hidden>
              ⚙️
            </span>
            <h2>Admin</h2>
            <p>Menu, payments, reports, offers, and notifications.</p>
            <span className="role-cta">Sign in →</span>
          </Link>
        </div>

        <section className="card demo-card dashboard-foot">
          <h3>Demo</h3>
          <p className="small muted">
            Staff: <code>admin@mudcup.local</code> / <code>admin123</code> · <code>manager@mudcup.local</code> /{" "}
            <code>manager123</code>
          </p>
          <p className="hint">
            Table URLs look like <code>/t/table-1-demo-token</code>. Set <code>VITE_API_URL</code> and{" "}
            <code>MUDCUP_UPI_PA</code> on the server for a real UPI payment QR.
          </p>
        </section>
      </main>
    </div>
  );
}
