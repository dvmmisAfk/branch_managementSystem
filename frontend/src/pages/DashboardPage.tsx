import { App, Alert, Card, Col, Row, Spin, Tag, Table } from "antd";
import {
  MapPin, CheckCircle2, Clock, AlertCircle, Users, Building2, PieChart as PieIcon,
  AlertTriangle, X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell, LabelList,
} from "recharts";
import { ApiError, apiFetch, clearTokens } from "../api/client";
import { fmtPct } from "../components/ui";

type QuarterHeader = {
  label: string | null;
  id: string;
  financial_year: number;
  start: string;
  end: string;
};

type SfhStatRow = {
  sfh_id: string;
  sfh_name: string;
  total_branches: number;
  visited: number;
  pending: number;
  completion_pct: number;
  open_issues: number;
  resolved_issues: number;
  avg_score: number | null;
};

type QuarterlyBreakdown = Record<string, { visited: number; pending: number }>;

type DashSfhPayload = {
  current_quarter: QuarterHeader;
  sfh_stats: SfhStatRow[];
  quarterly_breakdown: QuarterlyBreakdown;
};

type DashSuperPayload = DashSfhPayload & { org_completion_hint?: number };

type Me = { id: string; email: string; name: string; role: string };

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card
      style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
      styles={{ body: { padding: "20px 24px" } }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: iconColor, display: "flex" }}>{icon}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#6B7280" }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#111827", lineHeight: 1 }}>{value}</div>
    </Card>
  );
}

