import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { apiFetch } from "../lib/api";
import { buildUpiPayUri } from "../lib/upi";

type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  supplierName: string | null;
  imageUrl?: string | null;
};
type PublicOffer = { id: number; title: string; body: string; releasedAt: string | null };
type PublicCombo = {
  id: number;
  title: string;
  description: string;
  originalPrice: string;
  comboPrice: string;
  releasedAt: string | null;
};

type PayConfig = { upiPa: string; payeeName: string };

export function TablePage() {
  const { token } = useParams<{ token: string }>();
  const [table, setTable] = useState<{ number: number; label: string | null } | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "bad">("loading");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [combos, setCombos] = useState<PublicCombo[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [step, setStep] = useState<"menu" | "review" | "pay" | "done">("menu");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [customerToken, setCustomerToken] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [etaMessage, setEtaMessage] = useState<string | null>(null);
  const [payConfig, setPayConfig] = useState<PayConfig | null>(null);
  const [bankDetails, setBankDetails] = useState("");
  const [review, setReview] = useState({ email: "", rating: 5, comment: "", subscribe: true });

  const loadTableAndMenu = useCallback(async (t: string) => {
    setLoadState("loading");
    const trRes = await apiFetch(`/tables/by-token/${t}/`, { auth: false });
    const tr = await trRes.json().catch(() => ({}));
    if (!trRes.ok || !(tr as { table?: unknown }).table) {
      setTable(null);
      setLoadState("bad");
      return;
    }
    const tbl = (tr as { table: { number: number; label: string | null } }).table;
    setTable(tbl);
    const [mr, ar] = await Promise.all([apiFetch("/menu/", { auth: false }), apiFetch("/announcements/", { auth: false })]);
    const menuJson = await mr.json().catch(() => ({}));
    if (menuJson.items) setMenu(menuJson.items);
    const annJson = await ar.json().catch(() => ({}));
    if (annJson.offers) setOffers(annJson.offers);
    if (annJson.combos) setCombos(annJson.combos);
    setLoadState("ok");
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadTableAndMenu(token);
  }, [token, loadTableAndMenu]);

  const total = useMemo(() => {
    let sum = 0;
    for (const [id, qty] of Object.entries(cart)) {
      const item = menu.find((m) => m.id === Number(id));
      if (item) sum += Number(item.price) * qty;
    }
    return sum;
  }, [cart, menu]);

  const reviewLines = useMemo(() => {
    const lines: { name: string; qty: number; unit: string; line: number }[] = [];
    for (const [id, qty] of Object.entries(cart)) {
      const item = menu.find((m) => m.id === Number(id));
      if (item && qty > 0) {
        const unit = Number(item.price);
        lines.push({ name: item.name, qty, unit: item.price, line: unit * qty });
      }
    }
    return lines;
  }, [cart, menu]);

  useEffect(() => {
    if (step !== "pay") return;
    let cancelled = false;

    (async () => {
      const envPa = import.meta.env.VITE_UPI_PA as string | undefined;
      const envName = (import.meta.env.VITE_UPI_PAYEE_NAME as string | undefined) || "Mudcup";
      if (envPa) {
        if (!cancelled) setPayConfig({ upiPa: envPa.trim(), payeeName: envName });
        return;
      }
      const r = await apiFetch("/payment-config/", { auth: false });
      const j = (await r.json().catch(() => ({}))) as { upiPa?: string; payeeName?: string };
      if (!cancelled) {
        setPayConfig({
          upiPa: (j.upiPa || "").trim(),
          payeeName: j.payeeName || "Mudcup",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step]);

  const upiUri = useMemo(() => {
    if (!payConfig?.upiPa || orderId == null || !orderTotal || !table) return "";
    return buildUpiPayUri({
      upiPa: payConfig.upiPa,
      payeeName: payConfig.payeeName,
      amount: Number(orderTotal).toFixed(2),
      transactionNote: `Mudcup T${table.number} #${orderId}`,
    });
  }, [payConfig, orderId, orderTotal, table]);

  function addToCart(id: number) {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }

  function decFromCart(id: number) {
    setCart((c) => {
      const next = { ...c };
      const q = (next[id] ?? 0) - 1;
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
  }

  async function placeOrder() {
    if (!token) return;
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId: String(menuItemId), quantity }));
    if (items.length === 0) return;
    const res = await apiFetch("/orders/", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ tableToken: token, items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((data as { error?: string }).error ?? "Order failed");
      return;
    }
    const d = data as { orderId: number; customerToken: string; total: string };
    setOrderId(d.orderId);
    setCustomerToken(d.customerToken);
    setOrderTotal(d.total);
    setStep("pay");
  }

  async function confirmPayment() {
    if (orderId == null || !customerToken) return;
    const res = await apiFetch(`/orders/${orderId}/pay/`, {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        customerToken,
        method: "UPI",
        bankDetails: bankDetails.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((data as { error?: string }).error ?? "Could not confirm payment");
      return;
    }
    setStep("done");
    setOrderStatus("PAID");
  }

  useEffect(() => {
    if (orderId == null || !customerToken || step !== "done") return;
    const t = setInterval(async () => {
      const r = await apiFetch(`/orders/${orderId}/?token=${encodeURIComponent(customerToken)}`, { auth: false });
      const data = await r.json().catch(() => ({}));
      const order = (data as { order?: { status?: string; etaMessage?: string | null } }).order;
      if (order) {
        setOrderStatus(order.status ?? null);
        setEtaMessage(order.etaMessage ?? null);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [orderId, customerToken, step]);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch("/reviews/", {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        email: review.email,
        rating: review.rating,
        comment: review.comment,
        subscribeOffers: review.subscribe,
      }),
    });
    alert("Thanks for your feedback!");
  }

  if (!token || loadState === "loading") {
    return (
      <div className="page center">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (loadState === "bad") {
    return (
      <div className="page center narrow">
        <p>Invalid table QR.</p>
        <Link to="/customer">Scan again</Link>
        {" · "}
        <Link to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="page narrow table-page">
      <header className="table-header">
        <p className="eyebrow">Mudcup</p>
        <h1>
          Table {table?.number}
          {table?.label ? <span className="muted"> — {table.label}</span> : null}
        </h1>
      </header>

      {step === "menu" && (
        <>
          {(offers.length > 0 || combos.length > 0) && (
            <section className="section">
              <h2>Today's announcements</h2>
              {offers.length > 0 && (
                <>
                  <p className="muted small">Offers</p>
                  <ul className="offer-list">
                    {offers.map((o) => (
                      <li key={`offer-${o.id}`} className="offer-item">
                        <span className="strong">{o.title}</span>
                        <p className="small">{o.body}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {combos.length > 0 && (
                <>
                  <p className="muted small">Combo deals</p>
                  <ul className="offer-list">
                    {combos.map((c) => (
                      <li key={`combo-${c.id}`} className="offer-item">
                        <span className="strong">{c.title}</span>
                        <p className="small">{c.description}</p>
                        <p className="small">
                          <span className="muted">Was Rs {c.originalPrice}</span> {" -> "} <strong>Now Rs {c.comboPrice}</strong>
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <ul className="menu-list">
            {menu.map((m) => (
              <li key={m.id} className="menu-card">
                <div className="menu-body">
                  {m.imageUrl && <img src={m.imageUrl} alt={m.name} className="menu-item-image" />}
                  <p className="menu-name">{m.name}</p>
                  {m.description && <p className="muted small">{m.description}</p>}
                  {m.supplierName && <p className="supplier">{m.supplierName}</p>}
                  <p className="price">Rs {m.price}</p>
                </div>
                <div className="menu-actions">
                  <span>Qty {cart[m.id] ?? 0}</span>
                  <div>
                    <button type="button" className="btn tiny" onClick={() => decFromCart(m.id)}>
                      −
                    </button>
                    <button type="button" className="btn btn-primary tiny" onClick={() => addToCart(m.id)}>
                      +
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="cart-footer">
            <span className="strong">Total Rs {total.toFixed(2)}</span>
            <button type="button" className="btn btn-primary" disabled={total <= 0} onClick={() => setStep("review")}>
              Review order
            </button>
          </div>
        </>
      )}

      {step === "review" && (
        <div className="section review-block">
          <h2>Your order</h2>
          <ul className="review-lines">
            {reviewLines.map((l) => (
              <li key={l.name}>
                <span>
                  {l.name} × {l.qty}
                </span>
                <span>Rs {l.line.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="review-total strong">Total Rs {total.toFixed(2)}</p>
          <div className="review-actions">
            <button type="button" className="btn btn-outline" onClick={() => setStep("menu")}>
              Back to menu
            </button>
            <button type="button" className="btn btn-primary" disabled={reviewLines.length === 0} onClick={() => void placeOrder()}>
              Continue to payment
            </button>
          </div>
          <p className="muted small">Next: scan the café payment QR with your UPI app, then confirm below.</p>
        </div>
      )}

      {step === "pay" && (
        <div className="section pay-block">
          <h2>Pay with UPI</h2>
          <p className="muted small">
            1. Open PhonePe, Google Pay, Paytm, or any UPI app.<br />
            2. Scan the QR below (or pay to the ID shown).<br />
            3. Enter the amount <strong>Rs {orderTotal ?? total.toFixed(2)}</strong> if your app asks.<br />
            4. After payment succeeds, tap <strong>Confirm order</strong>.
          </p>

          <div className="payment-qr-wrap">
            {upiUri ? (
              <div className="payment-qr-box">
                <QRCode value={upiUri} size={220} level="M" />
                <p className="muted tiny center">Scan to pay</p>
              </div>
            ) : (
              <div className="payment-qr-fallback card">
                <p className="small">
                  <strong>UPI ID not configured.</strong> Ask staff for the Mudcup payment QR or pay at the counter, then
                  confirm here.
                </p>
                {payConfig?.upiPa === "" && (
                  <p className="tiny muted">
                    Admin: set <code>MUDCUP_UPI_PA</code> on the server or <code>VITE_UPI_PA</code> for the web build.
                  </p>
                )}
              </div>
            )}
          </div>

          <label className="pay-note">
            UPI reference / transaction ID (optional)
            <input
              value={bankDetails}
              onChange={(e) => setBankDetails(e.target.value)}
              placeholder="e.g. last 4 digits or UPI ref"
            />
          </label>

          <button type="button" className="btn btn-primary pay-confirm" onClick={() => void confirmPayment()}>
            I’ve paid — confirm order
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="section">
          <div className="success-banner">
            <p className="strong">Order confirmed — thank you!</p>
            <p className="small">Status: {orderStatus}</p>
            {etaMessage && <p className="eta">Kitchen update: {etaMessage}</p>}
            {!etaMessage && <p className="muted small">Waiting for ETA from the manager…</p>}
          </div>
          <h2>Review & offers</h2>
          <form className="form" onSubmit={submitReview}>
            <input
              required
              type="email"
              placeholder="Your email"
              value={review.email}
              onChange={(e) => setReview((r) => ({ ...r, email: e.target.value }))}
            />
            <label className="inline">
              Rating{" "}
              <select value={review.rating} onChange={(e) => setReview((r) => ({ ...r, rating: Number(e.target.value) }))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Comments"
              value={review.comment}
              onChange={(e) => setReview((r) => ({ ...r, comment: e.target.value }))}
            />
            <label className="inline">
              <input
                type="checkbox"
                checked={review.subscribe}
                onChange={(e) => setReview((r) => ({ ...r, subscribe: e.target.checked }))}
              />{" "}
              Email me offers
            </label>
            <button type="submit" className="btn btn-primary">
              Submit review
            </button>
          </form>
        </div>
      )}

      <p className="center muted">
        <Link to="/">Home</Link>
        {" · "}
        <Link to="/customer">Scan another table</Link>
      </p>
    </div>
  );
}
