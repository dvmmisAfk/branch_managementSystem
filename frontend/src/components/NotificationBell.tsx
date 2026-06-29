import { App, Badge, Button, List, Popover, Tag, Typography } from "antd";
import { Bell, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../api/client";

type ResetRequest = {
  id: string;
  createdAt: string;
  sfhName: string;
  employeeId: string | null;
};

const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell({ role }: { role: string }) {
  const { message, modal } = App.useApp();
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await apiFetch<ResetRequest[]>("/sfhs/password-reset-requests");
      setRequests(data);
    } catch {
      // silent — don't interrupt the user if a background poll fails
    }
  }, []);

  useEffect(() => {
    if (role !== "supervisor") return;
    void fetchRequests();
    intervalRef.current = setInterval(() => { void fetchRequests(); }, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [role, fetchRequests]);

  if (role !== "supervisor") return null;

  async function handleFulfill(req: ResetRequest) {
    setFulfilling(req.id);
    try {
      const { revealToken } = await apiFetch<{ revealToken: string }>(
        `/sfhs/password-reset-requests/${req.id}/fulfill`,
        { method: "POST" },
      );
      const { password } = await apiFetch<{ password: string }>(
        `/sfhs/password-reveal/${revealToken}`,
      );
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      setOpen(false);
      modal.success({
        title: `Password reset — ${req.sfhName}`,
        width: 440,
        okText: "Done",
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>New temporary password for <strong>{req.sfhName}</strong>:</p>
            <Typography.Text
              code
              copyable
              style={{ fontSize: 15, letterSpacing: 1, display: "block" }}
            >
              {password}
            </Typography.Text>
            <p style={{ marginTop: 12, fontSize: 12, color: "#6B7280", marginBottom: 0 }}>
              Share this securely. It cannot be shown again from this dialog.
            </p>
          </div>
        ),
      });
    } catch (e) {
      void message.error(
        e instanceof ApiError ? e.message : "Failed to reset password. Try again.",
      );
    } finally {
      setFulfilling(null);
    }
  }

  async function handleManualRefresh() {
    setLoading(true);
    try {
      await fetchRequests();
    } finally {
      setLoading(false);
    }
  }

  const popoverTitle = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        Password Reset Requests
        {requests.length > 0 && (
          <Tag color="red" style={{ marginLeft: 8 }}>
            {requests.length}
          </Tag>
        )}
      </span>
      <Button
        type="text"
        size="small"
        icon={<RefreshCw size={13} />}
        loading={loading}
        onClick={() => { void handleManualRefresh(); }}
        aria-label="Refresh"
        style={{ color: "#6B7280" }}
      />
    </div>
  );

  const popoverContent = (
    <div style={{ width: 340, maxHeight: 420, overflowY: "auto" }}>
      {requests.length === 0 ? (
        <div
          style={{
            padding: "28px 0",
            textAlign: "center",
            color: "#9CA3AF",
            fontSize: 13,
          }}
        >
          No pending password reset requests
        </div>
      ) : (
        <List
          size="small"
          dataSource={requests}
          renderItem={(req) => (
            <List.Item
              key={req.id}
              style={{ alignItems: "flex-start", gap: 8 }}
              actions={[
                <Button
                  key="fulfill"
                  size="small"
                  type="primary"
                  loading={fulfilling === req.id}
                  disabled={fulfilling !== null && fulfilling !== req.id}
                  onClick={() => { void handleFulfill(req); }}
                >
                  Set password
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <span style={{ fontSize: 13 }}>
                    {req.sfhName}
                    {req.employeeId && (
                      <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>
                        {req.employeeId}
                      </Tag>
                    )}
                  </span>
                }
                description={
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    Requested {timeAgo(req.createdAt)}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  const hasRequests = requests.length > 0;

  return (
    <Popover
      content={popoverContent}
      title={popoverTitle}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      overlayStyle={{ zIndex: 1050 }}
    >
      <Badge
        count={requests.length}
        size="small"
        offset={[-2, 2]}
        styles={{ indicator: { pointerEvents: "none" } }}
      >
        <Button
          type="text"
          aria-label={`Notifications${hasRequests ? ` — ${requests.length} pending` : ""}`}
          icon={
            <Bell
              size={18}
              color={hasRequests ? "#FBBF24" : "rgba(255,255,255,0.65)"}
              style={{ display: "block" }}
            />
          }
          style={{ color: "#fff", padding: "4px 8px", display: "flex", alignItems: "center" }}
        />
      </Badge>
    </Popover>
  );
}
