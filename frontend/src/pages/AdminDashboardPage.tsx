import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminTableQrPreview } from "../components/AdminTableQrPreview";
import { apiFetch, clearTokens } from "../lib/api";

type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  supplierName: string | null;
  active: boolean;
  sortOrder: number;
};

type AdminTableRow = {
  id: number;
  number: number;
  label: string | null;
  qrToken: string;
  orderingUrl: string;
  hasCustomQr: boolean;
};

type PaymentRow = {
  paidAt: string | null;
  tableNumber: number;
  amount: string;
  method: string;
  bankDetails: string | null;
  items: { name: string; quantity: number }[];
  orderStatus: string;
};

export function AdminDashboardPage() {
  const nav = useNavigate();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [stats, setStats] = useState<{ revenue: number; completedPayments: number; label: string } | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [notifications, setNotifications] = useState<
    { id: number; title: string; body: string; tableNumber: number | null; amount: string | null }[]
  >([]);
  const [offers, setOffers] = useState<{ id: number; title: string; body: string; releasedAt: string | null }[]>([]);
  const [form, setForm] = useState({ name: "", price: "", supplierName: "", description: "" });
  const [offerForm, setOfferForm] = useState({ title: "", body: "" });
  const [tables, setTables] = useState<AdminTableRow[]>([]);
  const [pubUrl, setPubUrl] = useState("");
  const [tableForm, setTableForm] = useState({ number: "", label: "" });
  const [qrBust, setQrBust] = useState(0);

  const gate = useCallback(async () => {
    const me = await apiFetch("/auth/me/");
    if (!me.ok) {
      clearTokens();
      nav("/admin/login");
      return false;
    }
    const j = (await me.json()) as { user?: { role?: string } };
    if (j.user?.role !== "ADMIN") {
      clearTokens();
      nav("/admin/login");
      return false;
    }
    return true;
  }, [nav]);

  const load = useCallback(async () => {
    if (!(await gate())) return;
    const [m, s, p, n, o, tb] = await Promise.all([
      apiFetch("/admin/menu/"),
      apiFetch(`/admin/stats/?period=${period}`),
      apiFetch(`/admin/payments/?period=${period}`),
      apiFetch("/notifications/staff/"),
      apiFetch("/admin/offers/"),
      apiFetch("/admin/tables/"),
    ]);
    if (m.ok) {
      const j = await m.json();
      setMenu(j.items ?? []);
    }
    if (s.ok) {
      const j = await s.json();
      setStats({ revenue: j.revenue, completedPayments: j.completedPayments, label: j.label });
    }
    if (p.ok) {
      const j = await p.json();
      setPayments(j.payments ?? []);
    }
    if (n.ok) {
      const j = await n.json();
      setNotifications(j.notifications ?? []);
    }
    if (o.ok) {
      const j = await o.json();
      setOffers(j.offers ?? []);
    }
    if (tb.ok) {
      const j = await tb.json();
      setTables(j.tables ?? []);
      setPubUrl(j.frontendPublicUrl ?? "");
    }
  }, [gate, period]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function logout() {
    clearTokens();
    nav("/admin/login");
  }

  async function addMenu(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(form.price);
    if (!form.name || Number.isNaN(price)) return;
    await apiFetch("/admin/menu/", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        price,
        supplierName: form.supplierName || undefined,
        description: form.description || undefined,
      }),
    });
    setForm({ name: "", price: "", supplierName: "", description: "" });
    void load();
  }

  async function toggleItem(id: number, active: boolean) {
    await apiFetch(`/admin/menu/${id}/`, { method: "PATCH", body: JSON.stringify({ active: !active }) });
    void load();
  }

  async function deleteItem(id: number) {
    if (!confirm("Delete this item?")) return;
    await apiFetch(`/admin/menu/${id}/`, { method: "DELETE" });
    void load();
  }

  async function createOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!offerForm.title || !offerForm.body) return;
    await apiFetch("/admin/offers/", { method: "POST", body: JSON.stringify(offerForm) });
    setOfferForm({ title: "", body: "" });
    void load();
  }

  async function releaseOffer(id: number) {
    if (!confirm("Release this offer to all subscribed emails?")) return;
    await apiFetch(`/admin/offers/${id}/release/`, { method: "POST" });
    void load();
  }

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(tableForm.number);
    if (Number.isNaN(n) || n < 1) return;
    const res = await apiFetch("/admin/tables/", {
      method: "POST",
      body: JSON.stringify({ number: n, label: tableForm.label.trim() || undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Could not add table");
      return;
    }
    setTableForm({ number: "", label: "" });
    setQrBust((x) => x + 1);
    void load();
  }

  async function onUploadQr(tableId: number, file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    const res = await apiFetch(`/admin/tables/${tableId}/qr-upload/`, { method: "POST", body: fd });
    if (!res.ok) {
      alert("Upload failed");
      return;
    }
    setQrBust((x) => x + 1);
    void load();
  }

  async function clearCustomQr(tableId: number) {
    if (!confirm("Remove custom QR image and use auto-generated ordering QR?")) return;
    await apiFetch(`/admin/tables/${tableId}/qr-clear/`, { method: "POST" });
    setQrBust((x) => x + 1);
    void load();
  }

  async function regenerateTableToken(tableId: number) {
    if (!confirm("Regenerate table link? Old printed QR codes will stop working.")) return;
    await apiFetch(`/admin/tables/${tableId}/`, { method: "PATCH", body: JSON.stringify({ regenerateQrToken: true }) });
    setQrBust((x) => x + 1);
    void load();
  }

  async function deleteTableRow(tableId: number) {
    if (!confirm("Delete this table? Only works if it has no orders yet.")) return;
    const res = await apiFetch(`/admin/tables/${tableId}/`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Delete failed");
      return;
    }
    void load();
  }

  function copyOrderingUrl(url: string) {
    void navigator.clipboard.writeText(url).then(
      () => alert("Ordering link copied."),
      () => alert("Could not copy — select the link manually."),
    );
  }

  return (
    <div className="page wide">
      <header className="page-header">
        <div>
          <h1>Admin — Mudcup</h1>
          <p className="muted">Menu, payments, business summary, alerts, offers.</p>
        </div>
        <div className="header-actions">
          <Link to="/manager">Manager view</Link>
          <button type="button" className="linkish" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <section className="grid-3">
        <div className="card">
          <p className="label">Period</p>
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="today">Today</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        <div className="card">
          <p className="label">{stats?.label ?? "Revenue"}</p>
          <p className="stat-big">Rs {stats ? stats.revenue.toFixed(2) : "—"}</p>
          <p className="muted small">{stats?.completedPayments ?? 0} completed payments</p>
        </div>
        <div className="card accent">
          <p className="label">Customer app URL</p>
          <p className="small mono wrap">{pubUrl || "—"}</p>
          <p className="hint">Set <code>FRONTEND_PUBLIC_URL</code> on the API so generated table QRs open the right site.</p>
        </div>
      </section>

      <section className="section">
        <h2>Tables & QR codes</h2>
        <p className="muted small">
          Each table has an ordering link. Print the QR from here (or upload your own image). Customers scan → menu for that
          table → orders attach to this table number.
        </p>
        <form className="form table-add-form" onSubmit={addTable}>
          <input
            type="number"
            min={1}
            placeholder="Table number (e.g. 4)"
            value={tableForm.number}
            onChange={(e) => setTableForm((f) => ({ ...f, number: e.target.value }))}
          />
          <input
            placeholder="Label (optional)"
            value={tableForm.label}
            onChange={(e) => setTableForm((f) => ({ ...f, label: e.target.value }))}
          />
          <button type="submit" className="btn btn-primary">
            Add table
          </button>
        </form>

        <div className="table-qr-grid">
          {tables.map((t) => (
            <div key={t.id} className="card table-qr-card">
              <div className="table-qr-top">
                <AdminTableQrPreview tableId={t.id} bust={qrBust} />
                <div className="table-qr-meta">
                  <p className="strong">
                    Table {t.number}
                    {t.label ? <span className="muted"> — {t.label}</span> : null}
                  </p>
                  <p className="tiny muted">Token: {t.qrToken}</p>
                  {t.hasCustomQr && <span className="pill">Custom image</span>}
                </div>
              </div>
              <p className="ordering-url small">
                <button type="button" className="linkish" onClick={() => copyOrderingUrl(t.orderingUrl)}>
                  Copy ordering link
                </button>
              </p>
              <p className="tiny muted wrap break-all">{t.orderingUrl}</p>
              <div className="table-qr-actions">
                <label className="file-upload-label">
                  Upload QR image
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      void onUploadQr(t.id, f ?? null);
                    }}
                  />
                </label>
                {t.hasCustomQr && (
                  <button type="button" className="linkish" onClick={() => void clearCustomQr(t.id)}>
                    Use auto QR
                  </button>
                )}
                <button type="button" className="linkish" onClick={() => void regenerateTableToken(t.id)}>
                  New link
                </button>
                <button type="button" className="linkish danger" onClick={() => void deleteTableRow(t.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Staff notifications</h2>
        <ul className="notif-list">
          {notifications.length === 0 && <li className="muted">No notifications yet.</li>}
          {notifications.map((n) => (
            <li key={n.id} className="notif-item">
              <strong>{n.title}</strong>
              {n.tableNumber != null && <span className="pill">Table {n.tableNumber}</span>}
              {n.amount && <span className="money">Rs {n.amount}</span>}
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Menu</h2>
        <form className="form grid-form" onSubmit={addMenu}>
          <input placeholder="Item name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input
            placeholder="Price (Rs)"
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
          <input
            placeholder="Supplier"
            value={form.supplierName}
            onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
          />
          <input
            className="full"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <button type="submit" className="btn btn-primary full">
            Add menu item
          </button>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Supplier</th>
                <th>Price</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {menu.map((it) => (
                <tr key={it.id}>
                  <td>{it.name}</td>
                  <td>{it.supplierName ?? "—"}</td>
                  <td>Rs {it.price}</td>
                  <td>{it.active ? "Yes" : "No"}</td>
                  <td>
                    <button type="button" className="linkish" onClick={() => void toggleItem(it.id, it.active)}>
                      {it.active ? "Hide" : "Show"}
                    </button>{" "}
                    <button type="button" className="linkish danger" onClick={() => void deleteItem(it.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Payments ({period})</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Table</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Bank / ref</th>
                <th>Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"}</td>
                  <td>{p.tableNumber}</td>
                  <td>Rs {p.amount}</td>
                  <td>{p.method}</td>
                  <td className="truncate">{p.bankDetails ?? "—"}</td>
                  <td className="small">{p.items?.map((i) => `${i.name} x${i.quantity}`).join(", ")}</td>
                  <td>{p.orderStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Offers & email</h2>
        <p className="muted small">Subscribers come from reviews (opt-in) or subscribe API. SMTP: configure Django email backend.</p>
        <form className="form" onSubmit={createOffer}>
          <input placeholder="Offer title" value={offerForm.title} onChange={(e) => setOfferForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea
            placeholder="Offer details"
            rows={3}
            value={offerForm.body}
            onChange={(e) => setOfferForm((f) => ({ ...f, body: e.target.value }))}
          />
          <button type="submit" className="btn btn-primary">
            Save offer
          </button>
        </form>
        <ul className="offer-list">
          {offers.map((o) => (
            <li key={o.id} className="offer-item">
              <span className="strong">{o.title}</span>
              {o.releasedAt && <span className="badge">Released</span>}
              <button type="button" className="linkish" onClick={() => void releaseOffer(o.id)}>
                Release to emails
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
