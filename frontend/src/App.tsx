import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Spin } from "antd";
import { LoginPage } from "./pages/LoginPage";
import { RequestPasswordResetPage } from "./pages/RequestPasswordResetPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireAuth } from "./components/RequireAuth";
import { RequireSupervisor } from "./components/RequireSupervisor";
import { AppLayout } from "./components/AppLayout";

const DashboardPage = lazy(async () => {
  const m = await import("./pages/DashboardPage");
  return { default: m.DashboardPage };
});
const VisitsPage = lazy(async () => {
  const m = await import("./pages/VisitsPage");
  return { default: m.VisitsPage };
});
const VisitDetailPage = lazy(async () => {
  const m = await import("./pages/VisitDetailPage");
  return { default: m.VisitDetailPage };
});
const SfhManagementPage = lazy(async () => {
  const m = await import("./pages/SfhManagementPage");
  return { default: m.SfhManagementPage };
});
const BranchesManagementPage = lazy(async () => {
  const m = await import("./pages/BranchesManagementPage");
  return { default: m.BranchesManagementPage };
});
const ScorecardPage = lazy(async () => {
  const m = await import("./pages/ScorecardPage");
  return { default: m.ScorecardPage };
});

function PageFallback() {
  return (
    <div style={{ padding: 48, textAlign: "center", minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spin size="large" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/request-password-reset" element={<RequestPasswordResetPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/visits" element={<VisitsPage />} />
              <Route path="/visits/:id" element={<VisitDetailPage />} />
              <Route element={<RequireSupervisor />}>
                <Route path="/sfhs" element={<SfhManagementPage />} />
                <Route path="/mappings" element={<Navigate to="/branches" replace />} />
                <Route path="/branches" element={<BranchesManagementPage />} />
                <Route path="/scorecard" element={<ScorecardPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
