import { App, Button, Card, Form, Input, Modal, Select, Switch, Table, Tag, Upload } from "antd";
import { Plus, Search, Building2, UploadCloud, GitBranch, Check, X, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { ApiError, apiFetch, clearTokens } from "../api/client";
import { PageHeader, EmptyState } from "../components/ui";
import { useTablePagination } from "../components/tableViewAll";

type BranchRow = {
  id: string;
  branchCode: string;
  branchName: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  branchType: "vistaar" | "non_vistaar";
  branchManagerName: string | null;
};

type BranchForm = {
  branchCode: string;
  branchName: string;
  city?: string;
  state?: string;
  branchType: "vistaar" | "non_vistaar";
  branchManagerName?: string;
  isActive: boolean;
};

type MappingRow = {
  id: string;
  sfhId: string;
  sfhName: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  city: string | null;
  state: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  isCurrent: boolean;
  effectiveFrom: string | null;
  createdAt: string;
};

type SfhOption = { id: string; name: string; stateRegion: string | null };
type UnmappedBranch = { id: string; branchCode: string; branchName: string; city: string | null; state: string | null };

const DOT_COLORS = ["#4F46E5", "#059669", "#DC2626", "#D97706", "#7C3AED", "#0891B2", "#BE185D"];
function sfhDotColor(sfhId: string, sfhs: SfhOption[]) {
  const idx = sfhs.findIndex((s) => s.id === sfhId);
  return DOT_COLORS[idx % DOT_COLORS.length] ?? "#6B7280";
}

export function BranchesManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message, modal } = App.useApp();

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchBusy, setBranchBusy] = useState(true);
  const [branchSearch, setBranchSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "vistaar" | "non_vistaar">("all");

  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm] = Form.useForm<BranchForm>();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BranchRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm<BranchForm>();

  const [uploadOpen, setUploadOpen] = useState(false);

  const [allMappings, setAllMappings] = useState<MappingRow[]>([]);
  const [sfhs, setSfhs] = useState<SfhOption[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedBranch[]>([]);
  const [mapBusy, setMapBusy] = useState(true);

  const [sfhFilter, setSfhFilter] = useState<string | undefined>(searchParams.get("sfh_id") ?? undefined);
  const [stateFilter, setStateFilter] = useState<string | undefined>();

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignBranchId, setAssignBranchId] = useState<string | undefined>();
  const [assignSfhId, setAssignSfhId] = useState<string | undefined>();
  const [assignBranchQ, setAssignBranchQ] = useState("");
  const [currentAssignee, setCurrentAssignee] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  const approvedMappings = allMappings.filter((m) => m.isCurrent && m.approvalStatus === "approved");
  const pendingMappings = allMappings.filter((m) => m.approvalStatus === "pending");
  const { pagination: branchPagination } = useTablePagination(branches.length);
  const { pagination: pendingMapPagination } = useTablePagination(pendingMappings.length);

  async function loadBranches() {
    setBranchBusy(true);
    try {
      const data = await apiFetch<BranchRow[]>("/branches?includeInactive=true");
      setBranches(data);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) { clearTokens(); navigate("/login", { replace: true }); return; }
      void message.error(e instanceof Error ? e.message : "Failed to load branches");
    } finally {
      setBranchBusy(false);
    }
  }

  async function loadMappings() {
    setMapBusy(true);
    try {
      const [mappings, sfhList, unmappedList] = await Promise.all([
        apiFetch<MappingRow[]>("/mappings"),
        apiFetch<SfhOption[]>("/sfhs"),
        apiFetch<UnmappedBranch[]>("/branches/unmapped").catch(() => [] as UnmappedBranch[]),
      ]);
      setAllMappings(mappings);
      setSfhs(sfhList);
      setUnmapped(unmappedList);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) { clearTokens(); navigate("/login", { replace: true }); return; }
      void message.error(e instanceof Error ? e.message : "Failed to load mappings");
    } finally {
      setMapBusy(false);
    }
  }

  useEffect(() => { void loadBranches(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadMappings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSfhFilter(searchParams.get("sfh_id") ?? undefined);
  }, [searchParams]);

  async function handleAdd(values: BranchForm) {
    setAddSaving(true);
    try {
      await apiFetch("/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      void message.success("Branch created");
      setAddOpen(false);
      addForm.resetFields();
      void loadBranches();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to create branch");
    } finally { setAddSaving(false); }
  }

  function openEdit(b: BranchRow) {
    setEditTarget(b);
    editForm.setFieldsValue({ branchCode: b.branchCode, branchName: b.branchName, city: b.city ?? undefined, state: b.state ?? undefined, branchType: b.branchType, branchManagerName: b.branchManagerName ?? undefined, isActive: b.isActive });
    setEditOpen(true);
  }

  async function handleEdit(values: BranchForm) {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await apiFetch(`/branches/${editTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      void message.success("Branch updated");
      setEditOpen(false);
      setEditTarget(null);
      void loadBranches();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to update branch");
    } finally { setEditSaving(false); }
  }

  async function approveMapping(mappingId: string) {
    try {
      await apiFetch(`/mappings/${mappingId}/approve`, { method: "PATCH" });
      void message.success("Mapping approved");
      void loadMappings();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to approve");
    }
  }

  function confirmApprove(mappingId: string) {
    modal.confirm({ title: "Approve this mapping?", content: "The branch will be assigned to the selected SFH.", okText: "Approve", onOk: () => approveMapping(mappingId) });
  }

  function openReject(mappingId: string) { setRejectTarget(mappingId); setRejectRemarks(""); setRejectOpen(true); }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejectSaving(true);
    try {
      await apiFetch(`/mappings/${rejectTarget}/reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: rejectRemarks || undefined }) });
      void message.success("Mapping rejected");
      setRejectOpen(false);
      void loadMappings();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to reject");
    } finally { setRejectSaving(false); }
  }

  function openAssign(branchId?: string) {
    setAssignBranchId(branchId);
    setAssignSfhId(undefined);
    setAssignBranchQ("");
    const existing = approvedMappings.find((m) => m.branchId === branchId);
    setCurrentAssignee(existing?.sfhName ?? null);
    setAssignOpen(true);
  }

  async function handleAssign() {
    if (!assignBranchId || !assignSfhId) { void message.warning("Select branch and SFH"); return; }
    setAssignSaving(true);
    try {
      await apiFetch("/mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId: assignBranchId, sfhId: assignSfhId, effectiveFrom: dayjs().format("YYYY-MM-DD") }) });
      void message.success(currentAssignee ? "Branch remapped" : "Branch assigned");
      setAssignOpen(false);
      void loadMappings();
      void loadBranches();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to assign");
    } finally { setAssignSaving(false); }
  }

  const filteredBranches = branches.filter((b) => {
    if (statusFilter === "active" && !b.isActive) return false;
    if (statusFilter === "inactive" && b.isActive) return false;
    if (typeFilter !== "all" && b.branchType !== typeFilter) return false;

    const approved = approvedMappings.find((m) => m.branchId === b.id);
    if (sfhFilter && (!approved || approved.sfhId !== sfhFilter)) return false;
    if (stateFilter) {
      if (!approved) return false;
      const sfh = sfhs.find((s) => s.id === approved.sfhId);
      if (sfh?.stateRegion !== stateFilter) return false;
    }

    if (branchSearch) {
      const s = branchSearch.toLowerCase();
      const sfhName = approved?.sfhName?.toLowerCase() ?? "";
      return (
        b.branchCode.toLowerCase().includes(s) ||
        b.branchName.toLowerCase().includes(s) ||
        (b.city?.toLowerCase().includes(s) ?? false) ||
        (b.state?.toLowerCase().includes(s) ?? false) ||
        sfhName.includes(s)
      );
    }
    return true;
  });

  const unmappedFiltered = unmapped.filter((b) => {
    if (!branchSearch) return true;
    const s = branchSearch.toLowerCase();
    return b.branchCode.toLowerCase().includes(s) || b.branchName.toLowerCase().includes(s) || (b.city?.toLowerCase().includes(s) ?? false);
  });

  const stateOptions = Array.from(new Set(sfhs.map((s) => s.stateRegion).filter(Boolean))).map((s) => ({ value: s!, label: s! }));
  const assignBranchOptions = [
    ...unmapped.map((b) => ({ value: b.id, label: `${b.branchCode} - ${b.branchName}` })),
    ...approvedMappings.map((m) => ({ value: m.branchId, label: `${m.branchCode} - ${m.branchName} (remap)` })),
  ].filter((opt) => !assignBranchQ || opt.label.toLowerCase().includes(assignBranchQ.toLowerCase()));

  const activeCount = branches.filter((b) => b.isActive).length;
  const vistaarCount = branches.filter((b) => b.branchType === "vistaar").length;

  const branchFormFields = (isEdit: boolean) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Form.Item name="branchCode" label="Branch Code" rules={[{ required: true }]}><Input style={{ height: 38, fontFamily: "monospace" }} disabled={isEdit} /></Form.Item>
      <Form.Item name="branchName" label="Branch Name" rules={[{ required: true }]}><Input style={{ height: 38 }} /></Form.Item>
      <Form.Item name="city" label="City"><Input style={{ height: 38 }} /></Form.Item>
      <Form.Item name="state" label="State"><Input style={{ height: 38 }} /></Form.Item>
      <Form.Item name="branchType" label="Branch Type" rules={[{ required: true }]}>
        <Select style={{ height: 38 }} options={[{ value: "vistaar", label: "Vistaar" }, { value: "non_vistaar", label: "Non-Vistaar" }]} />
      </Form.Item>
      <Form.Item name="branchManagerName" label="Manager Name"><Input style={{ height: 38 }} /></Form.Item>
      <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Branches"
        subtitle="Manage branch directory and SFH assignments"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button icon={<UploadCloud size={14} />} onClick={() => setUploadOpen(true)} style={{ height: 38 }}>Bulk Upload</Button>
            <Button icon={<Plus size={14} />} onClick={() => openAssign(undefined)} style={{ height: 38 }}>Assign Branch</Button>
            <Button type="primary" icon={<Plus size={14} />} onClick={() => { addForm.resetFields(); addForm.setFieldsValue({ isActive: true, branchType: "non_vistaar" }); setAddOpen(true); }} style={{ height: 38 }}>Add Branch</Button>
          </div>
        }
      />

      {pendingMappings.length > 0 && (
        <Card style={{ borderRadius: 12, border: "1px solid #FCD34D", background: "#FFFBEB", marginBottom: 20 }} styles={{ body: { padding: 0 } }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #FCD34D", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#92400E" }}>Pending SFH assignment approvals</span>
            <Tag color="warning" style={{ borderRadius: 9999, fontSize: 11 }}>{pendingMappings.length}</Tag>
          </div>
          <Table<MappingRow>
            rowKey="id" dataSource={pendingMappings} pagination={pendingMapPagination} scroll={{ x: true }} size="small"
            locale={{ emptyText: <EmptyState icon={<GitBranch size={32} />} title="No pending requests" subtitle="" /> }}
            columns={[
              { title: "Branch", key: "branch", render: (_, r) => (<div><div style={{ fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "monospace" }}>{r.branchCode}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{r.branchName}</div></div>) },
              { title: "Requested SFH", key: "sfh", render: (_, r) => (<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: sfhDotColor(r.sfhId, sfhs), display: "inline-block" }} /><span style={{ fontSize: 13 }}>{r.sfhName}</span></div>) },
              { title: "Actions", key: "actions", render: (_, r) => (<div style={{ display: "flex", gap: 6 }}><Button size="small" type="primary" icon={<Check size={12} />} onClick={() => confirmApprove(r.id)} style={{ height: 30, background: "#059669", borderColor: "#059669" }}>Approve</Button><Button size="small" danger icon={<X size={12} />} onClick={() => openReject(r.id)} style={{ height: 30 }}>Reject</Button></div>) },
            ]}
          />
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: `${branches.length} total`, bg: "#F3F4F6", color: "#374151" },
            { label: `${activeCount} active`, bg: "#D1FAE5", color: "#065F46" },
            { label: `${branches.length - activeCount} inactive`, bg: "#F3F4F6", color: "#6B7280" },
            { label: `${vistaarCount} Vistaar`, bg: "#EEF2FF", color: "#4338CA" },
            { label: `${approvedMappings.length} assigned`, bg: "#F3F4F6", color: "#374151" },
            { label: `${unmapped.length} unassigned`, bg: unmapped.length > 0 ? "#FEF2F2" : "#F3F4F6", color: unmapped.length > 0 ? "#DC2626" : "#374151" },
            { label: `${pendingMappings.length} pending`, bg: pendingMappings.length > 0 ? "#FFFBEB" : "#F3F4F6", color: pendingMappings.length > 0 ? "#D97706" : "#374151" },
          ].map((chip) => (
            <span key={chip.label} style={{ background: chip.bg, color: chip.color, fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 9999 }}>{chip.label}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
          <Input prefix={<Search size={14} style={{ color: "#9CA3AF" }} />} placeholder="Code, name, city, state, or SFH..." value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)} style={{ flex: "1 1 220px", minWidth: 0, height: 36 }} allowClear />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ flex: "0 1 140px", minWidth: 120 }} options={[{ value: "all", label: "All Status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          <Select value={typeFilter} onChange={setTypeFilter} style={{ flex: "0 1 160px", minWidth: 120 }} options={[{ value: "all", label: "All Types" }, { value: "vistaar", label: "Vistaar" }, { value: "non_vistaar", label: "Non-Vistaar" }]} />
          <Select
            placeholder="Filter by SFH"
            style={{ flex: "1 1 180px", minWidth: 0 }}
            allowClear
            value={sfhFilter}
            onChange={(v) => {
              setSfhFilter(v);
              const next = new URLSearchParams(searchParams);
              if (v) next.set("sfh_id", v);
              else next.delete("sfh_id");
              setSearchParams(next, { replace: true });
            }}
            options={sfhs.map((s) => ({ value: s.id, label: s.name }))}
            optionFilterProp="label"
            showSearch
          />
          <Select placeholder="SFH state / region" style={{ flex: "1 1 160px", minWidth: 0 }} allowClear value={stateFilter} onChange={setStateFilter} options={stateOptions} optionFilterProp="label" showSearch />
        </div>
        <Card style={{ borderRadius: 12, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }} styles={{ body: { padding: 0 } }}>
          <Table<BranchRow>
            rowKey="id" dataSource={filteredBranches} loading={branchBusy || mapBusy} pagination={branchPagination} scroll={{ x: true }} size="middle"
            locale={{ emptyText: <EmptyState icon={<Building2 size={40} />} title="No branches found" subtitle="Add a branch or adjust filters" /> }}
            columns={[
              { title: "Branch Code", dataIndex: "branchCode", key: "code", render: (v: string) => <span style={{ fontSize: 13, fontWeight: 700, color: "#4F46E5", fontFamily: "monospace" }}>{v}</span> },
              { title: "Branch Name", dataIndex: "branchName", key: "name", render: (v: string) => <span style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{v}</span> },
              { title: "Location", key: "loc", render: (_, r) => <span style={{ fontSize: 13, color: "#374151" }}>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</span> },
              {
                title: "SFH",
                key: "sfh",
                render: (_, r) => {
                  const m = approvedMappings.find((x) => x.branchId === r.id);
                  if (!m) return <Tag style={{ borderRadius: 9999, fontSize: 11, border: "none", background: "#F3F4F6", color: "#6B7280" }}>Unassigned</Tag>;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: sfhDotColor(m.sfhId, sfhs), display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "#374151" }}>{m.sfhName}</span>
                    </div>
                  );
                },
              },
              { title: "Manager", dataIndex: "branchManagerName", key: "mgr", render: (v: string | null) => <span style={{ fontSize: 13, color: "#374151" }}>{v ?? "—"}</span> },
              { title: "Type", dataIndex: "branchType", key: "type", render: (v: string) => v === "vistaar" ? <Tag style={{ borderRadius: 9999, fontSize: 11, fontWeight: 600, border: "none", background: "#EEF2FF", color: "#4338CA" }}>Vistaar</Tag> : <Tag style={{ borderRadius: 9999, fontSize: 11, border: "none", background: "#F3F4F6", color: "#6B7280" }}>Non-Vistaar</Tag> },
              { title: "Status", key: "status", render: (_, r) => (
                <Tag style={{ borderRadius: 9999, fontSize: 12, fontWeight: 600, padding: "2px 10px", border: "none", background: r.isActive ? "#D1FAE5" : "#F3F4F6", color: r.isActive ? "#065F46" : "#6B7280" }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: r.isActive ? "#059669" : "#9CA3AF", marginRight: 6 }} />
                  {r.isActive ? "Active" : "Inactive"}
                </Tag>
              ) },
              {
                title: "Actions",
                key: "actions",
                fixed: "right" as const,
                render: (_, r) => (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button size="small" onClick={() => openEdit(r)} style={{ height: 32 }}>Edit</Button>
                    <Button size="small" icon={<GitBranch size={13} />} onClick={() => openAssign(r.id)} style={{ height: 32 }}>Remap</Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>

      {unmappedFiltered.length > 0 && (
        <Card style={{ borderRadius: 12, border: "1px solid #FECACA", background: "#FFF5F5", marginTop: 20 }} styles={{ body: { padding: 0 } }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#991B1B" }}>Unassigned branches</span>
            <Tag color="error" style={{ borderRadius: 9999, fontSize: 11 }}>{unmappedFiltered.length}</Tag>
          </div>
          <Table<UnmappedBranch>
            rowKey="id" dataSource={unmappedFiltered} pagination={false} scroll={{ x: true }} size="small"
            locale={{ emptyText: <EmptyState icon={<Users size={32} />} title="All branches assigned" subtitle="" /> }}
            columns={[
              { title: "Branch Code", dataIndex: "branchCode", key: "code", render: (v: string) => <span style={{ fontSize: 13, fontWeight: 600, color: "#4F46E5", fontFamily: "monospace" }}>{v}</span> },
              { title: "Branch Name", dataIndex: "branchName", key: "name", render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span> },
              { title: "Location", key: "loc", render: (_, r) => <span style={{ fontSize: 12, color: "#6B7280" }}>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</span> },
              { title: "Actions", key: "action", render: (_, r) => (<Button size="small" type="primary" icon={<Plus size={13} />} onClick={() => openAssign(r.id)} style={{ height: 30 }}>Assign</Button>) },
            ]}
          />
        </Card>
      )}

      <Modal open={addOpen} title="Add New Branch" width={600} onCancel={() => { setAddOpen(false); addForm.resetFields(); }} onOk={() => addForm.submit()} confirmLoading={addSaving} destroyOnHidden okButtonProps={{ style: { height: 38 } }} cancelButtonProps={{ style: { height: 38 } }}>
        <Form form={addForm} layout="vertical" onFinish={handleAdd} style={{ marginTop: 8 }}>{branchFormFields(false)}</Form>
      </Modal>

      <Modal open={editOpen} title={`Edit Branch — ${editTarget?.branchCode ?? ""}`} width={600} onCancel={() => { setEditOpen(false); setEditTarget(null); }} onOk={() => editForm.submit()} confirmLoading={editSaving} destroyOnHidden okButtonProps={{ style: { height: 38 } }} cancelButtonProps={{ style: { height: 38 } }}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 8 }}>{branchFormFields(true)}</Form>
      </Modal>

      <Modal open={uploadOpen} title="Bulk Upload Branches" width={480} onCancel={() => setUploadOpen(false)} footer={null} destroyOnHidden>
        <div style={{ padding: "8px 0" }}>
          <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#6B7280" }}>
            Upload CSV/Excel with: <strong style={{ color: "#374151" }}>Branch Code, Branch Name, City, State, Branch Type, Branch Manager</strong>
          </div>
          <Upload.Dragger name="file" accept=".csv,.xlsx,.xls" showUploadList={false} action="/api/branches/bulk-upload"
            onChange={(info) => {
              if (info.file.status === "done") {
                const r = info.file.response as { inserted: number; updated: number; errors: unknown[] };
                void message.success(`${r.inserted} added, ${r.updated} updated`);
                if (r.errors.length > 0) void message.warning(`${r.errors.length} rows had errors`);
                setUploadOpen(false);
                void loadBranches();
              } else if (info.file.status === "error") { void message.error("Upload failed"); }
            }} style={{ borderRadius: 8 }}>
            <div style={{ padding: "24px 16px", textAlign: "center" }}>
              <UploadCloud size={40} style={{ color: "#9CA3AF", marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 14, color: "#374151", fontWeight: 500 }}>Click or drag file here</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9CA3AF" }}>Supports .csv, .xlsx, .xls</p>
            </div>
          </Upload.Dragger>
          <div style={{ marginTop: 12, textAlign: "right" }}><Button onClick={() => setUploadOpen(false)} style={{ height: 38 }}>Cancel</Button></div>
        </div>
      </Modal>

      <Modal open={assignOpen} title={currentAssignee ? "Remap Branch" : "Assign Branch to SFH"} width={520} onCancel={() => setAssignOpen(false)} onOk={() => void handleAssign()} confirmLoading={assignSaving} okText={currentAssignee ? "Remap" : "Assign"} destroyOnHidden okButtonProps={{ style: { height: 38 } }} cancelButtonProps={{ style: { height: 38 } }}>
        {currentAssignee && (
          <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 13, color: "#6B7280" }}>
            Currently assigned to: <strong style={{ color: "#374151" }}>{currentAssignee}</strong>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Branch</label>
          <Select showSearch placeholder="Search branch" style={{ width: "100%" }} optionFilterProp="label" searchValue={assignBranchQ} onSearch={setAssignBranchQ} value={assignBranchId}
            onChange={(v) => { setAssignBranchId(v); const existing = approvedMappings.find((m) => m.branchId === v); setCurrentAssignee(existing?.sfhName ?? null); }}
            options={assignBranchOptions} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Assign to SFH</label>
          <Select showSearch placeholder="Select SFH" style={{ width: "100%" }} optionFilterProp="label" value={assignSfhId} onChange={setAssignSfhId}
            options={sfhs.map((s) => ({ value: s.id, label: `${s.name}${s.stateRegion ? ` · ${s.stateRegion}` : ""}` }))} />
        </div>
      </Modal>

      <Modal open={rejectOpen} title="Reject Mapping Request" width={440} onCancel={() => setRejectOpen(false)} onOk={() => void handleReject()} confirmLoading={rejectSaving} okText="Reject" okButtonProps={{ danger: true, style: { height: 38 } }} cancelButtonProps={{ style: { height: 38 } }} destroyOnHidden>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Remarks (optional)</label>
          <Input.TextArea rows={3} placeholder="Reason for rejection..." value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
