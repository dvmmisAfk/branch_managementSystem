import { Navigate, Outlet } from "react-router-dom";
import { loadStoredTokens } from "../api/client";

export function RequireAuth() {
  if (!loadStoredTokens()) return <Navigate to="/login" replace />;
  return <Outlet />;
}
