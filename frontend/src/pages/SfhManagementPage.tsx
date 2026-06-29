import { Alert, App, Button, Card, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from "antd";
import { Plus, Pencil, ArrowRight, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiFetch, clearTokens } from "../api/client";
import { PageHeader, EmptyState } from "../components/ui";
import { useTablePagination } from "../components/tableViewAll";

const { Text } = Typography;

type SfhRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  employeeCode: string | null;
  phone: string | null;
  stateRegion: string | null;
  assignedBranches: number;
};

type AddForm = {
  name: string;
  stateRegion: string;
  employeeCode: string;
  phone?: string;
};

type EditForm = {
  name: string;
  isActive: boolean;
  stateRegion: string;
  employeeCode: string;
  phone?: string;
};

type CreateSfhResponse = {
  id: string;
  userId: string;
  name: string;
  employeeCode: string;
  revealToken: string;
};

type RegeneratePasswordResponse = { revealToken: string };
type SupervisorPasswordResponse = { password: string };

async function fetchRevealedPassword(revealToken: string): Promise<string> {
  const { password } = await apiFetch<{ password: string }>(`/sfhs/password-reveal/${revealToken}`);
  return password;
}

export function SfhManagementPage() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [sfhs, setSfhs] = useState<SfhRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [totalBranches, setTotalBranches] = useState(0);
  const [unmappedCount, setUnmappedCount] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm] = Form.useForm<AddForm>();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SfhRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm<EditForm>();
  const [editShowLoginId, setEditShowLoginId] = useState(false);
  const [editRevealedPassword, setEditRevealedPassword] = useState<string | null>(null);
  const [editStoredPasswordRevealed, setEditStoredPasswordRevealed] = useState<string | null>(null);
  const [editPwdBusy, setEditPwdBusy] = useState(false);
  const [editShowCurrentPwdBusy, setEditShowCurrentPwdBusy] = useState(false);

  const editWatchCode = Form.useWatch("employeeCode", editForm);

  const { pagination } = useTablePagination(sfhs.length);

  function resetEditCredentialsUi() {
    setEditShowLoginId(false);
    setEditRevealedPassword(null);
    setEditStoredPasswordRevealed(null);
    setEditPwdBusy(false);
    setEditShowCurrentPwdBusy(false);
  }

  async function load() {
    setBusy(true);
    try {
      const [data, unmapped] = await Promise.all([
        apiFetch<SfhRow[]>("/sfhs"),
        apiFetch<{ id: string }[]>("/branches/unmapped").catch(() => [] as { id: string }[]),
      ]);
      setSfhs(data);
      setTotalBranches(data.reduce((s, r) => s + r.assignedBranches, 0));
      setUnmappedCount(unmapped.length);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        clearTokens();
        navigate("/login", { replace: true });
        return;
      }
      void message.error(e instanceof Error ? e.message : "Failed to load SFHs");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(values: AddForm) {
    setAddSaving(true);
    try {
      const res = await apiFetch<CreateSfhResponse>("/sfhs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          employeeId: values.employeeCode.trim(),
          stateRegion: values.stateRegion.trim(),
          phone: values.phone?.trim() || undefined,
          // No password — generated server-side so plaintext never leaves the backend.
        }),
      });
      // Redeem the single-use reveal token (2-min TTL) — keeps plaintext out of proxy/APM logs.
      const plainPassword = await fetchRevealedPassword(res.revealToken);
      modal.success({
        title: "SFH created",
        width: 520,
        content: (
          <div style={{ fontSize: 14 }}>
            <p style={{ marginBottom: 12 }}>
              SFHs sign in with <strong>employee code</strong> (not email). Share the details below securely with the new SFH.
            </p>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#6B7280" }}>Login ID</span>
              <div>
                <Text copyable strong>
                  {res.employeeCode}
                </Text>
              </div>
            </div>
            <div>
              <span style={{ color: "#6B7280" }}>Password</span>
              <div>
                <Text copyable strong>
                  {plainPassword}
                </Text>
              </div>
            </div>
          </div>
        ),
      });
      setAddOpen(false);
      addForm.resetFields();
      void load();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to create SFH");
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(sfh: SfhRow) {
    resetEditCredentialsUi();
    setEditTarget(sfh);
    editForm.setFieldsValue({
      name: sfh.name,
      isActive: sfh.isActive,
      stateRegion: sfh.stateRegion ?? "",
      employeeCode: sfh.employeeCode ?? "",
      phone: sfh.phone ?? undefined,
    });
    setEditOpen(true);
  }

  async function handleEditShowCurrentPassword() {
    if (!editTarget) return;
    setEditShowCurrentPwdBusy(true);
    try {
      const { password } = await apiFetch<SupervisorPasswordResponse>(`/sfhs/${editTarget.id}/supervisor-password`);
      setEditStoredPasswordRevealed(password);
      setEditRevealedPassword(null);
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Could not load current password");
    } finally {
      setEditShowCurrentPwdBusy(false);
    }
  }

  async function handleEditRegeneratePassword() {
    if (!editTarget) return;
    setEditPwdBusy(true);
    try {
      const { revealToken } = await apiFetch<RegeneratePasswordResponse>(
        `/sfhs/${editTarget.id}/regenerate-password`,
        { method: "POST" },
      );
      const password = await fetchRevealedPassword(revealToken);
      setEditStoredPasswordRevealed(null);
      setEditRevealedPassword(password);
      void message.success("New password set — share it securely with the SFH.");
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to set password");
    } finally {
      setEditPwdBusy(false);
    }
  }

  async function handleEdit(values: EditForm) {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await apiFetch(`/sfhs/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          isActive: values.isActive,
          stateRegion: values.stateRegion.trim(),
          employeeId: values.employeeCode.trim(),
          phone: values.phone?.trim() || undefined,
        }),
      });
      void message.success("SFH updated");
      setEditOpen(false);
      setEditTarget(null);
      resetEditCredentialsUi();
      void load();
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : "Failed to update SFH");
    } finally {
      setEditSaving(false);
    }
  }

  const loginIdDisplay = String(editWatchCode ?? editTarget?.employeeCode ?? "").trim();

  const chip = (label: string, bg: string, color: string) => (
    <span
      style={{
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 500,
        padding: "5px 12px",
        borderRadius: 9999,
      }}
    >
      {label}
    </span>
  );

  return (
    <>
      <PageHeader
        title="SFH Management"
        subtitle="Create and manage State Facility Heads"
        actions={
          <Button type="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)} style={{ height: 38 }}>
            Add SFH
          </Button>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {chip(`${sfhs.length} total SFHs`, "#F3F4F6", "#374151")}
        {chip(`${totalBranches} branches assigned`, "#F3F4F6", "#374151")}
        {unmappedCount > 0
          ? chip(`${unmappedCount} unassigned branches`, "#FEF2F2", "#DC2626")
          : chip("0 unassigned branches", "#F3F4F6", "#374151")}
      </div>

      <Card
        style={{
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<SfhRow>
          rowKey="id"
          dataSource={sfhs}
          loading={busy}
          pagination={pagination}
          scroll={{ x: true }}
          size="middle"
          locale={{
            emptyText: (
              <EmptyState icon={<Users size={40} />} title="No SFHs found" subtitle="Add an SFH to get started" />
            ),
          }}
          columns={[
            {
              title: "Name",
              key: "name",
              render: (_, r) => (
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{r.name}</div>
              ),
            },
            {
              title: "State / Region",
              dataIndex: "stateRegion",
              key: "sr",
              render: (v) => <span style={{ fontSize: 13, color: "#374151" }}>{v ?? "—"}</span>,
            },
            {
              title: "Employee Code",
              dataIndex: "employeeCode",
              key: "ec",
              render: (v) => <span style={{ fontSize: 13, color: "#6B7280" }}>{v ?? "—"}</span>,
            },
            {
              title: "Phone",
              dataIndex: "phone",
              key: "ph",
              render: (v) => <span style={{ fontSize: 13, color: "#6B7280" }}>{v ?? "—"}</span>,
            },
            {
              title: "Assigned Branches",
              dataIndex: "assignedBranches",
              key: "br",
              render: (v: number, r) => (
                <button
                  type="button"
                  onClick={() => navigate(`/branches?sfh_id=${r.id}`)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#4F46E5" }}>{v}</span>
                  <span style={{ fontSize: 11, color: "#A5B4FC", marginLeft: 4 }}>branches</span>
                </button>
              ),
            },
            {
              title: "Status",
              key: "status",
              render: (_, r) => (
                <Tag
                  style={{
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "2px 10px",
                    border: "none",
                    background: r.isActive ? "#D1FAE5" : "#F3F4F6",
                    color: r.isActive ? "#065F46" : "#6B7280",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: r.isActive ? "#059669" : "#9CA3AF",
                      marginRight: 6,
                    }}
                  />
                  {r.isActive ? "Active" : "Inactive"}
                </Tag>
              ),
            },
            {
              title: "Actions",
              key: "actions",
              render: (_, r) => (
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="small" icon={<Pencil size={13} />} onClick={() => openEdit(r)} style={{ height: 32 }}>
                    Edit
                  </Button>
                  <Button
                    size="small"
                    icon={<ArrowRight size={13} />}
                    onClick={() => navigate(`/branches?sfh_id=${r.id}`)}
                    style={{ height: 32 }}
                  >
                    View Branches
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={addOpen}
        title="Add New State Facility Head"
        width={560}
        onCancel={() => {
          setAddOpen(false);
          addForm.resetFields();
        }}
        onOk={() => addForm.submit()}
        confirmLoading={addSaving}
        destroyOnHidden
        okButtonProps={{ style: { height: 38 } }}
        cancelButtonProps={{ style: { height: 38 } }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Sign-in uses employee code and password"
          description="Supervisors generate the initial password here. It stays in effect until you change it from Edit (regenerate) or fulfill a reset request. Internal system email is created automatically — SFHs do not sign in with email."
        />
        <Form form={addForm} layout="vertical" onFinish={handleAdd} style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Form.Item name="name" label="Full Name" rules={[{ required: true, message: "Name is required" }]}>
              <Input style={{ height: 38 }} />
            </Form.Item>
            <Form.Item
              name="employeeCode"
              label="Employee code"
              rules={[
                { required: true, message: "Employee code is required" },
                { min: 2, message: "At least 2 characters" },
              ]}
              extra="Used as login ID on the sign-in page (letters, digits, hyphen)."
            >
              <Input autoComplete="off" style={{ height: 38 }} placeholder="e.g. EMP-10234" />
            </Form.Item>
            <Form.Item label="Password" style={{ marginBottom: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#6B7280",
                  padding: "8px 12px",
                  background: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                }}
              >
                A secure password is generated automatically when you save. It will be shown once after creation — copy and share it securely with the SFH.
              </div>
            </Form.Item>
            <Form.Item name="stateRegion" label="State / Region" rules={[{ required: true, message: "State or region is required" }]}>
              <Input style={{ height: 38 }} />
            </Form.Item>
            <Form.Item name="phone" label="Phone" style={{ gridColumn: "1 / -1" }}>
              <Input style={{ height: 38 }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={editOpen}
        title={`Edit SFH — ${editTarget?.name ?? ""}`}
        width={560}
        onCancel={() => {
          setEditOpen(false);
          setEditTarget(null);
          resetEditCredentialsUi();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={editSaving}
        destroyOnHidden
        okButtonProps={{ style: { height: 38 } }}
        cancelButtonProps={{ style: { height: 38 } }}
      >
        {editTarget && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              background: "#FAFAFA",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, color: "#111827" }}>Sign-in credentials (SFH)</div>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 12px" }}>
              Login ID and password stay hidden until you reveal them. Revealed values are read-only. Changing the password replaces the stored login secret (Generate new password).
            </p>
            {!editShowLoginId ? (
              <Button type="link" style={{ paddingLeft: 0, height: "auto" }} onClick={() => setEditShowLoginId(true)}>
                Show login ID
              </Button>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Login ID (employee code)</div>
                <Space.Compact style={{ width: "100%" }}>
                  <Input readOnly value={loginIdDisplay || "—"} style={{ height: 38 }} />
                </Space.Compact>
                <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => setEditShowLoginId(false)}>
                  Hide login ID
                </Button>
              </div>
            )}
            <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12, marginTop: 4 }}>
              {editRevealedPassword !== null || editStoredPasswordRevealed !== null ? (
                <div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                    {editRevealedPassword !== null
                      ? "New password (previous password no longer works)"
                      : "Current password (read-only — same as used on the login page)"}
                  </div>
                  <Input
                    readOnly
                    type="text"
                    value={editRevealedPassword ?? editStoredPasswordRevealed ?? ""}
                    style={{ height: 38, marginBottom: 8 }}
                  />
                  <Space wrap>
                    <Text copyable={{ text: editRevealedPassword ?? editStoredPasswordRevealed ?? "" }}>Copy</Text>
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingLeft: 0 }}
                      onClick={() => {
                        setEditRevealedPassword(null);
                        setEditStoredPasswordRevealed(null);
                      }}
                    >
                      Hide password
                    </Button>
                  </Space>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
                    {
                      "Show current password works for accounts created or updated after supervisor password storage was enabled. If unavailable, use Generate new password (replaces the old password)."
                    }
                  </div>
                  <Space wrap size="middle">
                    <Button type="default" loading={editShowCurrentPwdBusy} onClick={() => void handleEditShowCurrentPassword()}>
                      Show current password
                    </Button>
                    <Button type="default" loading={editPwdBusy} onClick={() => void handleEditRegeneratePassword()}>
                      Generate new password
                    </Button>
                  </Space>
                </>
              )}
            </div>
          </div>
        )}
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Form.Item name="name" label="Full Name" rules={[{ required: true, message: "Name is required" }]}>
              <Input style={{ height: 38 }} />
            </Form.Item>
            <Form.Item name="stateRegion" label="State / Region" rules={[{ required: true, message: "State or region is required" }]}>
              <Input style={{ height: 38 }} />
            </Form.Item>
            <Form.Item
              name="employeeCode"
              label="Employee code"
              rules={[
                { required: true, message: "Employee code is required" },
                { min: 2, message: "At least 2 characters" },
              ]}
              extra="Also used as login ID; changing it updates the account login."
            >
              <Input style={{ height: 38 }} />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input style={{ height: 38 }} />
            </Form.Item>
          </div>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
