export type ConsolePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

function safeInteger(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function parseConsolePagination(input: {
  page?: string | number | null;
  pageSize?: string | number | null;
  defaultPageSize?: number;
  maxPageSize?: number;
}) {
  const defaultPageSize = Math.max(1, input.defaultPageSize || 25);
  const maxPageSize = Math.max(defaultPageSize, input.maxPageSize || 100);
  const page = Math.max(1, safeInteger(input.page, 1));
  const pageSize = Math.min(maxPageSize, Math.max(1, safeInteger(input.pageSize, defaultPageSize)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildConsolePagination(total: number, page: number, pageSize: number): ConsolePagination {
  const safeTotal = Math.max(0, total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  return {
    page: normalizedPage,
    pageSize,
    total: safeTotal,
    totalPages,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage: normalizedPage < totalPages,
  };
}

export function normalizeConsoleSearch(value: string | null | undefined, maxLength = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}
