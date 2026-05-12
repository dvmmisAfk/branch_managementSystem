import { App, Button, Input, Modal, Select, Table, Tabs, Tag, Typography } from "antd";
import { Plus, Search, ClipboardX, Video, MapPin as MapPinIcon, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import { ApiError, apiFetch, clearTokens, loadStoredTokens } from "../api/client";
import { StatusBadge, ScoreBandBadge, EmptyState, fmtDate, fmtPct } from "../components/ui";
import { useTablePagination } from "../components/tableViewAll";

type VisitRow = {
  id: string;
  isSubmitted: boolean;
  visitType: string;
  visitDateActual?: string | null;
  branch?: { branchCode?: string; branchName?: string } | null;
  quarter?: { label?: string | null } | null;
  sfh?: { user?: { name?: string } | null } | null;
  scoreSnapshot?: { scoreBand?: string | null; scorePercentage?: unknown } | null;
};

type EditRequestRow = {
  id: string;
  visitId: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  createdAt: string;
  visit: { id: string; branch: { branchCode: string; branchName: string }; quarter: { label: string | null } };
  sfh: { id: string; user: { name: string } };
};

type Me = { id: string; email: string; name: string; role: string };
type BranchOpt = { id: string; branchCode: string; branchName: string };
type QuarterRow = { id: string; label: string | null; financialYear: number; quarterNumber: number; startDate: string; endDate: string };

export function VisitsPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  useEffect(() => { loadStoredTokens(); }, []);

  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(true);
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [filter, setFilter] = useState<"all" | "draft" | "submitted" | "edit_requests">("all");
  const [search, setSearch] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [quarters, setQuarters] = useState<QuarterRow[]>([]);
  const [branchQ, setBranchQ] = useState("");
  const [branchOpts, setBranchOpts] = useState<BranchOpt[]>([]);
  const [branchBusy, setBranchBusy] = useState(false);
  const [pickBranch, setPickBranch] = useState<string | undefined>();
  const [pickQuarter, setPickQuarter] = useState<string | undefined>();
  const { pagination, resetPaging } = useTablePagination(rows.length);
  const [editRequests, setEditRequests] = useState<EditRequestRow[]>([]);
  const [editReqBusy, setEditReqBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Me>("/auth/me")
      .then((u) => {
        if (!cancelled) setMe(u);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (filter === "edit_requests") return;
    let cancelled = false;
    setBusy(true);
    const q = filter === "draft" ? "?status=draft" : filter === "submitted" ? "?status=submitted" : "";
    apiFetch<VisitRow[]>(`/visits${q}`)
      .then((rows) => {
        if (!cancelled) setRows(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearTokens();
          navigate("/login", { replace: true });
          return;
        }
        void message.error(e instanceof Error ? e.message : "Failed to load visits");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, navigate, message]);

  useEffect(() => { resetPaging(); }, [filter, resetPaging]);

  useEffect(() => {
    if (me?.role !== "supervisor") return;
    let cancelled = false;
    setEditReqBusy(true);
    apiFetch<EditRequestRow[]>("/edit-requests")
      .then((data) => { if (!cancelled) setEditRequests(data); })
      .catch(() => { if (!cancelled) setEditRequests([]); })
      .finally(() => { if (!cancelled) setEditReqBusy(false); });
    return () => { cancelled = true; };
  }, [me?.role]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setBranchBusy(true);
      apiFetch<BranchOpt[]>(`/branches?q=${encodeURIComponent(branchQ)}`)
        .then(setBranchOpts)
        .catch(() => setBranchOpts([]))
        .finally(() => setBranchBusy(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [branchQ]);

  const openNewVisit = useCallback(() => {
    setPickBranch(undefined);
    setPickQuarter(undefined);
    setBranchQ("");
    setNewOpen(true);
    apiFetch<QuarterRow[]>("/quarters")
      .then((q) => {
        setQuarters(q);
        const now = new Date();
        const current = q.find((r) => new Date(r.startDate) <= now && new Date(r.endDate) >= now);
        if (current) setPickQuarter(current.id);
      })
      .catch(() => setQuarters([]));
  }, []);

  async function approveRequest(id: string) {
    setActionBusy(true);
    try {
      await apiFetch(`/edit-requests/${id}/approve`, { method: "PATCH" });
      void message.success("Edit request approved — visit reverted to draft");
      setEditRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "approved" } : r));
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setActionBusy(false);
    }
  }

  function openReject(id: string) {
    setRejectTarget(id);
    setRejectReason("");
    setRejectOpen(true);
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setActionBusy(true);
    try {
      await apiFetch(`/edit-requests/${rejectTarget}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectReason }),
      });
      void message.success("Edit request rejected");
      setEditRequests((prev) => prev.map((r) => r.id === rejectTarget ? { ...r, status: "rejected" } : r));
      setRejectOpen(false);
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setActionBusy(false);
    }
  }

  async function createVisit() {
    if (!pickBranch || !pickQuarter) { void message.warning("Choose branch and quarter"); return; }
    setCreating(true);
    try {
      const created = await apiFetch<{ id: string }>("/visits", {
        method: "POST",
        body: JSON.stringify({ branch_id: pickBranch, quarter_id: pickQuarter }),
      });
      void message.success("Draft created");
      setNewOpen(false);
      navigate(`/visits/${created.id}`);
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Could not create visit");
    } finally {
      setCreating(false);
    }
  }

  const isSfh = me?.role === "sfh";

  // Filter by search
  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.branch?.branchName?.toLowerCase().includes(s) ||
      r.branch?.branchCode?.toLowerCase().includes(s) ||
      false
    );
  });

  const columns: ColumnsType<VisitRow> = [
    {
      title: "Branch",
      key: "branch",
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
            {r.branch?.branchName ?? "—"}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>{r.branch?.branchCode ?? ""}</div>
        </div>
      ),
    },
    {
      title: "Quarter",
      key: "quarter",
      render: (_, r) => <span style={{ fontSize: 13, color: "#374151" }}>{r.quarter?.label ?? "—"}</span>,
    },
    ...(me?.role === "supervisor"
      ? [{
          title: "SFH",
          key: "sfh",
          render: (_: unknown, r: VisitRow) => <span style={{ fontSize: 13, color: "#374151" }}>{r.sfh?.user?.name ?? "—"}</span>,
        }]
      : []),
    {
      title: "Type",
      key: "visitType",
      render: (_, r) =>
        r.visitType === "virtual" ? (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#4F46E5" }}>
            <Video size={14} /> Virtual
          </span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6B7280" }}>
            <MapPinIcon size={14} /> Physical
          </span>
        ),
    },
    {
      title: "Visit Date",
      key: "visitDateActual",
      render: (_, r) => <span style={{ fontSize: 13, color: r.visitDateActual ? "#374151" : "#9CA3AF" }}>{fmtDate(r.visitDateActual)}</span>,
    },
    {
      title: "Status",
      key: "status",
      render: (_, r) => <StatusBadge status={r.isSubmitted ? "submitted" : "draft"} />,
    },
    {
      title: "Score",
      key: "score",
      render: (_, r) =>
        r.scoreSnapshot?.scorePercentage != null ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            {fmtPct(r.scoreSnapshot.scorePercentage as number)}
          </span>
        ) : (
          <span style={{ color: "#9CA3AF" }}>—</span>
        ),
    },
    {
      title: "Band",
      key: "band",
      render: (_, r) => <ScoreBandBadge band={r.scoreSnapshot?.scoreBand} />,
    },
  ];

  return (
    <>
      {/* Header */}
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
          <h1 style={{ margin: 0, fontSize: "clamp(1.125rem, 2.5vw, 1.375rem)", fontWeight: 700, color: "#111827" }}>Visits</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B7280" }}>
            Supervisors see all visits · SFHs see their region only
          </p>
        </div>
        {isSfh && (
          <Button type="primary" icon={<Plus size={14} />} onClick={openNewVisit} style={{ height: 40, flexShrink: 0 }}>
            New Visit
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <Tabs
          activeKey={filter}
          onChange={(k) => { setFilter(k as typeof filter); resetPaging(); }}
          items={[
            { key: "all", label: "All" },
            { key: "draft", label: "Drafts" },
            { key: "submitted", label: "Submitted" },
            ...(me?.role === "supervisor"
              ? [{
                  key: "edit_requests",
                  label: (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <RotateCcw size={13} />
                      Edit Requests
                      {editRequests.filter((r) => r.status === "pending").length > 0 && (
                        <Tag color="orange" style={{ marginLeft: 2, fontSize: 11, lineHeight: "16px", padding: "0 5px" }}>
                          {editRequests.filter((r) => r.status === "pending").length}
                        </Tag>
                      )}
                    </span>
                  ),
                }]
              : []),
          ]}
          style={{ marginBottom: 0, flex: "1 1 auto", minWidth: 0 }}
        />
        {filter !== "edit_requests" && (
          <Input
            prefix={<Search size={14} style={{ color: "#9CA3AF" }} />}
            placeholder="Branch name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: 36, flex: "1 1 200px", minWidth: 0, maxWidth: 420 }}
            allowClear
          />
        )}
      </div>

      {filter === "edit_requests" ? (
        <Table<EditRequestRow>
          rowKey="id"
          loading={editReqBusy}
          dataSource={editRequests}
          scroll={{ x: true }}
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: <EmptyState icon={<RotateCcw />} title="No edit requests" subtitle="No SFHs have requested edits yet" /> }}
          columns={[
            {
              title: "Branch",
              key: "branch",
              render: (_, r) => (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{r.visit.branch.branchName}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{r.visit.branch.branchCode}</div>
                </div>
              ),
            },
            {
              title: "Quarter",
              key: "quarter",
              render: (_, r) => <span style={{ fontSize: 13, color: "#374151" }}>{r.visit.quarter.label ?? "—"}</span>,
            },
            {
              title: "SFH",
              key: "sfh",
              render: (_, r) => <span style={{ fontSize: 13, color: "#374151" }}>{r.sfh.user.name}</span>,
            },
            {
              title: "Reason",
              key: "reason",
              render: (_, r) => <span style={{ fontSize: 13, color: "#374151" }}>{r.reason}</span>,
            },
            {
              title: "Requested",
              key: "createdAt",
              render: (_, r) => <span style={{ fontSize: 13, color: "#6B7280" }}>{fmtDate(r.createdAt)}</span>,
            },
            {
              title: "Status",
              key: "status",
              render: (_, r) =>
                r.status === "pending" ? (
                  <Tag color="orange">Pending</Tag>
                ) : r.status === "approved" ? (
                  <Tag color="green">Approved</Tag>
                ) : (
                  <Tag color="red">Rejected</Tag>
                ),
            },
            {
              title: "Actions",
              key: "actions",
              render: (_, r) =>
                r.status === "pending" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      type="primary"
                      size="small"
                      loading={actionBusy}
                      onClick={() => void approveRequest(r.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      danger
                      size="small"
                      disabled={actionBusy}
                      onClick={() => openReject(r.id)}
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: "#9CA3AF" }}>—</span>
                ),
            },
          ]}
        />
      ) : (
        <Table<VisitRow>
          rowKey="id"
          loading={busy}
          columns={columns}
          dataSource={filtered}
          pagination={pagination}
          scroll={{ x: true }}
          onRow={(r) => ({ onClick: () => navigate(`/visits/${r.id}`), style: { cursor: "pointer" } })}
          locale={{
            emptyText: (
              <EmptyState
                icon={<ClipboardX />}
                title="No visits found"
                subtitle={filter !== "all" ? `No ${filter} visits yet` : "No visits have been created yet"}
              />
            ),
          }}
          size="middle"
        />
      )}

      {/* Reject reason modal */}
      <Modal
        title="Reject Edit Request"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={() => void confirmReject()}
        confirmLoading={actionBusy}
        okText="Reject"
        okButtonProps={{ danger: true, style: { height: 38 } }}
        cancelButtonProps={{ style: { height: 38 } }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Optionally provide a reason for rejecting this edit request.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          placeholder="Rejection reason (optional)..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>

      {/* New visit modal */}
      <Modal
        title="New Visit"
        open={newOpen}
        onCancel={() => setNewOpen(false)}
        onOk={() => void createVisit()}
        confirmLoading={creating}
        okText="Create"
        destroyOnHidden
        okButtonProps={{ style: { height: 38 } }}
        cancelButtonProps={{ style: { height: 38 } }}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          One visit per branch per quarter. Choose a mapped branch and the quarter you are assessing.
        </Typography.Paragraph>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Branch</label>
          <Select
            showSearch allowClear placeholder="Search by code, name, or city"
            style={{ width: "100%" }} optionFilterProp="label"
            searchValue={branchQ} onSearch={setBranchQ} loading={branchBusy}
            value={pickBranch} onChange={setPickBranch}
            options={branchOpts.map((b) => ({ value: b.id, label: `${b.branchCode} · ${b.branchName}` }))}
          />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Quarter</label>
          <Select
            style={{ width: "100%" }} placeholder="Quarter"
            value={pickQuarter} onChange={setPickQuarter}
            options={quarters.map((q) => ({ value: q.id, label: `${q.label ?? `Q${q.quarterNumber}`} · FY ${q.financialYear}` }))}
          />
        </div>
      </Modal>
    </>
  );
}
