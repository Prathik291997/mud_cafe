const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

const ACCESS_KEY = "mudcup_access";
const REFRESH_KEY = "mudcup_refresh";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function apiFetch(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const { auth = true, headers: h, ...rest } = init;
  const headers = new Headers(h);
  if (auth) {
    const t = getAccessToken();
    if (t) headers.set("Authorization", `Bearer ${t}`);
  }
  if (rest.body != null && !(rest.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers,
  });
  return res;
}

/** Best-effort message from failed JSON API responses (e.g. DRF / SimpleJWT). */
export async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as Record<string, unknown>;
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail) && j.detail.length) return j.detail.map(String).join(" ");
    const nfe = j.non_field_errors;
    if (Array.isArray(nfe) && nfe.length) return nfe.map(String).join(" ");
    if (typeof nfe === "string") return nfe;
    if (j.email && Array.isArray(j.email)) return j.email.map(String).join(" ");
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export { API_BASE };
