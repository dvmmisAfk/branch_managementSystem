import { Spin } from "antd";
import { Navigate, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, apiFetch, clearTokens } from "../api/client";

type Me = { role: string };

export function RequireSupervisor() {
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "unauthorized">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        setState(me.role === "supervisor" ? "ok" : "forbidden");
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearTokens();
          setState("unauthorized");
          return;
        }
        setState("forbidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (state === "unauthorized") return <Navigate to="/login" replace />;
  if (state !== "ok") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
