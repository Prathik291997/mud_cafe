import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, clearTokens } from "../lib/api";

type OrderRow = {
  id: number;
  tableNumber: number;
  status: string;
  estimatedMinutes: number | null;
  etaMessage: string | null;
  createdAt: string;
  items: { name: string; quantity: number; unitPrice: string }[];
  payment: { amount: string; status: string; received: boolean } | null;
};

type Notif = { id: number; title: string; body: string; tableNumber: number | null; amount: string | null };

export function ManagerDashboardPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [eta, setEta] = useState<Record<number, { minutes: string; message: string }>>({});

  const gate = useCallback(async () => {
    const me = await apiFetch("/auth/me/");
    if (!me.ok) {
      clearTokens();
      nav("/manager/login");
      return false;
    }
    const j = (await me.json()) as { user?: { role?: string } };
    if (j.user?.role !== "MANAGER" && j.user?.role !== "ADMIN") {
      clearTokens();
      nav("/manager/login");
      return false;
    }
    return true;
  }, [nav]);

  const load = useCallback(async () => {
    if (!(await gate())) return;
    const [o, n] = await Promise.all([apiFetch("/manager/orders/"), apiFetch("/notifications/staff/")]);
    if (o.ok) setOrders(((await o.json()) as { orders: OrderRow[] }).orders ?? []);
    if (n.ok) setNotifications(((await n.json()) as { notifications: Notif[] }).notifications ?? []);
  }, [gate]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  function logout() {
    clearTokens();
    nav("/manager/login");
  }

  async function sendEta(orderId: number, tableNumber: number) {
    const row = eta[orderId] ?? { minutes: "20", message: "" };
    const minutes = Number(row.minutes);
    if (Number.isNaN(minutes) || minutes < 1) return;
    const message =
      row.message.trim() ||
      `Your order for table ${tableNumber} will be ready in about ${minutes} minutes. Thank you!`;
    await apiFetch(`/manager/orders/${orderId}/eta/`, { method: "POST", body: JSON.stringify({ minutes, message }) });
    void load();
  }

  return (
    <div className="page wide">
      <header className="page-header">
        <div>
          <h1>Manager — Mudcup</h1>
          <p className="muted">Live orders, payment status, ETA to customers.</p>
        </div>
        <div className="header-actions">
          <Link to="/admin">Admin</Link>
          <button type="button" className="linkish" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <section className="section">
        <h2>Alerts</h2>
        <ul className="notif-list amber">
          {notifications.length === 0 && <li className="muted">No alerts.</li>}
          {notifications.slice(0, 15).map((n) => (
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
        <h2>Tables & orders</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Order</th>
                <th>Items</th>
                <th>Payment</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>T{o.tableNumber}</strong>
                  </td>
                  <td className="small">
                    {o.status}
                    <div className="muted tiny">{new Date(o.createdAt).toLocaleString()}</div>
                    {o.etaMessage && <div className="eta-sent">Sent: {o.etaMessage}</div>}
                  </td>
                  <td className="small">
                    {o.items.map((i) => (
                      <div key={`${o.id}-${i.name}`}>
                        {i.name} x{i.quantity} (Rs {i.unitPrice})
                      </div>
                    ))}
                  </td>
                  <td className="small">
                    {o.payment ? (
                      <>
                        <div>Rs {o.payment.amount}</div>
                        <div className={o.payment.received ? "ok" : "warn"}>{o.payment.received ? "Received" : "Not received"}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="eta-form">
                      <input
                        className="tiny-input"
                        placeholder="mins"
                        value={eta[o.id]?.minutes ?? ""}
                        onChange={(e) => setEta((m) => ({ ...m, [o.id]: { minutes: e.target.value, message: m[o.id]?.message ?? "" } }))}
                      />
                      <input
                        className="msg-input"
                        placeholder="Message (optional)"
                        value={eta[o.id]?.message ?? ""}
                        onChange={(e) =>
                          setEta((m) => ({ ...m, [o.id]: { minutes: m[o.id]?.minutes ?? "20", message: e.target.value } }))
                        }
                      />
                      <button type="button" className="btn btn-amber small" onClick={() => void sendEta(o.id, o.tableNumber)}>
                        Send ETA
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
