/** Base URL without trailing slash. In dev `.env.development` uses `/api/v1` (Vite proxy). */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
  let s = String(raw).trim();
  if (!s) s = "/api/v1";
  return s.replace(/\/+$/, "");
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let accessToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;

/** Coalesces concurrent 401 refresh storms into a single /auth/refresh round-trip. */
let refreshInFlight: Promise<string | null> | null = null;

export function setTokens(access: string, refresh?: string): void {
  accessToken = access;
  localStorage.setItem("access_token", access);
  if (refresh) localStorage.setItem("refresh_token", refresh);
}

export function clearTokens(): void {
  accessToken = null;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export function loadStoredTokens(): string | null {
  accessToken = localStorage.getItem("access_token");
  return accessToken;
}

async function refreshAccess(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) return null;
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified?: boolean;
  employeeId?: string;
};

/** Sign in: supervisors use email; SFHs use employee ID. Persists tokens when successful. */
export async function loginWithCredentials(loginId: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId: loginId.trim(), password }),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body ?
        String((body as { error: string }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg || "Login failed");
  }
  const data = body as {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  };
  if (!data?.accessToken) throw new ApiError(res.status, "Invalid response from server");
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

/** SFH-only: notify supervisors of a password reset need (no self-service reset link). */
export async function requestSfhPasswordResetFromLogin(employeeId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/auth/sfh/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: employeeId.trim() }),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body ?
        String((body as { error: string }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
}

async function fetchWithAuth(
  path: string,
  init?: RequestInit
): Promise<{ res: Response; text: string }> {
  loadStoredTokens();

  const headers = new Headers(init?.headers ?? {});
  if (
    !headers.has("Content-Type") &&
    init?.body !== undefined &&
    typeof init.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }
  const baseHeaders = headers;

  async function send(tok: string | null): Promise<{ res: Response; text: string }> {
    const h = new Headers(baseHeaders);
    if (tok) h.set("Authorization", `Bearer ${tok}`);
    const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers: h });
    const text = await res.text();
    return { res, text };
  }

  let { res, text } = await send(accessToken);

  if (res.status === 401 && localStorage.getItem("refresh_token")) {
    const next = await refreshAccess();
    if (next) ({ res, text } = await send(next));
  }

  return { res, text };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { res, text } = await fetchWithAuth(path, init);

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { error: text };
    }
  }

  if (!res.ok) {
    if (res.status === 401) clearTokens();
    const message =
      typeof body === "object" && body !== null && "error" in body ?
        String((body as { error: string }).error)
      : res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}

/** GET binary (e.g. PDF/XLSX) with the same auth + refresh behaviour as apiFetch. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  loadStoredTokens();
  const baseInit: RequestInit = { method: "GET" };

  async function send(tok: string | null): Promise<Response> {
    const h = new Headers();
    if (tok) h.set("Authorization", `Bearer ${tok}`);
    return fetch(`${getApiBaseUrl()}${path}`, { ...baseInit, headers: h });
  }

  let res = await send(accessToken);
  if (res.status === 401 && localStorage.getItem("refresh_token")) {
    const next = await refreshAccess();
    if (next) res = await send(next);
  }

  if (!res.ok) {
    if (res.status === 401) clearTokens();
    let message = res.statusText || `HTTP ${res.status}`;
    const text = await res.text();
    if (text) {
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j?.error) message = j.error;
      } catch {
        if (text.length < 500) message = text;
      }
    }
    throw new ApiError(res.status, message);
  }

  return res.blob();
}
