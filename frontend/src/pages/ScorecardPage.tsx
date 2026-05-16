import {
  App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Skeleton, Tooltip, Typography,
} from "antd";
import {
  GripVertical, Pencil, Plus, Trash2, ChevronRight, ClipboardCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import { PageHeader } from "../components/ui";

const { Text, Paragraph } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────

type Subcategory = {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  displayOrder: number;
  isActive: boolean;
};

type Category = {
  id: string;
  name: string;
  displayOrder: number;
  version: number;
  isActive: boolean;
  subcategories: Subcategory[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const DRAG_MIME = "application/x-scorecard-drag";

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  selected,
  onSelect,
  onEdit,
  onDelete,
  dragHandleProps,
}: {
  cat: Category;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLSpanElement>;
}) {
  const activeSubs = cat.subcategories.filter((s) => s.isActive).length;
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1.5px solid ${selected ? "#4F46E5" : "#E5E7EB"}`,
        background: selected ? "#EEF2FF" : "#fff",
        cursor: "pointer",
        transition: "all 150ms",
        marginBottom: 8,
        userSelect: "none",
      }}
    >
      <span
        {...dragHandleProps}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "#9CA3AF", cursor: "grab", flexShrink: 0, display: "flex" }}
      >
        <GripVertical size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {cat.name}
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
          {activeSubs} parameter{activeSubs !== 1 ? "s" : ""} · v{cat.version}
        </div>
      </div>
      <ChevronRight size={14} style={{ color: "#9CA3AF", flexShrink: 0 }} />
      <span
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        title="Edit category"
        style={{ color: "#6B7280", cursor: "pointer", display: "flex", padding: 2 }}
      >
        <Pencil size={14} />
      </span>
      <Tooltip
        title={activeSubs > 0 ? "Remove all parameters before deleting this category" : "Delete category"}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (activeSubs === 0) onDelete();
          }}
          style={{
            color: activeSubs > 0 ? "#D1D5DB" : "#EF4444",
            cursor: activeSubs > 0 ? "not-allowed" : "pointer",
            display: "flex",
            padding: 2,
          }}
        >
          <Trash2 size={14} />
        </span>
      </Tooltip>
    </div>
  );
}

// ── Subcategory row ───────────────────────────────────────────────────────────

function SubcategoryRow({
  sub,
  onEdit,
  onDelete,
  dragHandleProps,
}: {
  sub: Subcategory;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLSpanElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #E5E7EB",
        background: "#fff",
        marginBottom: 8,
        userSelect: "none",
      }}
    >
      <span
        {...dragHandleProps}
        style={{ color: "#9CA3AF", cursor: "grab", flexShrink: 0, display: "flex", paddingTop: 2 }}
      >
        <GripVertical size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{sub.name}</span>
          <span
            style={{
              fontSize: 11, fontWeight: 700, background: "#EEF2FF", color: "#4F46E5",
              padding: "1px 7px", borderRadius: 9999,
            }}
          >
            Max {sub.maxScore}
          </span>
        </div>
        {sub.description && (
          <div style={{ marginTop: 4 }}>
            <Paragraph
              style={{ fontSize: 12, color: "#6B7280", margin: 0 }}
              ellipsis={{ rows: expanded ? undefined : 2, expandable: !expanded }}
              onClick={() => setExpanded((x) => !x)}
            >
              {sub.description}
            </Paragraph>
          </div>
        )}
      </div>
      <span
        onClick={onEdit}
        title="Edit parameter"
        style={{ color: "#6B7280", cursor: "pointer", display: "flex", padding: 2, flexShrink: 0 }}
      >
        <Pencil size={14} />
      </span>
      <span
        onClick={onDelete}
        title="Delete parameter"
        style={{ color: "#EF4444", cursor: "pointer", display: "flex", padding: 2, flexShrink: 0 }}
      >
        <Trash2 size={14} />
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ScorecardPage() {
  const { message, modal } = App.useApp();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalMode, setCatModalMode] = useState<"add" | "edit">("add");
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [catForm] = Form.useForm<{ name: string }>();

  // Subcategory modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subModalMode, setSubModalMode] = useState<"add" | "edit">("add");
  const [editingSub, setEditingSub] = useState<Subcategory | null>(null);
  const [subSaving, setSubSaving] = useState(false);
  const [subForm] = Form.useForm<{ name: string; description?: string; maxScore: number }>();

  // Drag state for categories
  const catDragSrc = useRef<number | null>(null);
  // Drag state for subcategories
  const subDragSrc = useRef<number | null>(null);

  const selectedCat = categories.find((c) => c.id === selectedCatId) ?? null;

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Category[]>("/categories");
      setCategories(data);
      // Keep selection valid
      setSelectedCatId((prev) => (data.find((c) => c.id === prev) ? prev : null));
    } catch {
      void message.error("Failed to load scorecard categories");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  // ── Category CRUD ─────────────────────────────────────────────────────────

  function openAddCategory() {
    setCatModalMode("add");
    setEditingCat(null);
    catForm.resetFields();
    setCatModalOpen(true);
  }

  function openEditCategory(cat: Category) {
    setCatModalMode("edit");
    setEditingCat(cat);
    catForm.setFieldsValue({ name: cat.name });
    setCatModalOpen(true);
  }

  async function saveCategory() {
    const vals = await catForm.validateFields();
    setCatSaving(true);
    try {
      const nextOrder =
        catModalMode === "add"
          ? (categories.at(-1)?.displayOrder ?? -1) + 10
          : editingCat!.displayOrder;
      if (catModalMode === "add") {
        await apiFetch("/categories", {
          method: "POST",
          body: JSON.stringify({ name: vals.name, displayOrder: nextOrder }),
        });
      } else {
        await apiFetch(`/categories/${editingCat!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: vals.name }),
        });
      }
      setCatModalOpen(false);
      await loadCategories();
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCatSaving(false);
    }
  }

  function confirmDeleteCategory(cat: Category) {
    modal.confirm({
      title: "Delete category",
      content: "This category will be removed from all future visits. Are you sure?",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await apiFetch(`/categories/${cat.id}`, { method: "DELETE" });
          if (selectedCatId === cat.id) setSelectedCatId(null);
          await loadCategories();
        } catch (e) {
          void message.error(e instanceof Error ? e.message : "Delete failed");
        }
      },
    });
  }

  // ── Category drag-and-drop ────────────────────────────────────────────────

  function onCatDragStart(idx: number) {
    catDragSrc.current = idx;
  }

  function onCatDrop(targetIdx: number) {
    const src = catDragSrc.current;
    if (src === null || src === targetIdx) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(src, 1);
    reordered.splice(targetIdx, 0, moved);
    const updates = reordered.map((c, i) => ({ id: c.id, displayOrder: i * 10 }));
    setCategories(reordered.map((c, i) => ({ ...c, displayOrder: i * 10 })));
    apiFetch("/categories/reorder", {
      method: "PATCH",
      body: JSON.stringify(updates),
    }).catch(() => {
      void message.error("Reorder failed");
      void loadCategories();
    });
  }

  // ── Subcategory CRUD ──────────────────────────────────────────────────────

  function openAddSub() {
    if (!selectedCat) return;
    setSubModalMode("add");
    setEditingSub(null);
    subForm.resetFields();
    subForm.setFieldsValue({ maxScore: 5 });
    setSubModalOpen(true);
  }

  function openEditSub(sub: Subcategory) {
    setSubModalMode("edit");
    setEditingSub(sub);
    subForm.setFieldsValue({ name: sub.name, description: sub.description ?? undefined, maxScore: sub.maxScore });
    setSubModalOpen(true);
  }

  async function saveSub() {
    if (!selectedCat) return;
    const vals = await subForm.validateFields();
    setSubSaving(true);
    try {
      const activeSubs = selectedCat.subcategories.filter((s) => s.isActive);
      const nextOrder =
        subModalMode === "add"
          ? (activeSubs.at(-1)?.displayOrder ?? -1) + 10
          : editingSub!.displayOrder;
      if (subModalMode === "add") {
        await apiFetch(`/categories/${selectedCat.id}/subcategories`, {
          method: "POST",
          body: JSON.stringify({ name: vals.name, description: vals.description ?? null, maxScore: vals.maxScore, displayOrder: nextOrder }),
        });
      } else {
        await apiFetch(`/categories/${selectedCat.id}/subcategories/${editingSub!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: vals.name, description: vals.description ?? null, maxScore: vals.maxScore }),
        });
      }
      setSubModalOpen(false);
      await loadCategories();
    } catch (e) {
      void message.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubSaving(false);
    }
  }

  function confirmDeleteSub(sub: Subcategory) {
    modal.confirm({
      title: "Delete parameter",
      content:
        "This parameter will be hidden from all future visits. Existing submitted visit scores are preserved. Are you sure?",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!selectedCat) return;
        try {
          try {
            await apiFetch(`/categories/${selectedCat.id}/subcategories/${sub.id}`, { method: "DELETE" });
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
              void message.info(
                "This parameter has been used in submitted visits and cannot be deleted. It has been deactivated and will no longer appear in new visits."
              );
              await loadCategories();
              return;
            }
            throw e;
          }
          await loadCategories();
        } catch (e) {
          void message.error(e instanceof Error ? e.message : "Delete failed");
        }
      },
    });
  }

  // ── Subcategory drag-and-drop ─────────────────────────────────────────────

  function onSubDragStart(idx: number) {
    subDragSrc.current = idx;
  }

  function onSubDrop(targetIdx: number) {
    if (!selectedCat) return;
    const src = subDragSrc.current;
    if (src === null || src === targetIdx) return;
    const activeSubs = selectedCat.subcategories.filter((s) => s.isActive);
    const reordered = [...activeSubs];
    const [moved] = reordered.splice(src, 1);
    reordered.splice(targetIdx, 0, moved);
    const updates = reordered.map((s, i) => ({ id: s.id, displayOrder: i * 10 }));
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== selectedCat.id ? c
        : {
            ...c,
            subcategories: [
              ...reordered.map((s, i) => ({ ...s, displayOrder: i * 10 })),
              ...c.subcategories.filter((s) => !s.isActive),
            ],
          }
      )
    );
    apiFetch(`/categories/${selectedCat.id}/subcategories/reorder`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }).catch(() => {
      void message.error("Reorder failed");
      void loadCategories();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activeSubs = selectedCat?.subcategories.filter((s) => s.isActive) ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        title="Scorecard Management"
        subtitle="Manage assessment categories and scoring parameters"
        actions={
          <Button type="primary" icon={<Plus size={14} />} onClick={openAddCategory}>
            Add Category
          </Button>
        }
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Row gutter={20} style={{ alignItems: "flex-start" }}>
          {/* ── Left panel: Categories ── */}
          <Col xs={24} md={10} lg={9}>
            <Card
              size="small"
              title={
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                  <ClipboardCheck size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                  Categories
                </span>
              }
              extra={
                <Button size="small" type="link" icon={<Plus size={12} />} onClick={openAddCategory}>
                  Add
                </Button>
              }
              styles={{ body: { padding: "12px 12px 4px" } }}
            >
              {categories.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF", fontSize: 13 }}>
                  No categories yet. Add one to get started.
                </div>
              ) : (
                categories.map((cat, idx) => (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={() => onCatDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onCatDrop(idx)}
                    onDragEnd={() => { catDragSrc.current = null; }}
                    data-mime={DRAG_MIME}
                  >
                    <CategoryCard
                      cat={cat}
                      selected={selectedCatId === cat.id}
                      onSelect={() => setSelectedCatId(cat.id)}
                      onEdit={() => openEditCategory(cat)}
                      onDelete={() => confirmDeleteCategory(cat)}
                      dragHandleProps={{
                        draggable: false,
                        onMouseDown: (e) => e.stopPropagation(),
                      }}
                    />
                  </div>
                ))
              )}
            </Card>
          </Col>

          {/* ── Right panel: Subcategories ── */}
          <Col xs={24} md={14} lg={15}>
            <Card
              size="small"
              title={
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                  {selectedCat ? (
                    <>
                      <Text style={{ color: "#4F46E5" }}>{selectedCat.name}</Text>
                      <Text style={{ color: "#9CA3AF", fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                        — Parameters
                      </Text>
                    </>
                  ) : (
                    "Parameters"
                  )}
                </span>
              }
              extra={
                selectedCat && (
                  <Button size="small" type="link" icon={<Plus size={12} />} onClick={openAddSub}>
                    Add Parameter
                  </Button>
                )
              }
              styles={{ body: { padding: "12px 12px 4px" } }}
            >
              {!selectedCat ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF", fontSize: 13 }}>
                  Select a category to view its parameters.
                </div>
              ) : activeSubs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF", fontSize: 13 }}>
                  No parameters yet.{" "}
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={openAddSub}>
                    Add the first one.
                  </Button>
                </div>
              ) : (
                activeSubs.map((sub, idx) => (
                  <div
                    key={sub.id}
                    draggable
                    onDragStart={() => onSubDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onSubDrop(idx)}
                    onDragEnd={() => { subDragSrc.current = null; }}
                  >
                    <SubcategoryRow
                      sub={sub}
                      onEdit={() => openEditSub(sub)}
                      onDelete={() => confirmDeleteSub(sub)}
                      dragHandleProps={{ draggable: false }}
                    />
                  </div>
                ))
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* ── Category Modal ── */}
      <Modal
        open={catModalOpen}
        title={catModalMode === "add" ? "Add Category" : "Edit Category"}
        onCancel={() => setCatModalOpen(false)}
        onOk={saveCategory}
        okText={catSaving ? "Saving…" : "Save"}
        confirmLoading={catSaving}
        width={440}
        destroyOnClose
      >
        {catModalMode === "edit" && (
          <div
            style={{
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6,
              padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#92400E",
            }}
          >
            Editing a category creates a new version. Existing submitted visit data is preserved and unaffected.
          </div>
        )}
        <Form form={catForm} layout="vertical" onFinish={saveCategory}>
          <Form.Item
            name="name"
            label="Category Name"
            rules={[{ required: true, message: "Category name is required" }, { max: 100, message: "Max 100 characters" }]}
          >
            <Input placeholder="e.g. Safety & Security" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Subcategory Modal ── */}
      <Modal
        open={subModalOpen}
        title={subModalMode === "add" ? "Add Parameter" : "Edit Parameter"}
        onCancel={() => setSubModalOpen(false)}
        onOk={saveSub}
        okText={subSaving ? "Saving…" : "Save"}
        confirmLoading={subSaving}
        width={520}
        destroyOnClose
      >
        {subModalMode === "edit" && (
          <div
            style={{
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6,
              padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#92400E",
            }}
          >
            Editing a parameter creates a new version. Existing submitted visit scores are preserved and unaffected.
          </div>
        )}
        <Form form={subForm} layout="vertical" onFinish={saveSub}>
          <Form.Item
            name="name"
            label="Measurable Point"
            rules={[{ required: true, message: "Measurable point is required" }]}
          >
            <Input placeholder="e.g. Fire extinguisher check" />
          </Form.Item>
          <Form.Item
            name="description"
            label="Check Points"
            rules={[{ required: true, message: "Check points are required" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="e.g. Verify expiry dates, check pressure gauges, confirm accessible placement"
            />
          </Form.Item>
          <Form.Item
            name="maxScore"
            label="Max Score (default: 5)"
            rules={[
              { required: true, message: "Max score is required" },
              { type: "number", min: 1, max: 10, message: "Must be between 1 and 10" },
            ]}
          >
            <InputNumber min={1} max={10} style={{ width: 120 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
