/**
 * Proxies /api/v1/* to the Render backend so the browser stays same-origin on any Vercel domain
 * (including custom domains). Set BACKEND_API_ORIGIN in Vercel → Environment Variables.
 */
const DEFAULT_BACKEND = "https://branch-visit-backend.onrender.com";

export const config = {
  matcher: "/api/v1/:path*",
};

export default async function middleware(request: Request): Promise<Response> {
  const backend = (process.env.BACKEND_API_ORIGIN ?? DEFAULT_BACKEND).replace(/\/+$/, "");
  const incoming = new URL(request.url);
  const target = `${backend}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  return fetch(target, init);
}
