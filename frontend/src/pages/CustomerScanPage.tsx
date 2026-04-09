import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import { pathFromTableQr } from "../lib/qrTable";

const READER_ID = "mudcup-table-qr-reader";

export function CustomerScanPage() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    done.current = false;
    setErr(null);

    const scanner = new Html5QrcodeScanner(
      READER_ID,
      { fps: 10, qrbox: { width: 260, height: 260 } },
      false,
    );

    scanner.render(
      (decodedText) => {
        if (done.current) return;
        const text = decodedText.trim();
        if (text.toLowerCase().startsWith("upi://")) {
          setErr("That QR is for payment. Scan the table QR on your table stand or sticker.");
          return;
        }
        const path = pathFromTableQr(text);
        if (!path) {
          setErr("Could not read a table code. Use the Mudcup table QR (not the payment QR).");
          return;
        }
        done.current = true;
        void scanner.clear().then(() => {
          nav(path);
        });
      },
      () => {
        /* frame error — ignore */
      },
    );

    return () => {
      void scanner.clear().catch(() => {});
    };
  }, [nav]);

  return (
    <div className="page narrow scan-page">
      <header className="table-header">
        <p className="eyebrow">Mudcup</p>
        <h1>Scan table QR</h1>
        <p className="muted small">Allow camera access, then point at the QR on your table to open the menu.</p>
      </header>

      {err && (
        <div className="scan-error" role="alert">
          {err}
        </div>
      )}

      <div id={READER_ID} className="qr-reader-host" />

      <p className="muted small center" style={{ marginTop: "1rem" }}>
        No camera?{" "}
        <Link to="/t/table-1-demo-token" className="demo-table-link">
          Open demo table 1
        </Link>
      </p>

      <p className="center muted" style={{ marginTop: "1.5rem" }}>
        <Link to="/">← Back to home</Link>
      </p>
    </div>
  );
}
