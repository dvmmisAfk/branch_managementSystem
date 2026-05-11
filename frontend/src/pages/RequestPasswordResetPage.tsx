import { App, Button, Form, Input, Typography } from "antd";
import { Building2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ApiError, requestSfhPasswordResetFromLogin } from "../api/client";

/**
 * SFH-only flow: queues a reset request for supervisors (no email link).
 * Route must stay public (no RequireAuth).
 */
export function RequestPasswordResetPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onFinish(values: { employeeId: string }) {
    setLoading(true);
    try {
      await requestSfhPasswordResetFromLogin(values.employeeId);
      setSubmitted(true);
      void message.success("Request submitted. If that employee ID is active, a supervisor can generate a new password from SFH Management.");
    } catch (e) {
      void message.error(e instanceof ApiError ? e.message : "Could not submit request. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4F46E5 100%)",
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          padding: "clamp(20px, 5vw, 40px)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: "#EEF2FF",
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={26} color="#4F46E5" />
          </div>
          <Typography.Title level={4} style={{ marginTop: 12, marginBottom: 0 }}>
            SFH password help
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
            Enter your SFH employee ID. A supervisor will see a pending request and can set a new password from SFH Management.
          </Typography.Paragraph>
        </div>

        {submitted ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Button type="primary" block size="large" onClick={() => navigate("/login", { replace: true })}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="employeeId"
              label={<span style={{ fontSize: 13, fontWeight: 500 }}>Employee ID</span>}
              rules={[{ required: true, message: "Enter your SFH employee ID" }]}
            >
              <Input placeholder="e.g. SFH-001" autoComplete="username" style={{ height: 42 }} />
            </Form.Item>
            <Button htmlType="submit" type="primary" block loading={loading} size="large" style={{ fontWeight: 600 }}>
              Submit request
            </Button>
          </Form>
        )}

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/login" style={{ fontSize: 13, color: "#4F46E5" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
