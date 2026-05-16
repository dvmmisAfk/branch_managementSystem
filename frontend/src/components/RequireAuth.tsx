import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useEffect, useState } from "react";
import { bootstrapSession, loadStoredTokens } from "../api/client";

export function RequireAuth() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (loadStoredTokens()) {
        if (!cancelled) {
          setAuthed(true);
          setReady(true);
        }
        return;
      }
      const ok = await bootstrapSession();
      if (!cancelled) {
        setAuthed(ok);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div style={{ padding: 48, textAlign: "center", minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
