import { App, Button, Form, Input, Spin } from "antd";
import { Building2, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, bootstrapSession, loadStoredTokens, loginWithCredentials } from "../api/client";

// Max lengths enforced both here (UX) and in backend Zod schema (authoritative).
const LOGIN_ID_MAX = 254;
const PASSWORD_MAX = 128;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    void (async () => {
      if (loadStoredTokens() || (await bootstrapSession())) {
        navigate(redirectTo, { replace: true });
      }
    })();
  }, [navigate, redirectTo]);

  async function onFinish(values: { loginId: string; password: string }) {
    const loginId = values.loginId.trim();
    const password = values.password;

    // Front-end sanity guards (backend enforces the same rules authoritatively).
    if (!loginId || !password) return;
    if (loginId.length > LOGIN_ID_MAX) {
      void message.error("Login ID is too long.");
      return;
    }
    if (password.length > PASSWORD_MAX) {
      void message.error("Password is too long.");
      return;
    }

    setLoading(true);
    try {
      const user = await loginWithCredentials(loginId, password);
      void message.success(`Welcome, ${user.name}`);
      navigate(redirectTo, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        void message.error(e.message);
      } else {
        void message.error("Cannot reach the API. Ensure the backend is running.");
      }
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
        padding: "24px 16px",
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
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: "#EEF2FF",
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={28} color="#4F46E5" />
          </div>
          <h1 style={{ margin: "16px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>
            Branch Visit Tracker
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
            Work email · SFH: employee ID
          </p>
        </div>

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="loginId"
            label={<span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Email or employee ID</span>}
            rules={[
              { required: true, message: "Enter your work email or SFH employee ID" },
              { max: LOGIN_ID_MAX, message: `Must be ${LOGIN_ID_MAX} characters or fewer` },
            ]}
            style={{ marginBottom: 16 }}
          >
            <Input
              placeholder="Work email or SFH employee ID"
              autoComplete="username"
              maxLength={LOGIN_ID_MAX}
              style={{ height: 40 }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Password</span>}
            rules={[
              { required: true, message: "Enter your password" },
              { max: PASSWORD_MAX, message: `Must be ${PASSWORD_MAX} characters or fewer` },
            ]}
            style={{ marginBottom: 20 }}
          >
            <Input
              type={showPass ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              maxLength={PASSWORD_MAX}
              style={{ height: 40 }}
              suffix={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  onClick={() => setShowPass((p: boolean) => !p)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#9CA3AF",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </Form.Item>

          <Button
            htmlType="submit"
            type="primary"
            block
            disabled={loading}
            style={{ height: 44, fontSize: 14, fontWeight: 600 }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Spin size="small" /> Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </Button>
        </Form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/request-password-reset" style={{ fontSize: 13, color: "#4F46E5" }}>
            SFH forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
