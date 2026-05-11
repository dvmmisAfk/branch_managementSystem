import { Button } from "antd";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { useCallback, useEffect, useMemo, useState } from "react";

export const TABLE_PAGE_SIZE_DEFAULT = 15;

const PRESET_PAGE_SIZES = [10, 15, 20, 50, 100];

function buildSizeChangerOptions(total: number): { value: number; label: string }[] {
  const opts = PRESET_PAGE_SIZES.filter((p) => p < total).map((p) => ({
    value: p,
    label: `${p} / page`,
  }));
  opts.push({ value: total, label: "View all" });
  return opts;
}

type UseTablePaginationOpts = {
  /** Hide the pager when `total` is at or below this (default: same as `defaultPageSize`). */
  hideThreshold?: number;
  defaultPageSize?: number;
};

/**
 * Controlled table pagination with presets + **View all** in the page-size dropdown.
 * Selecting “View all” sets internal full-list mode (pager hidden); use **Paged view** to restore.
 */
export function useTablePagination(total: number, opts?: UseTablePaginationOpts) {
  const defaultPs = opts?.defaultPageSize ?? TABLE_PAGE_SIZE_DEFAULT;
  const hideThreshold = opts?.hideThreshold ?? defaultPs;

  const [viewAll, setViewAll] = useState(false);
  const [pageSize, setPageSize] = useState(defaultPs);

  const resetPaging = useCallback(() => {
    setViewAll(false);
    setPageSize(defaultPs);
  }, [defaultPs]);

  useEffect(() => {
    if (total > 0 && pageSize > total) setPageSize(total);
  }, [total, pageSize]);

  const pagination = useMemo((): TablePaginationConfig | false => {
    if (total <= hideThreshold) return false;
    if (viewAll) return false;

    const effectivePageSize = Math.min(pageSize, total);

    return {
      total,
      pageSize: effectivePageSize,
      showSizeChanger: {
        options: buildSizeChangerOptions(total),
        showSearch: false,
      },
      onShowSizeChange: (_current: number, size: number) => {
        setPageSize(size);
        if (size >= total) setViewAll(true);
      },
      showTotal: (t, range) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>
            {range[0]}–{range[1]} of {t}
          </span>
        </span>
      ),
    };
  }, [total, viewAll, pageSize, hideThreshold]);

  return { pagination, viewAll, resetPaging };
}

type TableViewAllBarProps = {
  total: number;
  viewAll: boolean;
  onRestorePaged: () => void;
  threshold?: number;
};

/** Shown when the table is in full-list mode after choosing **View all**. */
export function TableViewAllBar({
  total,
  viewAll,
  onRestorePaged,
  threshold = TABLE_PAGE_SIZE_DEFAULT,
}: TableViewAllBarProps) {
  if (total <= threshold || !viewAll) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
      <Button type="link" size="small" onClick={onRestorePaged}>
        Paged view
      </Button>
    </div>
  );
}
