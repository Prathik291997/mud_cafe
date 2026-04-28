import { useState } from "react";
import { Link } from "react-router-dom";

export function HomePage() {
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffCode, setStaffCode] = useState("");
  const [staffPromptOpen, setStaffPromptOpen] = useState(false);
  const [staffErr, setStaffErr] = useState<string | null>(null);

  const expectedStaffCode = (import.meta.env.VITE_STAFF_ACCESS_CODE as string | undefined)?.trim() || "mudcupstaff";

  function unlockStaff(e: React.FormEvent) {
    e.preventDefault();
    if (staffCode.trim() !== expectedStaffCode) {
      setStaffErr("Wrong staff password.");
      return;
    }
    setStaffErr(null);
    setStaffOpen(true);
    setStaffPromptOpen(false);
    setStaffCode("");
  }

  return (
    <div className="page home">
      <main className="dashboard">
        <header className="dashboard-header">
          <p className="eyebrow">Mudcup</p>
          <h1>Welcome to Mudcup</h1>
          <p className="lead tight">Fresh coffee, quick table ordering</p>
        </header>

        <section className="hero-cafe-strip" aria-label="Cafe highlights">
          <img
            src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80"
            alt="Cup of coffee on cafe table"
            loading="lazy"
          />
          <img
            src="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80"
            alt="Coffee beans and brewing setup"
            loading="lazy"
          />
          <img
            src="https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=900&q=80"
            alt="Warm cafe interior"
            loading="lazy"
          />
        </section>

        <section className="card demo-card dashboard-foot dashboard-steps-top">
          <h3>Customer steps</h3>
          <ol className="steps-list">
            <li>Tap <strong>Customer</strong> and allow camera access.</li>
            <li>Scan the QR on your table to open menu for that table.</li>
            <li>Select items and review your order.</li>
            <li>Scan payment QR in your UPI app and complete payment.</li>
            <li>Tap <strong>I’ve paid — confirm order</strong>.</li>
            <li>Track status/ETA and submit your review.</li>
          </ol>
        </section>

        <div className="role-grid role-grid-single">
          <Link to="/customer" className="role-card role-customer">
            <span className="role-icon" aria-hidden>
              📷
            </span>
            <h2>Customer</h2>
            <p>Scan your table QR, browse menu, pay by QR, and confirm your order in seconds.</p>
            <span className="role-cta">Start →</span>
          </Link>
        </div>

        <div className="staff-toggle-wrap">
          <button
            type="button"
            className="staff-toggle-btn"
            onClick={() => {
              if (staffOpen) {
                setStaffOpen(false);
                setStaffPromptOpen(false);
                setStaffCode("");
                setStaffErr(null);
                return;
              }
              setStaffPromptOpen((v) => !v);
              setStaffCode("");
              setStaffErr(null);
            }}
            aria-expanded={staffOpen || staffPromptOpen}
          >
            {staffOpen ? "Hide staff" : "Staff"}
          </button>

          {staffPromptOpen && !staffOpen && (
            <form className="staff-lock-form" onSubmit={unlockStaff}>
              <label className="tiny muted" htmlFor="staff-code">
                Staff access
              </label>
              <div className="staff-lock-row">
                <input
                  id="staff-code"
                  type="password"
                  placeholder="Enter staff password"
                  value={staffCode}
                  onChange={(e) => {
                    setStaffCode(e.target.value);
                    if (staffErr) setStaffErr(null);
                  }}
                />
                <button type="submit" className="staff-toggle-btn">
                  Unlock
                </button>
              </div>
              {staffErr && <p className="error tiny staff-lock-error">{staffErr}</p>}
            </form>
          )}
        </div>

        {staffOpen && (
          <div className="role-grid role-grid-staff">
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
        )}

      </main>
    </div>
  );
}
