"use client";

import { useEffect, useMemo, useState } from "react";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function useSmartList<T>({
  items,
  pageSize = 8,
  getSearchText,
}: {
  items: T[];
  pageSize?: number;
  getSearchText: (item: T) => string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filteredItems = useMemo(() => {
    const search = normalize(query);
    if (!search) {
      return items;
    }

    return items.filter((item) => normalize(getSearchText(item)).includes(search));
  }, [getSearchText, items, query]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
  }, [query, items.length]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [currentPage, filteredItems, pageSize]);

  return {
    query,
    setQuery,
    page: currentPage,
    setPage,
    pageCount,
    totalCount: items.length,
    filteredCount: filteredItems.length,
    paginatedItems,
  };
}
