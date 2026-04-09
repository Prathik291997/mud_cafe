import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Props = { tableId: number; bust: number };

export function AdminTableQrPreview({ tableId, bust }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    void (async () => {
      const r = await apiFetch(`/admin/tables/${tableId}/qr.png/`);
      if (cancelled || !r.ok) return;
      const blob = await r.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setSrc(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tableId, bust]);

  if (!src) {
    return <div className="qr-thumb-placeholder muted small">Loading QR…</div>;
  }
  return <img src={src} alt="" className="qr-thumb" width={132} height={132} />;
}
