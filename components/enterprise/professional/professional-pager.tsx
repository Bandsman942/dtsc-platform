"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProfessionalPagination } from "@/components/enterprise/professional/professional-erp-ui";

export function ProfessionalPager({ pagination, onPageChange, locale = "fr" }: { pagination: ProfessionalPagination; onPageChange: (page: number) => void; locale?: string }) {
  if (pagination.pageCount <= 1) return null;
  const fr = locale !== "en";
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4 text-sm text-dtsc-muted">
    <span>{fr ? `Page ${pagination.page} sur ${pagination.pageCount} · ${pagination.total} résultat(s)` : `Page ${pagination.page} of ${pagination.pageCount} · ${pagination.total} result(s)`}</span>
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => onPageChange(Math.max(1, pagination.page - 1))}><ChevronLeft className="h-4 w-4" />{fr ? "Précédent" : "Previous"}</Button>
      <Button type="button" variant="outline" size="sm" disabled={pagination.page >= pagination.pageCount} onClick={() => onPageChange(Math.min(pagination.pageCount, pagination.page + 1))}>{fr ? "Suivant" : "Next"}<ChevronRight className="h-4 w-4" /></Button>
    </div>
  </div>;
}
