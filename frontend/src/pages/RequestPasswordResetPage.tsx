import { App, Button, Form, Input, Typography } from "antd";
import { Building2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ApiError, requestSfhPasswordResetFromLogin } from "../api/client";

// SFH employee codes are short (e.g. SFH-101). 50 chars is a generous ceiling.
const EMPLOYEE_ID_MAX = 50;

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
    const employeeId = values.employeeId.trim();
    if (!employeeId) return;

    setLoading(true);
    try {
      await requestSfhPasswordResetFromLogin(employeeId);
      setSubmitted(true);
      void message.success(
        "Request submitted. If that employee ID is active, a supervisor will see a notification to set a new password.",
      );
    } catch (e) {
      void message.error(
        e instanceof ApiError ? e.message : "Could not submit request. Try again later.",
      );
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
            Enter your SFH employee ID. Your supervisor will receive a notification and can set a new password.
          </Typography.Paragraph>
        </div>

        {submitted ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 8,
                padding: "12px 16px",
                fontSize: 13,
                color: "#166534",
                textAlign: "center",
                marginBottom: 4,
              }}
            >
              Request submitted. Your supervisor has been notified and will set a new password shortly.
            </div>
            <Button type="primary" block size="large" onClick={() => navigate("/login", { replace: true })}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="employeeId"
              label={<span style={{ fontSize: 13, fontWeight: 500 }}>Employee ID</span>}
              rules={[
                { required: true, message: "Enter your SFH employee ID" },
                {
                  pattern: /^[A-Za-z0-9\-]{2,50}$/,
                  message: "Employee ID should contain only letters, numbers, and hyphens",
                },
                { max: EMPLOYEE_ID_MAX, message: `Must be ${EMPLOYEE_ID_MAX} characters or fewer` },
              ]}
            >
              <Input
                placeholder="e.g. SFH-101"
                autoComplete="username"
                maxLength={EMPLOYEE_ID_MAX}
                style={{ height: 42 }}
              />
            </Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              block
              loading={loading}
              size="large"
              style={{ fontWeight: 600 }}
            >
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
