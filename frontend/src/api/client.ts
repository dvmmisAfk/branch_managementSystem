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
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** In-memory access token (not persisted — refresh uses HttpOnly cookie). */
let accessToken: string | null = null;

let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(access: string | null): void {
  accessToken = access;
}

/** True if we have a session (memory token or existing HttpOnly cookies from prior page load). */
export function hasSessionHint(): boolean {
  return accessToken !== null;
}

export function clearTokens(): void {
  accessToken = null;
}

export function loadStoredTokens(): string | null {
  return accessToken;
}

async function refreshAccess(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const data = (await res.json()) as { accessToken: string };
      if (!data?.accessToken) {
        clearTokens();
        return null;
      }
      setAccessToken(data.accessToken);
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

/** Sign in: supervisors use email; SFHs use employee ID. Sets HttpOnly cookies + in-memory access token. */
export async function loginWithCredentials(loginId: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ loginId: loginId.trim(), password }),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body ?
        String((body as { error: string }).error)
      : `HTTP ${res.status}`;
    const code =
      typeof body === "object" && body !== null && "code" in body ?
        String((body as { code: string }).code)
      : undefined;
    throw new ApiError(res.status, msg || "Login failed", code);
  }
  const data = body as {
    accessToken: string;
    user: AuthUser;
  };
  if (!data?.accessToken) throw new ApiError(res.status, "Invalid response from server");
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    clearTokens();
  }
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
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: h,
      credentials: "include",
    });
    const text = await res.text();
    return { res, text };
  }

  let { res, text } = await send(accessToken);

  if (res.status === 401) {
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
    const code =
      typeof body === "object" && body !== null && "code" in body ?
        String((body as { code: string }).code)
      : undefined;
    throw new ApiError(res.status, message, code);
  }

  return body as T;
}

/** GET binary (e.g. PDF/XLSX) with the same auth + refresh behaviour as apiFetch. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const baseInit: RequestInit = { method: "GET" };

  async function send(tok: string | null): Promise<Response> {
    const h = new Headers();
    if (tok) h.set("Authorization", `Bearer ${tok}`);
    return fetch(`${getApiBaseUrl()}${path}`, {
      ...baseInit,
      headers: h,
      credentials: "include",
    });
  }

  let res = await send(accessToken);
  if (res.status === 401) {
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

/** Bootstrap session on app load via refresh cookie (no localStorage). */
export async function bootstrapSession(): Promise<boolean> {
  const tok = await refreshAccess();
  return tok !== null;
}
