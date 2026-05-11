import {
  App, Button, Card, Col, Collapse, Form, Input,
  InputNumber, Modal, Row, Select, Spin, Switch, Table, Tabs, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeft, Plus, FileText, FileSpreadsheet, CheckCircle2,
  AlertTriangle, Lock, Unlock, Info, Trash2, Pencil,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, apiFetch, apiFetchBlob, clearTokens } from "../api/client";
import { ScoreBandBadge, StatusBadge, CategoryBadge, fmtDate, fmtPct, bandColor } from "../components/ui";

type Me = { id: string; email: string; name: string; role: string };

type ScoreRow = {
  id: string; subcategoryId: string; status: string;
  scoreGiven: number | null; maxScore: number;
  observations: string | null; remsNumber: string | null; remarks: string | null;
  subcategory: { name: string; description?: string | null; category: { name: string } };
};

type IssueRow = {
  id: string; categoryId: string; issueDescription: string;
  scheduledClosureDate: string | null; issueStatus: string;
  resolutionNotes: string | null; category: { name: string };
};

type UtilityLine = { category: string; sub_category: string; amount?: number | null };

type VisitFull = {
  id: string; isSubmitted: boolean; visitType: string;
  visitDateActual: string | null; visitDateLockedAt: string | null;
  reasonForNoVisit: string | null; virtualStaffContactName: string | null;
  virtualStaffContactPhone: string | null; boiNameSnapshot: string | null;
  locationHeadSnapshot: string | null; branchOpsInchargeSnapshot: string | null;
  staffOutsourceSnapshot: number | null; staffCompanySnapshot: number | null;
  staffHkResourcesSnapshot: number | null; staffTalicEmployeesSnapshot: number | null;
  workstationsLinearSnapshot: number | null; workstationsLshapeSnapshot: number | null;
  workstationsCubicalSnapshot: number | null; isInfraUpgrade: boolean;
  landlordIssue: boolean; landlordIssueDetails: string | null;
  incidentPreviousVisit: boolean; incidentPreviousVisitDetails: string | null;
  auditPointsObserved: boolean; auditPointsDetails: string | null;
  majorEscalation: boolean; escalationDetails: string | null;
  escalationClosureDate: string | null;
  previousVisitDate: string | null; previousVisitScore: number | null;
  branch: { id: string; branchCode: string; branchName: string };
  quarter: { id: string; label: string | null; financialYear?: number; quarterNumber?: number };
  sfh?: { userId?: string; user?: { name: string } | null } | null;
  scores: ScoreRow[];
  issues: IssueRow[];
  scoreSnapshot?: { scorePercentage: unknown; scoreBand: string; totalPointsEarned: number; totalMaxPoints: number; categoryBreakdown?: unknown } | null;
  electricityLastQuarter?: unknown;
  utilityLinesJson?: unknown;
};

type AssessmentCategory = { id: string; name: string };

function isoOnly(d: string | null | undefined) { return d ? String(d).slice(0, 10) : null; }

function utilityLinesFrom(json: unknown): UtilityLine[] {
  if (!Array.isArray(json) || json.length === 0) return [{ category: "", sub_category: "", amount: undefined }];
  return (json as Record<string, unknown>[]).map((o) => ({
    category: String(o.category ?? "").trim(),
    sub_category: String(o.sub_category ?? o.subCategory ?? "").trim(),
    amount: typeof o.amount === "number" ? o.amount : undefined,
  }));
}

/* ─── Score summary bar ──────────────────────────────────────────────────── */
function ScoreSummaryBar({ scores, snap }: { scores: ScoreRow[]; snap: VisitFull["scoreSnapshot"] }) {
  const filled = scores.filter((s) => s.status !== "not_applicable").length;
  const total = scores.length;
  const band = snap?.scoreBand ?? null;
  return (
    <div style={{ position: "sticky", top: 56, zIndex: 10, background: "#fff", borderBottom: "1px solid #E5E7EB", boxShadow: "0 -2px 8px rgba(0,0,0,0.08)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#6B7280" }}>Overall Score</span>
        {snap ? (
          <>
            <span style={{ fontSize: 24, fontWeight: 700, color: bandColor(band) }}>{fmtPct(snap.scorePercentage as number)}</span>
            <ScoreBandBadge band={band} />
          </>
        ) : (
          <span style={{ fontSize: 24, fontWeight: 700, color: "#D1D5DB" }}>—</span>
        )}
      </div>
      <div style={{ textAlign: "right", minWidth: 0, flex: "1 1 140px" }}>
        {snap && <div style={{ fontSize: 13, color: "#6B7280" }}>{snap.totalPointsEarned} / {snap.totalMaxPoints} pts</div>}
        <div style={{ fontSize: 12, color: "#6B7280" }}>{filled} of {total} rows filled</div>
      </div>
    </div>
  );
}