function DaysChip({ days }: { days: number }) {
  const cfg =
    days > 60 ? { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" }
    : days > 30 ? { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" }
    : { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" };
  return (
    <span style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`, borderRadius: 9999, padding: "4px 12px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
      {days} days remaining
    </span>
  );
}

function CompletionBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#4ADE80" : pct >= 50 ? "#4F46E5" : "#FBBF24";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 100, height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { message: _msg } = App.useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [dash, setDash] = useState<DashSuperPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertDismissed, setAlertDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setError(null);
      try {
        const profile = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        setMe(profile);
        let data: DashSuperPayload;
        if (profile.role === "supervisor") {
          data = await apiFetch<DashSuperPayload>("/dashboard/supervisor");
        } else if (profile.role === "sfh") {
          data = await apiFetch<DashSfhPayload>("/dashboard/sfh");
        } else {
          setError("This role is not supported in the web app yet.");
          return;
        }
        if (!cancelled) setDash(data);
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 401) {
          clearTokens();
          navigate("/login", { replace: true });
          return;
        }
        setError(e instanceof Error ? `${e.message} — Is the API running on port 3001?` : "Session expired, or the API failed.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [navigate]);

  if (busy && !dash) {
    return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>;
  }

  if (error && !dash) {
    return (
      <Alert type="error" message={error} style={{ marginBottom: 16 }}
        action={
          <button type="button" onClick={() => { clearTokens(); navigate("/login", { replace: true }); }}
            style={{ cursor: "pointer", border: "none", background: "none", color: "#4F46E5" }}>
            Back to login
          </button>
        }
      />
    );
  }

  const cq = dash?.current_quarter;
  const qb = dash?.quarterly_breakdown;
  const isSfh = me?.role === "sfh";
  const isSupervisor = me?.role === "supervisor";
  const sfhStat = isSfh ? (dash?.sfh_stats?.[0] ?? null) : null;
  const pendingCount = sfhStat?.pending ?? 0;
  const daysRemaining = cq ? Math.ceil((new Date(cq.end).getTime() - Date.now()) / 86_400_000) : null;
  const showPendingAlert = isSfh && daysRemaining !== null && daysRemaining <= 30 && daysRemaining >= 0 && pendingCount > 0;

  const quarterChartData = ["Q1", "Q2", "Q3"].map((q) => ({
    name: q,
    Visited: qb?.[q]?.visited ?? 0,
    Pending: qb?.[q]?.pending ?? 0,
  }));

  const sfhCompletionData = (dash?.sfh_stats ?? [])
    .filter((s) => s.total_branches > 0)
    .sort((a, b) => b.completion_pct - a.completion_pct)
    .map((s) => ({
      name: s.sfh_name.length > 22 ? s.sfh_name.slice(0, 20) + "…" : s.sfh_name,
      pct: s.completion_pct,
      label: `${s.visited}/${s.total_branches}`,
      sfh_id: s.sfh_id,
    }));

  const pieData = sfhStat
    ? [{ name: "Visited", value: sfhStat.visited }, { name: "Pending", value: sfhStat.pending }]
    : [];

  const visibleSfhStats = (dash?.sfh_stats ?? []).filter((s) => s.total_branches > 0);

  const tooltipStyle = { fontSize: 13, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", border: "1px solid #E5E7EB" };

  return (
    <>
      {/* Greeting */}
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827", display: "inline" }}>
          Hello, {me?.name ?? "there"}
        </h1>{" "}
        <Tag style={{ background: "#EEF2FF", color: "#4338CA", border: "none", fontWeight: 600, fontSize: 11, borderRadius: 9999, padding: "2px 10px", verticalAlign: "middle" }}>
          {me?.role}
        </Tag>
      </div>

      {/* Quick actions — supervisor */}
      {isSupervisor && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { icon: <Users size={14} />, label: "Manage SFHs", path: "/sfhs" },
            { icon: <Building2 size={14} />, label: "Branches", path: "/branches" },
          ].map((a) => (
            <button key={a.path} type="button" onClick={() => navigate(a.path)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer", transition: "all 150ms ease" }}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Quarter banner */}
      {cq && (
        <div style={{ background: "#fff", borderLeft: "4px solid #4F46E5", borderRadius: 10, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>{cq.label ?? "Current Quarter"}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
              FY {cq.financial_year} · {cq.start.slice(0, 10)} → {cq.end.slice(0, 10)}
            </div>
          </div>
          {daysRemaining !== null && <DaysChip days={daysRemaining} />}
        </div>
      )}

      {/* Alert banner — SFH */}
      {showPendingAlert && cq && !alertDismissed && (
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={16} color="#D97706" />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#78350F" }}>
              {pendingCount} {pendingCount === 1 ? "branch" : "branches"} still pending · {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left in {cq.label ?? "current quarter"}
            </span>
          </div>
          <button type="button" onClick={() => setAlertDismissed(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#B45309", display: "flex", padding: 4 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* SFH stat cards */}
      {isSfh && sfhStat && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}><StatCard icon={<MapPin size={18} />} iconBg="#EEF2FF" iconColor="#4F46E5" label="Total Assigned" value={sfhStat.total_branches} /></Col>
          <Col xs={24} sm={12} md={6}><StatCard icon={<CheckCircle2 size={18} />} iconBg="#F0FDF4" iconColor="#059669" label="Visited this Q" value={sfhStat.visited} /></Col>
          <Col xs={24} sm={12} md={6}><StatCard icon={<Clock size={18} />} iconBg="#FFFBEB" iconColor="#D97706" label="Pending this Q" value={sfhStat.pending} /></Col>
          <Col xs={24} sm={12} md={6}><StatCard icon={<AlertCircle size={18} />} iconBg="#FEF2F2" iconColor="#DC2626" label="Open Issues" value={sfhStat.open_issues} /></Col>
        </Row>
      )}

      {/* Supervisor stat cards */}
      {isSupervisor && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}><StatCard icon={<Building2 size={18} />} iconBg="#EEF2FF" iconColor="#4F46E5" label="Total Branches" value={visibleSfhStats.reduce((s, r) => s + r.total_branches, 0)} /></Col>
          <Col xs={24} sm={12} md={6}><StatCard icon={<Users size={18} />} iconBg="#EEF2FF" iconColor="#6366F1" label="Total SFHs" value={visibleSfhStats.length} /></Col>
          <Col xs={24} sm={12} md={6}><StatCard icon={<PieIcon size={18} />} iconBg="#F0FDF4" iconColor="#059669" label="Org Completion" value={`${dash?.org_completion_hint?.toFixed(1) ?? "—"}%`} /></Col>
          <Col xs={24} sm={12} md={6}><StatCard icon={<AlertCircle size={18} />} iconBg="#FEF2F2" iconColor="#DC2626" label="Open Issues" value={visibleSfhStats.reduce((s, r) => s + r.open_issues, 0)} /></Col>
        </Row>
      )}

      {/* Charts row */}
      {qb && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {isSupervisor && sfhCompletionData.length > 0 && (
            <Col xs={24} lg={14}>
              <Card title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>SFH Completion — Current Quarter</span>}
                style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }}
                styles={{ body: { padding: "16px 20px" } }}>
                <ResponsiveContainer width="100%" height={Math.max(200, sfhCompletionData.length * 44 + 40)}>
                  <BarChart data={sfhCompletionData} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => v + "%"} tick={{ fontSize: 11, fill: "#6B7280" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#374151" }} width={130} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Completion"]} contentStyle={tooltipStyle} />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="label" position="right" style={{ fontSize: 11, fill: "#6B7280" }} />
                      {sfhCompletionData.map((e, i) => (
                        <Cell key={i} fill={e.pct >= 80 ? "#4ADE80" : e.pct >= 50 ? "#4F46E5" : "#FBBF24"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          )}

          <Col xs={24} lg={isSupervisor && sfhCompletionData.length > 0 ? 10 : isSfh && sfhStat?.total_branches ? 14 : 24}>
            <Card title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{isSupervisor ? "Quarterly Breakdown — Org Wide" : "Quarterly Progress — FY" + (cq?.financial_year ?? "")}</span>}
              style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
              styles={{ body: { padding: "16px 20px" } }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={quarterChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#374151" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Visited" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pending" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          {isSfh && sfhStat && sfhStat.total_branches > 0 && (
            <Col xs={24} lg={10}>
              <Card title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Current Quarter</span>}
                style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
                styles={{ body: { padding: "16px 20px" } }}>
                <div style={{ position: "relative" }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <RPieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
                        <Cell fill="#4F46E5" />
                        <Cell fill="#E5E7EB" />
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </RPieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -70%)", textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{sfhStat.visited}/{sfhStat.total_branches}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>branches</div>
                  </div>
                </div>
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* SFH snapshot table */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>
          {isSupervisor ? "SFH Performance — Current Quarter" : "SFH Snapshot"}
        </span>
        {visibleSfhStats.length > 0 && (
          <span style={{ background: "#F3F4F6", color: "#374151", fontSize: 12, padding: "2px 8px", borderRadius: 9999 }}>
            {visibleSfhStats.length}
          </span>
        )}
      </div>

      <Card style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }} styles={{ body: { padding: 0 } }}>
        <Table<SfhStatRow>
          rowKey="sfh_id"
          pagination={visibleSfhStats.length > 15 ? { pageSize: 15 } : false}
          dataSource={visibleSfhStats}
          onRow={(r) => isSupervisor ? { onClick: () => navigate(`/branches?sfh_id=${r.sfh_id}`), style: { cursor: "pointer" } } : {}}
          columns={[
            {
              title: "SFH", key: "name",
              render: (_, r) => <span style={{ fontSize: 14, fontWeight: 500, color: isSupervisor ? "#4F46E5" : "#111827" }}>{r.sfh_name}</span>,
            },
            { title: "Mapped", dataIndex: "total_branches", key: "tb", render: (v) => <span style={{ fontSize: 13 }}>{v}</span> },
            { title: "Visited", dataIndex: "visited", key: "vis", render: (v: number) => <span style={{ fontSize: 13, color: v > 0 ? "#059669" : "#9CA3AF" }}>{v}</span> },
            {
              title: "Pending", key: "pen",
              render: (_, r) => <span style={{ fontSize: 13, fontWeight: r.pending > 0 ? 600 : 400, color: r.pending === r.total_branches && r.total_branches > 0 ? "#DC2626" : r.pending > 0 ? "#D97706" : "#9CA3AF" }}>{r.pending}</span>,
            },
            { title: "Completion", key: "cp", render: (_, r) => <CompletionBar pct={r.completion_pct} /> },
            { title: "Open Issues", dataIndex: "open_issues", key: "oi", render: (v: number) => <span style={{ color: v > 0 ? "#DC2626" : "#9CA3AF", fontSize: 13 }}>{v}</span> },
            { title: "Resolved", dataIndex: "resolved_issues", key: "ri", render: (v) => <span style={{ color: "#374151", fontSize: 13 }}>{v}</span> },
            {
              title: "Avg Score", key: "as",
              render: (_, r) => r.avg_score != null
                ? <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{fmtPct(r.avg_score)}</span>
                : <span style={{ color: "#9CA3AF" }}>—</span>,
            },
          ]}
          size="middle"
          scroll={{ x: true }}
        />
      </Card>
    </>
  );
}
