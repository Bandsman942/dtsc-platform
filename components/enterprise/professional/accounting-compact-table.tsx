"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AccountingCompactColumn<T> = {
  key: string;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
};

export function AccountingCompactTable<T>({
  rows,
  columns,
  rowKey,
  emptyLabel,
  minWidth = "min-w-[900px]",
  onRowClick,
}: {
  rows: T[];
  columns: AccountingCompactColumn<T>[];
  rowKey: (row: T) => string;
  emptyLabel: string;
  minWidth?: string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div data-accounting-compact-table className="relative w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border border-dtsc-border bg-dtsc-surface shadow-sm">
      <table className={cn("w-full border-collapse text-[12px] leading-4 text-dtsc-ink sm:text-[13px]", minWidth)}>
        <thead className="sticky top-0 z-[2] bg-dtsc-page/95 backdrop-blur">
          <tr className="border-b border-dtsc-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-black uppercase tracking-[0.04em] text-dtsc-muted sm:px-3",
                  column.numeric && "text-right tabular-nums",
                  column.headerClassName,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => {
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={rowKey(row)}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={clickable ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick?.(row);
                  }
                } : undefined}
                className={cn(
                  "border-b border-dtsc-border/70 last:border-0 odd:bg-transparent even:bg-dtsc-soft/20",
                  clickable && "cursor-pointer outline-none transition hover:bg-cyan-500/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "max-w-[26rem] px-2.5 py-1.5 align-middle sm:px-3",
                      column.numeric && "text-right font-semibold tabular-nums",
                      column.cellClassName,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm font-semibold text-dtsc-muted">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
