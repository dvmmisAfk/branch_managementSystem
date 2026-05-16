import type { ReactNode } from "react";
import dayjs from "dayjs";

/* ─── Score Band Badge ─────────────────────────────────────────────────── */

type ScoreBandType = "excellent" | "good" | "satisfactory" | "needs_improvement" | "critical" | "not_applicable";

const BAND_CONFIG: Record<
  ScoreBandType,
  { label: string; bg: string; text: string; dot: string }
> = {
  excellent:         { label: "Excellent",          bg: "#D1FAE5", text: "#065F46", dot: "#059669" },
  good:              { label: "Good",               bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB" },
  satisfactory:      { label: "Satisfactory",       bg: "#FEF3C7", text: "#92400E", dot: "#D97706" },
  needs_improvement: { label: "Needs Improvement",  bg: "#FFEDD5", text: "#9A3412", dot: "#EA580C" },
  critical:          { label: "Critical",           bg: "#FEE2E2", text: "#991B1B", dot: "#DC2626" },
  not_applicable:    { label: "N/A",                bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF" },
};

export function ScoreBandBadge({ band }: { band: string | null | undefined }) {
  if (!band) return <span style={{ color: "#9CA3AF" }}>—</span>;
  const cfg = BAND_CONFIG[band as ScoreBandType];
  if (!cfg) return <span style={{ color: "#9CA3AF" }}>{band}</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: cfg.bg,
        color: cfg.text,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 9999,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}

/* ─── Status Badge ─────────────────────────────────────────────────────── */

type StatusType = "draft" | "submitted" | "pending";

const STATUS_CONFIG: Record<StatusType, { label: string; bg: string; text: string; dot: string }> = {
  draft:     { label: "Draft",     bg: "#FEF9C3", text: "#713F12", dot: "#D97706" },
  submitted: { label: "Submitted", bg: "#D1FAE5", text: "#065F46", dot: "#059669" },
  pending:   { label: "Pending",   bg: "#EDE9FE", text: "#5B21B6", dot: "#7C3AED" },
};

export function StatusBadge({ status }: { status: "draft" | "submitted" | "pending" }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: cfg.bg,
        color: cfg.text,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 9999,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

/* ─── Category Badge ───────────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "housekeeping":       { bg: "#CCFBF1", text: "#0F766E" },
  "safety & security":  { bg: "#FEE2E2", text: "#991B1B" },
  "facilities":         { bg: "#DBEAFE", text: "#1E40AF" },
  "office equipments":  { bg: "#FFEDD5", text: "#9A3412" },
  "compliance":         { bg: "#EDE9FE", text: "#5B21B6" },
};

export function CategoryBadge({ category }: { category: string }) {
  const key = category.toLowerCase().replace(/\s+/g, " ").trim();
  const cfg = CATEGORY_COLORS[key] ?? { bg: "#F3F4F6", text: "#374151" };
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.text,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 9999,
        whiteSpace: "nowrap",
      }}
    >
      {category}
    </span>
  );
}

/* ─── Page Header ──────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 12,
        paddingBottom: 20,
        marginBottom: 24,
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(1.125rem, 2.5vw, 1.375rem)", fontWeight: 700, color: "#111827" }}>{title}</h1>
        {subtitle && (
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B7280" }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginLeft: "auto",
            justifyContent: "flex-end",
            maxWidth: "100%",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/* ─── Empty State ──────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <div style={{ fontSize: 48, color: "#D1D5DB", lineHeight: 1 }}>{icon}</div>
      <p style={{ margin: "12px 0 0", fontSize: 15, fontWeight: 600, color: "#374151" }}>{title}</p>
      {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>{subtitle}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/* ─── Date formatting ──────────────────────────────────────────────────── */

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const p = dayjs(d);
  return p.isValid() ? p.format("DD MMM YYYY") : "—";
}

export function fmtPct(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return "—";
    const n = Number(trimmed);
    return Number.isFinite(n) ? n.toFixed(1) + "%" : "—";
  }
  return Number.isFinite(v) ? v.toFixed(1) + "%" : "—";
}

export function fmtINR(v: number | null | undefined): string {
  if (v == null) return "—";
  return "₹" + v.toLocaleString("en-IN");
}

/* ─── Score band color helpers ─────────────────────────────────────────── */

export function bandColor(band: string | null | undefined): string {
  const cfg = BAND_CONFIG[band as ScoreBandType];
  return cfg?.dot ?? "#6B7280";
}

export function bandBg(band: string | null | undefined): string {
  const cfg = BAND_CONFIG[band as ScoreBandType];
  return cfg?.bg ?? "#F3F4F6";
}
