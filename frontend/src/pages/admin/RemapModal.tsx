import {
  Modal,
  Form,
  Select,
  Input,
  Alert,
  Button,
  notification,
  Space,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "../../api/client";

export type BranchLite = {
  id: string;
  branchCode: string;
  branchName: string;
  city: string | null;
  state: string | null;
  location: string | null;
};

type SfhApiRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
};

type CurrentMappingRow = {
  id: string;
  sfhId: string;
  branchId: string;
  branch: BranchLite;
  sfh: { user: { name: string } };
};

export type RemapModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedBranch?: BranchLite | null;
  currentMappings: CurrentMappingRow[];
};

function isValidationError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "errorFields" in e &&
    Array.isArray((e as { errorFields: unknown }).errorFields)
  );
}

export function RemapModal({
  open,
  onClose,
  onSuccess,
  preselectedBranch,
  currentMappings,
}: RemapModalProps) {
  const [form] = Form.useForm<{ branchId?: string; sfhId?: string; effectiveFrom?: string }>();
  const branchIdWatch = Form.useWatch("branchId", form);
  const sfhIdWatch = Form.useWatch("sfhId", form);

  const [sfhOptions, setSfhOptions] = useState<{ label: string; value: string }[]>([]);
  const [branchOptions, setBranchOptions] = useState<{ label: string; value: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedBranchId = preselectedBranch?.id ?? branchIdWatch;

  const currentForBranch = useMemo(() => {
    if (!resolvedBranchId) return null;
    return currentMappings.find((m) => m.branchId === resolvedBranchId) ?? null;
  }, [currentMappings, resolvedBranchId]);

  const sameSfh =
    Boolean(currentForBranch && sfhIdWatch && currentForBranch.sfhId === sfhIdWatch);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const rows = await apiFetch<SfhApiRow[]>("/sfhs?assignment=1");
        setSfhOptions(
          rows
            .filter((s) => s.isActive)
            .map((s) => ({ label: `${s.name} (${s.email})`, value: s.id }))
        );
      } catch {
        setSfhOptions([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setBranchOptions([]);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (preselectedBranch) {
      form.setFieldsValue({
        sfhId: undefined,
        effectiveFrom: today,
      });
    } else {
      form.setFieldsValue({ effectiveFrom: today });
    }
  }, [open, preselectedBranch, form]);

  function scheduleBranchSearch(q: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const query = q.trim();
      if (!query) {
        setBranchOptions([]);
        return;
      }
      try {
        const rows = await apiFetch<BranchLite[]>(`/branches?q=${encodeURIComponent(query)}`);
        setBranchOptions(rows.map((b) => ({ label: `${b.branchCode} — ${b.branchName}`, value: b.id })));
      } catch {
        setBranchOptions([]);
      }
    }, 280);
  }

  async function submitRemapRequest() {
    if (submitting || sameSfh) return;

    const fieldNames = preselectedBranch ?
      (["sfhId", "effectiveFrom"] as const)
    : (["branchId", "sfhId", "effectiveFrom"] as const);

    let validated: { branchId?: string; sfhId?: string; effectiveFrom?: string };
    try {
      validated = await form.validateFields([...fieldNames]);
    } catch (e: unknown) {
      if (isValidationError(e)) return;
      throw e;
    }

    const branchId = preselectedBranch?.id ?? validated.branchId;
    const sfhId = validated.sfhId;
    let effectiveFromRaw = validated.effectiveFrom;
    let effectiveFrom =
      effectiveFromRaw === undefined || effectiveFromRaw === null ?
        ""
      : String(effectiveFromRaw).trim();

    if (effectiveFrom.includes("/")) {
      const p = effectiveFrom.split("/");
      if (p.length === 3) effectiveFrom = `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
    }

    if (!branchId || !sfhId || !effectiveFrom) {
      notification.error({
        message: "Missing required fields",
        description: preselectedBranch ?
          "Choose an SFH and effective date."
        : "Choose a branch, SFH, and effective date.",
      });
      return;
    }

    if (currentForBranch && sfhId === currentForBranch.sfhId) {
      notification.warning({
        message: "Already assigned",
        description: "Pick a different SFH or cancel.",
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sfhId, branchId, effectiveFrom }),
      });
      notification.success({
        message: "Branch remapped",
        description: "The branch is now assigned to the selected SFH.",
      });
      form.resetFields();
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : "Failed to create mapping";
      notification.error({ message: "Could not create mapping", description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title={
        preselectedBranch ?
          `Remap: ${preselectedBranch.branchName}`
        : "Assign branch to SFH"
      }
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      footer={null}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {!preselectedBranch ?
          <Form.Item
            label="Branch"
            name="branchId"
            rules={[{ required: true, message: "Select a branch" }]}
          >
            <Select
              showSearch
              filterOption={false}
              placeholder="Search branch by name or code"
              options={branchOptions}
              onSearch={scheduleBranchSearch}
              notFoundContent={null}
            />
          </Form.Item>
        : null}

        {preselectedBranch ?
          <Form.Item label="Branch">
            <Input
              disabled
              value={`${preselectedBranch.branchCode} — ${preselectedBranch.branchName}`}
            />
          </Form.Item>
        : null}

        {currentForBranch ?
          <Alert
            type="info"
            showIcon
            message={`Currently assigned to: ${currentForBranch.sfh.user.name}`}
            description="Submitting will move this branch to the selected SFH immediately."
            style={{ marginBottom: 12 }}
          />
        : null}

        {sameSfh ?
          <Alert type="warning" showIcon message="Already assigned to this SFH" style={{ marginBottom: 12 }} />
        : null}

        <Form.Item label="Assign to SFH" name="sfhId" rules={[{ required: true, message: "Select an SFH" }]}>
          <Select showSearch placeholder="Select SFH" options={sfhOptions} optionFilterProp="label" />
        </Form.Item>

        <Form.Item
          label="Effective from"
          name="effectiveFrom"
          rules={[{ required: true, message: "Pick a date" }]}
          getValueFromEvent={(e) =>
            e?.target?.value !== undefined ? String(e.target.value) : e
          }
        >
          <Input type="date" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, marginTop: 16, textAlign: "right" }}>
          <Space>
            <Button
              onClick={() => {
                form.resetFields();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={sameSfh}
              onClick={() => void submitRemapRequest()}
            >
              Submit
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
