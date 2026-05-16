import { Button } from "antd";
import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <>
      <h1 style={{ fontSize: 48, margin: 0, color: "#111827", textAlign: "center", paddingTop: 48 }}>404</h1>
      <p style={{ color: "#6B7280", textAlign: "center" }}>This page does not exist.</p>
      <p style={{ textAlign: "center", paddingBottom: 48 }}>
        <Button type="primary" onClick={() => navigate("/dashboard")}>
          Go to dashboard
        </Button>
      </p>
    </>
  );
}
