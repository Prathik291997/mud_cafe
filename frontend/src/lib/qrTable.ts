/**
 * Turn camera-scanned QR text into an in-app path `/t/:token`, or null if not a table QR.
 */
export function pathFromTableQr(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.toLowerCase().startsWith("upi://")) return null;

  try {
    const u = new URL(t);
    const path = u.pathname.replace(/\/$/, "") || "/";
    const m = path.match(/\/t\/([^/]+)$/);
    if (m?.[1] && /^[\w-]+$/.test(m[1])) return `/t/${m[1]}`;
  } catch {
    /* not a full URL */
  }

  if (/^[\w-]+$/.test(t)) return `/t/${t}`;
  return null;
}