/* ─── Status segment (Yes / No / N/A) ───────────────────────────────────── */
function StatusSegment({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const opts = [
    { v: "yes", label: "Yes", on: { bg: "#059669", text: "#fff" } },
    { v: "no", label: "No", on: { bg: "#DC2626", text: "#fff" } },
    { v: "not_applicable", label: "N/A", on: { bg: "#9CA3AF", text: "#fff" } },
  ];
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {opts.map(({ v, label, on }) => {
        const active = value === v;
        return (
          <button
            key={v} type="button" disabled={disabled}
            onClick={() => !disabled && onChange(v)}
            style={{
              height: 30, padding: "0 10px", fontSize: 12, fontWeight: 500,
              borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
              background: active ? on.bg : "#F3F4F6",
              color: active ? on.text : "#6B7280",
              transition: "all 150ms ease",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function VisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const [me, setMe] = useState<Me | null>(null);
  const [visit, setVisit] = useState<VisitFull | null>(null);
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewForm] = Form.useForm();
  const [scoreDrafts, setScoreDrafts] = useState<ScoreRow[]>([]);
  const [savingOverview, setSavingOverview] = useState(false);
  const [savingScores, setSavingScores] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueForm] = Form.useForm();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockForm] = Form.useForm();
  const [utilityForm] = Form.useForm<{ electricity_last_quarter?: number | null; utility_lines?: UtilityLine[] }>();
  const [savingUtility, setSavingUtility] = useState(false);
  const [visitTypeLocal, setVisitTypeLocal] = useState("physical");
  const [overviewDirty, setOverviewDirty] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteIssueId, setDeleteIssueId] = useState<string | null>(null);

  const canEdit = me?.role === "sfh" && visit && !visit.isSubmitted && visit.sfh?.userId === me.id;
  const isSupervisor = me?.role === "supervisor";

  const reload = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const [profile, v] = await Promise.all([apiFetch<Me>("/auth/me"), apiFetch<VisitFull>(`/visits/${id}`)]);
      setMe(profile);
      setVisit(v);
      setScoreDrafts(v.scores.map((s) => ({ ...s })));
      setVisitTypeLocal(v.visitType);
      setOverviewDirty(false);
      overviewForm.setFieldsValue({
        visit_type: v.visitType,
        visit_date_actual: isoOnly(v.visitDateActual) ?? undefined,
        reason_for_no_visit: v.reasonForNoVisit ?? undefined,
        virtual_staff_contact_name: v.virtualStaffContactName ?? undefined,
        virtual_staff_contact_phone: v.virtualStaffContactPhone ?? undefined,
        boi_name_snapshot: v.boiNameSnapshot ?? undefined,
        location_head_snapshot: v.locationHeadSnapshot ?? undefined,
        branch_ops_incharge_snapshot: v.branchOpsInchargeSnapshot ?? undefined,
        staff_outsource_snapshot: v.staffOutsourceSnapshot ?? undefined,
        staff_company_snapshot: v.staffCompanySnapshot ?? undefined,
        staff_hk_resources_snapshot: v.staffHkResourcesSnapshot ?? undefined,
        staff_talic_employees_snapshot: v.staffTalicEmployeesSnapshot ?? undefined,
        workstations_linear_snapshot: v.workstationsLinearSnapshot ?? undefined,
        workstations_lshape_snapshot: v.workstationsLshapeSnapshot ?? undefined,
        workstations_cubical_snapshot: v.workstationsCubicalSnapshot ?? undefined,
        is_infra_upgrade: v.isInfraUpgrade, landlord_issue: v.landlordIssue,
        landlord_issue_details: v.landlordIssueDetails ?? undefined,
        incident_previous_visit: v.incidentPreviousVisit,
        incident_previous_visit_details: v.incidentPreviousVisitDetails ?? undefined,
        audit_points_observed: v.auditPointsObserved, audit_points_details: v.auditPointsDetails ?? undefined,
        major_escalation: v.majorEscalation, escalation_details: v.escalationDetails ?? undefined,
        escalation_closure_date: isoOnly(v.escalationClosureDate) ?? undefined,
      });
      utilityForm.setFieldsValue({
        electricity_last_quarter: v.electricityLastQuarter != null ? Number(v.electricityLastQuarter) : undefined,
        utility_lines: utilityLinesFrom(v.utilityLinesJson),
      });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) { clearTokens(); navigate("/login", { replace: true }); return; }
      setError(e instanceof Error ? e.message : "Failed to load visit");
    } finally {
      setBusy(false);
    }
  }, [id, navigate, overviewForm, utilityForm]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    apiFetch<Array<{ id: string; name: string }>>("/categories")
      .then((r) => setCategories(r.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setCategories([]));
  }, []);

  const groupedScores = useMemo(() => {
    const m = new Map<string, ScoreRow[]>();
    for (const s of scoreDrafts) {
      const cat = s.subcategory.category.name;
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(s);
    }
    return [...m.entries()];
  }, [scoreDrafts]);

  async function saveOverview() {
    if (!id || !canEdit) return;
    const v = overviewForm.getFieldsValue();
    setSavingOverview(true);
    try {
      await apiFetch(`/visits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          visit_type: v.visit_type, visit_date_actual: v.visit_date_actual ?? null,
          reason_for_no_visit: v.reason_for_no_visit ?? null,
          virtual_staff_contact_name: v.virtual_staff_contact_name ?? null,
          virtual_staff_contact_phone: v.virtual_staff_contact_phone ?? null,
          boi_name_snapshot: v.boi_name_snapshot ?? null,
          location_head_snapshot: v.location_head_snapshot ?? null,
          branch_ops_incharge_snapshot: v.branch_ops_incharge_snapshot ?? null,
          staff_outsource_snapshot: v.staff_outsource_snapshot,
          staff_company_snapshot: v.staff_company_snapshot,
          staff_hk_resources_snapshot: v.staff_hk_resources_snapshot,
          staff_talic_employees_snapshot: v.staff_talic_employees_snapshot,
          workstations_linear_snapshot: v.workstations_linear_snapshot,
          workstations_lshape_snapshot: v.workstations_lshape_snapshot,
          workstations_cubical_snapshot: v.workstations_cubical_snapshot,
          is_infra_upgrade: v.is_infra_upgrade, landlord_issue: v.landlord_issue,
          landlord_issue_details: v.landlord_issue_details ?? null,
          incident_previous_visit: v.incident_previous_visit,
          incident_previous_visit_details: v.incident_previous_visit_details ?? null,
          audit_points_observed: v.audit_points_observed, audit_points_details: v.audit_points_details ?? null,
          major_escalation: v.major_escalation, escalation_details: v.escalation_details ?? null,
          escalation_closure_date: v.escalation_closure_date ?? null,
        }),
      });
      void message.success("Visit details saved");
      await reload();
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingOverview(false);
    }
  }

  async function saveScores() {
    if (!id || !canEdit) return;
    setSavingScores(true);
    try {
      await apiFetch(`/visits/${id}/scores`, {
        method: "PUT",
        body: JSON.stringify(scoreDrafts.map((r) => ({
          subcategoryId: r.subcategoryId, status: r.status,
          scoreGiven: r.status === "not_applicable" ? null : r.scoreGiven,
          observations: r.observations, remsNumber: r.remsNumber, remarks: r.remarks,
        }))),
      });
      void message.success("Scores saved");
      await reload();
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingScores(false);
    }
  }

  async function saveUtility() {
    if (!id || !canEdit) return;
    const v = utilityForm.getFieldsValue();
    const rawLines = v.utility_lines ?? [];
    const utility_lines: { category: string; sub_category: string; amount: number }[] = [];
    for (const r of rawLines) {
      const c = (r.category ?? "").trim(); const s = (r.sub_category ?? "").trim(); const a = r.amount;
      if (!c && !s && a == null) continue;
      if (!c || !s || a == null || !Number.isFinite(Number(a))) {
        void message.warning("Each utility row needs category, sub category, and amount.");
        return;
      }
      utility_lines.push({ category: c, sub_category: s, amount: Number(a) });
    }
    setSavingUtility(true);
    try {
      await apiFetch(`/visits/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electricity_last_quarter: v.electricity_last_quarter ?? null, utility_lines }),
      });
      void message.success("Utility saved");
      await reload();
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingUtility(false);
    }
  }

  async function submitVisit() {
    if (!id || !canEdit) return;
    modal.confirm({
      title: "Submit visit?",
      content: "After submission, scores, issues, and utility details can no longer be edited.",
      okText: "Submit", okType: "primary",
      onOk: async () => {
        setSubmitting(true);
        try {
          await apiFetch(`/visits/${id}/submit`, { method: "POST", body: "{}" });
          void message.success("Visit submitted");
          await reload();
        } catch (e) {
          void message.error(e instanceof Error ? e.message : "Submit failed");
        } finally {
          setSubmitting(false);
        }
      },
    });
  }

  async function download(kind: "pdf" | "excel" | "issues-excel") {
    if (!id) return;
    try {
      const path = kind === "pdf" ? "pdf" : kind === "excel" ? "excel" : "issues-excel";
      const blob = await apiFetchBlob(`/visits/${id}/${path}`);
      const ext = kind === "pdf" ? "pdf" : "xlsx";
      const code = visit?.branch.branchCode ?? "visit";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${code}-${kind}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function addIssue() {
    if (!id || !canEdit) return;
    const v = await issueForm.validateFields();
    try {
      await apiFetch(`/visits/${id}/issues`, {
        method: "POST",
        body: JSON.stringify({ category_id: v.category_id, issue_description: v.issue_description, scheduled_closure_date: v.scheduled_closure_date || undefined }),
      });
      void message.success("Issue added");
      issueForm.resetFields();
      setIssueModalOpen(false);
      await reload();
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Failed to add issue");
    }
  }

  function updateScoreRow(subcategoryId: string, patch: Partial<ScoreRow>) {
    setScoreDrafts((rows) => rows.map((r) => r.subcategoryId === subcategoryId ? { ...r, ...patch } : r));
  }

  const snap = visit?.scoreSnapshot;
  const allNonNaFilled = scoreDrafts.filter((s) => s.status !== "not_applicable").every((s) => s.scoreGiven !== null && s.scoreGiven >= 0);
  const filledCount = scoreDrafts.filter((s) => s.status !== "not_applicable" && s.scoreGiven !== null).length;
  const totalNonNa = scoreDrafts.filter((s) => s.status !== "not_applicable").length;

  const cardStyle = { borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 16 };
  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>{text}</div>
  );

  if (busy && !visit) return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>;
  if (error || !visit) return (
    <div>
      <Link to="/visits"><Button type="link" icon={<ArrowLeft size={14} />}>Visits</Button></Link>
      <div style={{ marginTop: 16, color: "#DC2626" }}>{error ?? "Visit not found"}</div>
    </div>
  );

  /* ─── Sticky header ─────────────────────────────────────────────────── */
  return (
    <>
      {/* Breadcrumb */}
      <Link to="/visits">
        <button type="button" style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#6B7280", padding: 0, marginBottom: 12, transition: "color 150ms ease" }}>
          <ArrowLeft size={14} /> Visits
        </button>
      </Link>

      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
            {visit.branch.branchCode} · {visit.branch.branchName}
          </h1>
          <StatusBadge status={visit.isSubmitted ? "submitted" : "draft"} />
          <span style={{ background: "#F3F4F6", color: "#374151", fontSize: 12, fontWeight: 500, padding: "3px 8px", borderRadius: 6 }}>
            {visit.quarter.label ?? "Quarter"}
          </span>
          {visit.sfh?.user?.name && (
            <span style={{ fontSize: 13, color: "#6B7280" }}>SFH: {visit.sfh.user.name}</span>
          )}
        </div>
        {snap && (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: `3px solid ${bandColor(snap.scoreBand)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: bandColor(snap.scoreBand) }}>{fmtPct(snap.scorePercentage as number)}</span>
            </div>
            <div style={{ marginTop: 4 }}><ScoreBandBadge band={snap.scoreBand} /></div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 0 }}
        items={[
          /* ─── OVERVIEW TAB ─────────────────────────────────────────── */
          {
            key: "overview", label: "Overview",
            children: (
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                {/* Left column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Form form={overviewForm} layout="vertical" disabled={!canEdit}
                    onValuesChange={() => setOverviewDirty(true)}>

                    {/* Card 1: Visit Info */}
                    <Card style={cardStyle} title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Visit Information</span>}
                      styles={{ body: { padding: 20 } }}>
                      <Form.Item name="visit_type" label="Visit Type">
                        <div style={{ display: "flex", gap: 8 }}>
                          {["physical", "virtual"].map((t) => {
                            const active = visitTypeLocal === t;
                            return (
                              <button key={t} type="button" disabled={!canEdit}
                                onClick={() => { if (canEdit) { setVisitTypeLocal(t); overviewForm.setFieldValue("visit_type", t); setOverviewDirty(true); } }}
                                style={{ height: 38, padding: "0 20px", borderRadius: 8, border: "none", cursor: canEdit ? "pointer" : "not-allowed", background: active ? "#4F46E5" : "#F3F4F6", color: active ? "#fff" : "#6B7280", fontWeight: 500, fontSize: 13, transition: "all 150ms ease" }}>
                                {t === "physical" ? "📍 Physical" : "🎥 Virtual"}
                              </button>
                            );
                          })}
                        </div>
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item name="visit_date_actual" label="Visit Date">
                            {visit.visitDateLockedAt && !isSupervisor ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Lock size={14} color="#D97706" />
                                <span style={{ fontSize: 14, color: "#374151" }}>{fmtDate(visit.visitDateActual)}</span>
                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>Locked — contact supervisor</span>
                              </div>
                            ) : (
                              <Input type="date" style={{ height: 38 }} />
                            )}
                          </Form.Item>
                        </Col>
                        {isSupervisor && visit.visitDateLockedAt && (
                          <Col xs={24} md={12} style={{ display: "flex", alignItems: "center" }}>
                            <Button icon={<Unlock size={14} />} onClick={() => setUnlockOpen(true)} style={{ marginTop: 4 }}>
                              Unlock Date
                            </Button>
                          </Col>
                        )}
                      </Row>

                      {/* Virtual contacts — conditional */}
                      {visitTypeLocal === "virtual" && (
                        <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 8, padding: "12px 16px", marginBottom: 16, transition: "all 200ms ease" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Virtual Visit Contacts</div>
                          <Row gutter={12}>
                            <Col xs={24} sm={12}>
                              <Form.Item name="virtual_staff_contact_name" label="Staff contact name" style={{ marginBottom: 0 }}>
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                              <Form.Item name="virtual_staff_contact_phone" label="Staff contact phone" style={{ marginBottom: 0 }}>
                                <Input />
                              </Form.Item>
                            </Col>
                          </Row>
                        </div>
                      )}

                      <Collapse ghost items={[{
                        key: "reason",
                        label: <span style={{ fontSize: 13, fontWeight: 500, color: "#6B7280" }}>Reason for not conducting visit</span>,
                        children: (
                          <Form.Item name="reason_for_no_visit" style={{ marginBottom: 0 }}>
                            <Input.TextArea rows={2} />
                          </Form.Item>
                        ),
                      }]} />
                    </Card>

                    {/* Card 2: Branch Snapshot */}
                    <Card style={cardStyle} title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Branch Snapshot</span>}
                      styles={{ body: { padding: 20 } }}>
                      <p style={{ fontSize: 12, color: "#6B7280", fontStyle: "italic", marginTop: 0, marginBottom: 16 }}>Point-in-time capture at time of visit</p>
                      {sectionLabel("People")}
                      <Row gutter={16}>
                        <Col xs={24} md={8}><Form.Item name="boi_name_snapshot" label="BOI Name"><Input /></Form.Item></Col>
                        <Col xs={24} md={8}><Form.Item name="location_head_snapshot" label="Location Head"><Input /></Form.Item></Col>
                        <Col xs={24} md={8}><Form.Item name="branch_ops_incharge_snapshot" label="Branch Ops Incharge"><Input /></Form.Item></Col>
                      </Row>
                      {sectionLabel("Staff Strength")}
                      <Row gutter={12}>
                        <Col xs={12} sm={6}><Form.Item name="staff_outsource_snapshot" label="Outsource"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col xs={12} sm={6}><Form.Item name="staff_company_snapshot" label="Company Roll"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col xs={12} sm={6}><Form.Item name="staff_hk_resources_snapshot" label="HK Resources"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col xs={12} sm={6}><Form.Item name="staff_talic_employees_snapshot" label="TALIC"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                      </Row>
                      {sectionLabel("Workstations")}
                      <Row gutter={12}>
                        <Col xs={12} sm={8}><Form.Item name="workstations_linear_snapshot" label="Linear (Running)"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col xs={12} sm={8}><Form.Item name="workstations_lshape_snapshot" label="L-Shape"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col xs={12} sm={8}><Form.Item name="workstations_cubical_snapshot" label="Cubical"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
                      </Row>
                      {(visit.previousVisitDate || visit.previousVisitScore != null) && (
                        <>
                          {sectionLabel("Previous Visit")}
                          <Row gutter={12}>
                            <Col xs={12}><div style={{ background: "#F9FAFB", padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB" }}><div style={{ fontSize: 11, color: "#9CA3AF" }}>Date</div><div style={{ fontSize: 14, color: "#374151" }}>{fmtDate(visit.previousVisitDate)}</div></div></Col>
                            <Col xs={12}><div style={{ background: "#F9FAFB", padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB" }}><div style={{ fontSize: 11, color: "#9CA3AF" }}>Score</div><div style={{ fontSize: 14, color: "#374151" }}>{visit.previousVisitScore != null ? `${visit.previousVisitScore}%` : "—"}</div></div></Col>
                          </Row>
                        </>
                      )}
                    </Card>

                    {/* Card 3: Observations */}
                    <Card style={cardStyle} title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Observations & Escalations</span>}
                      styles={{ body: { padding: 20 } }}>
                      {[
                        { name: "is_infra_upgrade", label: "Branch under Infra Upgrade Project", details: null },
                        { name: "landlord_issue", label: "Issue with building / landlord", details: "landlord_issue_details" },
                        { name: "incident_previous_visit", label: "Any incident since previous visit", details: "incident_previous_visit_details" },
                        { name: "audit_points_observed", label: "Any audit points observed", details: "audit_points_details" },
                        { name: "major_escalation", label: "Any major escalation", details: "escalation_details" },
                      ].map(({ name, label, details }) => (
                        <div key={name} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>{label}</span>
                            <Form.Item name={name} valuePropName="checked" style={{ marginBottom: 0 }}>
                              <Switch size="small" />
                            </Form.Item>
                          </div>
                          {details && (
                            <Form.Item noStyle shouldUpdate={(prev, cur) => prev[name] !== cur[name]}>
                              {({ getFieldValue }) =>
                                getFieldValue(name) ? (
                                  <Form.Item name={details} style={{ marginTop: 8, marginBottom: 0 }}>
                                    <Input.TextArea rows={2} placeholder="Details..." />
                                  </Form.Item>
                                ) : null
                              }
                            </Form.Item>
                          )}
                          {name === "major_escalation" && (
                            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.major_escalation !== cur.major_escalation}>
                              {({ getFieldValue }) =>
                                getFieldValue("major_escalation") ? (
                                  <Form.Item name="escalation_closure_date" label="Expected closure date" style={{ marginTop: 8, marginBottom: 0 }}>
                                    <Input type="date" />
                                  </Form.Item>
                                ) : null
                              }
                            </Form.Item>
                          )}
                        </div>
                      ))}
                    </Card>

                    {/* Save bar */}
                    {canEdit && overviewDirty && (
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 0" }}>
                        <Button onClick={() => { void reload(); }} style={{ height: 38 }}>Discard</Button>
                        <Button type="primary" onClick={() => void saveOverview()} loading={savingOverview} style={{ height: 38 }}>Save Changes</Button>
                      </div>
                    )}
                    {isSupervisor && (
                      <Button icon={<Unlock size={14} />} onClick={() => setUnlockOpen(true)} style={{ marginTop: 8 }}>
                        Unlock Visit Date (Supervisor)
                      </Button>
                    )}
                  </Form>
                </div>

                {/* Right: sticky summary panel */}
                <div style={{ width: 240, flexShrink: 0, position: "sticky", top: 80 }}>
                  <Card style={{ ...cardStyle, marginBottom: 0 }} styles={{ body: { padding: 20 } }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 }}>Visit Summary</div>
                    {snap ? (
                      <>
                        <div style={{ textAlign: "center", marginBottom: 12 }}>
                          <div style={{ width: 72, height: 72, borderRadius: "50%", border: `4px solid ${bandColor(snap.scoreBand)}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: bandColor(snap.scoreBand) }}>{fmtPct(snap.scorePercentage as number)}</span>
                          </div>
                          <div style={{ marginTop: 6 }}><ScoreBandBadge band={snap.scoreBand} /></div>
                          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{snap.totalPointsEarned} / {snap.totalMaxPoints} pts</div>
                        </div>
                        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
                          {groupedScores.map(([cat, rows]) => {
                            const earned = rows.filter((r) => r.status !== "not_applicable").reduce((s, r) => s + (r.scoreGiven ?? 0), 0);
                            const max = rows.filter((r) => r.status !== "not_applicable").reduce((s, r) => s + r.maxScore, 0);
                            return (
                              <div key={cat} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 3 }}>{cat}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ flex: 1, height: 4, background: "#E5E7EB", borderRadius: 2 }}>
                                    <div style={{ width: `${max > 0 ? (earned / max) * 100 : 0}%`, height: "100%", background: "#4F46E5", borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{earned}/{max}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ width: 72, height: 72, borderRadius: "50%", border: "2px dashed #D1D5DB", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 20 }}>—</div>
                        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>Score appears after saving scores</p>
                      </div>
                    )}
                    <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12, marginTop: 12 }}>
                      {visit.isSubmitted ? (
                        <div style={{ background: "#F3F4F6", borderRadius: 8, padding: "10px 12px", textAlign: "center", fontSize: 13, color: "#6B7280" }}>
                          ✓ Submitted {fmtDate(visit.visitDateActual)}
                        </div>
                      ) : canEdit ? (
                        <Button type="primary" block style={{ height: 44 }}
                          disabled={!visit.visitDateActual}
                          onClick={() => void submitVisit()}
                          loading={submitting}>
                          Submit Visit (Final)
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </div>
              </div>
            ),
          },

          /* ─── SCORES TAB ─────────────────────────────────────────── */
          {
            key: "scores", label: "Scores",
            children: (
              <>
                <ScoreSummaryBar scores={scoreDrafts} snap={snap} />
                <div style={{ paddingTop: 16 }}>
                  <Collapse
                    defaultActiveKey={groupedScores.map(([cat]) => cat)}
                    items={groupedScores.map(([cat, rows]) => {
                      const activeRows = rows.filter((r) => r.status !== "not_applicable");
                      const earned = activeRows.reduce((s, r) => s + (r.scoreGiven ?? 0), 0);
                      const max = activeRows.reduce((s, r) => s + r.maxScore, 0);
                      const pct = max > 0 ? (earned / max) * 100 : 0;
                      const color = pct >= 80 ? "#059669" : pct >= 60 ? "#2563EB" : pct >= 40 ? "#D97706" : "#DC2626";
                      return {
                        key: cat,
                        label: (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 80, height: 6, background: "#E5E7EB", borderRadius: 3 }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 13, color: "#6B7280" }}>{earned}/{max} pts</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color }}>{pct.toFixed(0)}%</span>
                            </div>
                          </div>
                        ),
                        children: (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#F9FAFB" }}>
                                  {["Criterion", "Max", "Status", "Score", "Observations / REMS"].map((h, i) => (
                                    <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 1 ? "center" : "left", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => {
                                  const isNa = r.status === "not_applicable";
                                  return (
                                    <tr key={r.id}
                                      style={{ borderBottom: "1px solid #F3F4F6", background: isNa ? "#F9FAFB" : r.status !== "not_applicable" && r.scoreGiven !== null ? "rgba(240,253,244,0.3)" : undefined }}>
                                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 500, color: isNa ? "#9CA3AF" : "#111827", maxWidth: 260 }}>
                                        {r.subcategory.name}
                                        {r.subcategory.description && (
                                          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{r.subcategory.description.slice(0, 70)}{r.subcategory.description.length > 70 ? "…" : ""}</div>
                                        )}
                                      </td>
                                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                        <span style={{ background: "#F3F4F6", color: "#374151", fontSize: 12, fontWeight: 600, padding: "2px 6px", borderRadius: 4 }}>{r.maxScore}</span>
                                      </td>
                                      <td style={{ padding: "10px 12px" }}>
                                        <StatusSegment value={r.status} disabled={!canEdit} onChange={(status) => updateScoreRow(r.subcategoryId, { status, scoreGiven: status === "not_applicable" ? null : (r.scoreGiven ?? 0) })} />
                                      </td>
                                      <td style={{ padding: "10px 12px" }}>
                                        <InputNumber
                                          disabled={!canEdit || isNa} min={0} max={r.maxScore}
                                          value={r.scoreGiven ?? undefined}
                                          onChange={(v) => updateScoreRow(r.subcategoryId, { scoreGiven: v === null ? null : Number(v) })}
                                          style={{ width: 64, height: 34, border: (!isNa && r.scoreGiven === 0) ? "1px solid #F59E0B" : undefined }}
                                        />
                                      </td>
                                      <td style={{ padding: "10px 12px" }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
                                          <Input disabled={!canEdit} value={r.observations ?? ""} placeholder="Observations..." style={{ height: 32, fontSize: 13 }}
                                            onChange={(e) => updateScoreRow(r.subcategoryId, { observations: e.target.value || null })} />
                                          <Input disabled={!canEdit} value={r.remsNumber ?? ""} placeholder="REMS # (optional)" style={{ height: 30, fontSize: 12 }}
                                            onChange={(e) => updateScoreRow(r.subcategoryId, { remsNumber: e.target.value || null })} />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ),
                      };
                    })}
                  />

                  {canEdit && (
                    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", boxShadow: "0 -2px 8px rgba(0,0,0,0.08)", height: 56, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 50 }}>
                      <span style={{ fontSize: 13, color: "#D97706" }}>{totalNonNa - filledCount > 0 ? `${totalNonNa - filledCount} incomplete rows` : "All rows filled"}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button onClick={() => void reload()} style={{ height: 38 }}>Discard</Button>
                        <Button type="primary" onClick={() => void saveScores()} loading={savingScores} style={{ height: 38 }}>Save Scores</Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ),
          },

          /* ─── ISSUES TAB ─────────────────────────────────────────── */
          {
            key: "issues", label: "Issues",
            children: (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>Issues Log</span>
                  {canEdit && (
                    <Button type="primary" icon={<Plus size={14} />} onClick={() => setIssueModalOpen(true)} style={{ height: 38 }}>
                      Add Issue
                    </Button>
                  )}
                </div>

                {visit.issues.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No issues logged</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Issues you add will appear here</div>
                  </div>
                ) : (
                  <Table<IssueRow>
                    rowKey="id" dataSource={visit.issues} pagination={false}
                    columns={[
                      { title: "Category", key: "cat", render: (_, r) => <CategoryBadge category={r.category.name} /> },
                      { title: "Description", dataIndex: "issueDescription", key: "desc", render: (v: string) => <Typography.Text style={{ fontSize: 13 }} ellipsis={{ tooltip: v }}>{v}</Typography.Text> },
                      {
                        title: "Target Close", key: "scd",
                        render: (_, r) => {
                          const overdue = r.scheduledClosureDate && new Date(r.scheduledClosureDate) < new Date();
                          return <span style={{ fontSize: 13, color: overdue ? "#DC2626" : "#374151" }}>{fmtDate(r.scheduledClosureDate)}</span>;
                        },
                      },
                      {
                        title: "Status", key: "st",
                        render: (_, r) => {
                          const cfg: Record<string, { dot: string; label: string; color: string }> = {
                            open: { dot: "#DC2626", label: "Open", color: "#DC2626" },
                            in_progress: { dot: "#D97706", label: "In Progress", color: "#D97706" },
                            resolved: { dot: "#059669", label: "Resolved", color: "#059669" },
                          };
                          const c = cfg[r.issueStatus] ?? cfg.open;
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: c.color }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
                              {c.label}
                            </span>
                          );
                        },
                      },
                      ...(canEdit ? [{
                        title: "", key: "actions", width: 80,
                        render: (_: unknown, r: IssueRow) => (
                          <Button size="small" icon={<Trash2 size={13} />} danger type="text"
                            onClick={() => setDeleteIssueId(r.id)} />
                        ),
                      }] : []),
                    ] as ColumnsType<IssueRow>}
                    size="middle"
                  />
                )}

                {/* Readiness + Submit — only in Issues tab */}
                <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #E5E7EB" }}>
                  {canEdit && (
                    <div style={{ marginBottom: 12 }}>
                      {allNonNaFilled ? (
                        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
                          <CheckCircle2 size={20} color="#059669" />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#065F46" }}>Ready to submit</div>
                            <div style={{ fontSize: 13, color: "#059669", marginTop: 2 }}>All scores complete. This action is irreversible.</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
                          <AlertTriangle size={20} color="#D97706" />
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#92400E" }}>{totalNonNa - filledCount} score rows still incomplete</div>
                            <div style={{ fontSize: 13, color: "#B45309", marginTop: 2 }}>Complete all scores before submitting.</div>
                          </div>
                        </div>
                      )}
                      <Button
                        type="primary" block style={{ height: 44, marginTop: 12 }}
                        disabled={!allNonNaFilled || !visit.visitDateActual}
                        loading={submitting}
                        onClick={() => void submitVisit()}>
                        {allNonNaFilled ? "Submit Visit (Final)" : "Complete scores first"}
                      </Button>
                    </div>
                  )}
                  {visit.isSubmitted && (
                    <div style={{ background: "#F3F4F6", borderRadius: 8, padding: "12px 16px", textAlign: "center", fontSize: 13, color: "#6B7280" }}>
                      ✓ Submitted on {fmtDate(visit.visitDateActual)}
                    </div>
                  )}
                </div>
              </div>
            ),
          },

          /* ─── UTILITY TAB ─────────────────────────────────────────── */
          {
            key: "utility", label: "Utility",
            children: (
              <div>
                <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                  <Info size={16} color="#4F46E5" />
                  <span style={{ fontSize: 13, color: "#374151" }}>Utility data appears on PDF and Excel reports alongside quarterly consumption.</span>
                </div>

                <Form form={utilityForm} layout="vertical" disabled={!canEdit}>
                  <Card style={cardStyle} title={<span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Previous Quarter Electricity</span>}
                    styles={{ body: { padding: 20 } }}>
                    <p style={{ fontSize: 12, color: "#6B7280", marginTop: 0 }}>Record the electricity amount for the previous quarter</p>
                    <Form.Item name="electricity_last_quarter" label="Electricity (₹)" style={{ maxWidth: 280 }}>
                      <InputNumber min={0} step={0.01} style={{ width: "100%" }} placeholder="Amount (₹)" prefix="₹" />
                    </Form.Item>
                  </Card>

                  <div style={{ marginBottom: 8, marginTop: 24 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>Additional Utility Lines</span>
                    <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Record any other utility or operational expenses (water, gas, AMC, etc.)</p>
                  </div>

                  <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 48px", background: "#F9FAFB", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <span>Category</span><span>Sub Category</span><span style={{ textAlign: "right" }}>Amount (₹)</span><span />
                    </div>
                    <Form.List name="utility_lines">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.length === 0 && (
                            <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>No additional utilities added</div>
                          )}
                          {fields.map((field) => (
                            <div key={field.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 48px", padding: "8px 16px", borderBottom: "1px solid #F3F4F6", alignItems: "center", gap: 8 }}>
                              <Form.Item name={[field.name, "category"]} style={{ marginBottom: 0 }}>
                                <Input placeholder="e.g. Water" style={{ height: 36 }} />
                              </Form.Item>
                              <Form.Item name={[field.name, "sub_category"]} style={{ marginBottom: 0 }}>
                                <Input placeholder="e.g. Municipal supply" style={{ height: 36 }} />
                              </Form.Item>
                              <Form.Item name={[field.name, "amount"]} style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={0.01} style={{ width: "100%", height: 36 }} placeholder="₹" />
                              </Form.Item>
                              <Button type="text" danger disabled={!canEdit} icon={<Trash2 size={14} />} onClick={() => remove(field.name)} style={{ height: 36 }} />
                            </div>
                          ))}
                          <div style={{ padding: "8px 16px" }}>
                            <Button type="dashed" block disabled={!canEdit}
                              onClick={() => add({ category: "", sub_category: "", amount: undefined })}
                              icon={<Plus size={14} />} style={{ height: 40, borderColor: "#D1D5DB", color: "#6B7280" }}>
                              Add utility line
                            </Button>
                          </div>
                        </>
                      )}
                    </Form.List>
                  </Card>
                </Form>

                {canEdit && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button type="primary" onClick={() => void saveUtility()} loading={savingUtility} style={{ height: 38 }}>Save Utility</Button>
                  </div>
                )}
                {!canEdit && (
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {isSupervisor ? "Read-only for supervisors." : "Submitted visits cannot be edited."}
                  </Typography.Text>
                )}
              </div>
            ),
          },

          /* ─── EXPORTS TAB ─────────────────────────────────────────── */
          {
            key: "exports", label: "Exports",
            children: (
              <div>
                {!visit.isSubmitted && (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle size={16} color="#D97706" />
                    <span style={{ fontSize: 13, color: "#78350F" }}>This visit is still in Draft. Final PDF is generated after submission.</span>
                  </div>
                )}
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Card style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", textAlign: "center" }}
                      styles={{ body: { padding: "32px 24px" } }}>
                      <div style={{ width: 56, height: 56, background: "#EEF2FF", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <FileText size={28} color="#4F46E5" />
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginTop: 16 }}>Full Visit Report</div>
                      <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Complete assessment with scores, issues, and utility data</div>
                      <Button type="primary" block style={{ height: 40, marginTop: 20 }} onClick={() => void download("pdf")}>↓ Download PDF</Button>
                      <Button block style={{ height: 38, marginTop: 8 }} onClick={() => void download("excel")}>↓ Download Excel</Button>
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", textAlign: "center" }}
                      styles={{ body: { padding: "32px 24px" } }}>
                      <div style={{ width: 56, height: 56, background: "#F0FDF4", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <FileSpreadsheet size={28} color="#059669" />
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginTop: 16 }}>Issues Export</div>
                      <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Open and in-progress issues for this branch</div>
                      <Button
                        block style={{ height: 40, marginTop: 20, background: visit.issues.length ? "#059669" : undefined, borderColor: visit.issues.length ? "#059669" : undefined, color: visit.issues.length ? "#fff" : undefined }}
                        disabled={!visit.issues.length}
                        onClick={() => void download("issues-excel")}>
                        ↓ Download Issues Excel
                      </Button>
                      {!visit.issues.length && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>No issues to export</div>}
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />

      {/* Add Issue Modal */}
      <Modal title="Add Issue" open={issueModalOpen} onCancel={() => setIssueModalOpen(false)}
        onOk={() => void addIssue()} destroyOnHidden width={520}
        okButtonProps={{ style: { height: 38 } }} cancelButtonProps={{ style: { height: 38 } }}>
        <Form form={issueForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="category_id" label="Category" rules={[{ required: true }]}>
            <Select options={categories.map((c) => ({ value: c.id, label: c.name }))} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="issue_description" label="Issue Description" rules={[{ required: true }]}
            help="Describe the issue clearly — include location and context">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="scheduled_closure_date" label="Target Closure Date">
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Delete issue confirm */}
      <Modal title="Delete Issue?" open={!!deleteIssueId} onCancel={() => setDeleteIssueId(null)}
        onOk={async () => {
          if (!deleteIssueId) return;
          try {
            await apiFetch(`/visits/${id}/issues/${deleteIssueId}`, { method: "DELETE" });
            void message.success("Issue deleted");
            setDeleteIssueId(null);
            await reload();
          } catch (e) {
            void message.error(e instanceof Error ? e.message : "Delete failed");
          }
        }}
        okText="Delete" okButtonProps={{ danger: true, style: { height: 38 } }}
        cancelButtonProps={{ style: { height: 38 } }}
        width={400}>
        <p style={{ color: "#6B7280" }}>This will permanently remove the issue from the visit record.</p>
      </Modal>

      {/* Unlock date modal */}
      <Modal title="Unlock Visit Date" open={unlockOpen} onCancel={() => setUnlockOpen(false)}
        footer={null} destroyOnHidden width={440}>
        <Typography.Paragraph type="secondary">
          Clears the lock so the SFH can adjust the visit date. Optionally supply a corrected date.
        </Typography.Paragraph>
        <Form form={unlockForm} layout="vertical"
          onFinish={async (v) => {
            try {
              await apiFetch(`/visits/${visit.id}/unlock-date`, { method: "POST", body: JSON.stringify({ visit_date_actual: v.visit_date_actual || undefined, reason: v.reason || undefined }) });
              void message.success("Date unlocked");
              setUnlockOpen(false);
              unlockForm.resetFields();
              await reload();
            } catch (e) {
              void message.error(e instanceof Error ? e.message : "Unlock failed");
            }
          }}>
          <Form.Item name="visit_date_actual" label="Corrected date (optional)">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="reason" label="Reason (audit trail)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<Pencil size={14} />}>Unlock</Button>
        </Form>
      </Modal>
    </>
  );
}
