"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Boxes, Layers3, Pencil, Plus, Ruler, ShoppingBag } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Unit = { id: string; code: string; name: string; symbol: string | null; category: string; decimalScale: number; status: string };
type Category = { id: string; code: string; name: string; parentCategoryId: string | null; description: string | null; status: string };
type Price = { id: string; priceType: string; amount: string | number; currency: string; taxRate: string | number | null; taxIncluded: boolean; effectiveFrom: string; effectiveUntil: string | null; status: string };
type CatalogItem = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  description: string | null;
  itemType: "PRODUCT" | "SERVICE";
  indicativeSalePrice: string | number | null;
  indicativeCost: string | number | null;
  currency: string | null;
  taxable: boolean;
  taxCode: string | null;
  trackInventory: boolean;
  status: string;
  revision: number;
  category: Pick<Category, "id" | "code" | "name"> | null;
  unitOfMeasure: Pick<Unit, "id" | "code" | "name" | "symbol">;
  prices: Price[];
};

type CatalogExtra = { units: Unit[]; categories: Category[] };

export function EnterpriseCatalogWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogMode, setDialogMode] = useState<"ITEM" | "CATEGORY" | "UNIT" | null>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [edit, setEdit] = useState<CatalogItem | null>(null);
  const [message, setMessage] = useState("");
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    if (tab === "PRODUCT" || tab === "SERVICE") value.set("itemType", tab);
    return value;
  }, [page, search, tab]);
  const collection = useProfessionalCollection<CatalogItem, CatalogExtra>({ endpoint: `/api/enterprise/${organizationId}/catalog`, params, refreshKey });
  const units = collection.extra.units || [];
  const categories = collection.extra.categories || [];

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/catalog`, {
        name: String(form.get("name") || ""),
        sku: String(form.get("sku") || "") || null,
        description: String(form.get("description") || "") || null,
        itemType: String(form.get("itemType") || "PRODUCT"),
        categoryId: String(form.get("categoryId") || "") || null,
        unitOfMeasureId: String(form.get("unitOfMeasureId") || ""),
        indicativeSalePrice: form.get("indicativeSalePrice") ? Number(form.get("indicativeSalePrice")) : null,
        indicativeCost: form.get("indicativeCost") ? Number(form.get("indicativeCost")) : null,
        currency: String(form.get("currency") || "") || null,
        taxable: form.get("taxable") === "on",
        taxCode: String(form.get("taxCode") || "") || null,
        trackInventory: form.get("trackInventory") === "on",
        notes: String(form.get("notes") || "") || null,
      });
      setDialogMode(null); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
  }

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/catalog`, {
        id: edit.id,
        revision: edit.revision,
        name: String(form.get("name") || ""),
        sku: String(form.get("sku") || "") || null,
        description: String(form.get("description") || "") || null,
        itemType: String(form.get("itemType") || edit.itemType),
        categoryId: String(form.get("categoryId") || "") || null,
        unitOfMeasureId: String(form.get("unitOfMeasureId") || edit.unitOfMeasure.id),
        indicativeSalePrice: form.get("indicativeSalePrice") ? Number(form.get("indicativeSalePrice")) : null,
        indicativeCost: form.get("indicativeCost") ? Number(form.get("indicativeCost")) : null,
        currency: String(form.get("currency") || "") || null,
        taxable: form.get("taxable") === "on",
        taxCode: String(form.get("taxCode") || "") || null,
        trackInventory: form.get("trackInventory") === "on",
        status: String(form.get("status") || edit.status),
      });
      setEdit(null);
      setDetail((result.item as CatalogItem | undefined) || null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.updateFailed"));
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/catalog-categories`, { name: String(form.get("name") || ""), code: String(form.get("code") || "") || undefined, parentCategoryId: String(form.get("parentCategoryId") || "") || null, description: String(form.get("description") || "") || null, sortOrder: Number(form.get("sortOrder") || 0) });
      setDialogMode(null); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
  }

  async function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/units-of-measure`, { code: String(form.get("code") || ""), name: String(form.get("name") || ""), symbol: String(form.get("symbol") || "") || null, category: String(form.get("category") || "GENERAL"), decimalScale: Number(form.get("decimalScale") || 3) });
      setDialogMode(null); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
  }

  const filteredCategories = tab === "CATEGORY";
  const filteredUnits = tab === "UNIT";
  const countSuffix = locale === "en" ? (collection.pagination.total === 1 ? "" : "s") : (collection.pagination.total > 1 ? "s" : "");
  const itemTypeItems = ["PRODUCT", "SERVICE"].map((type) => ({ id: type, label: professionalErpEnumLabel(locale, "itemType", type) }));

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={t("catalog.eyebrow", { organization: organizationName })} title={t("catalog.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("catalog.count", { count: collection.pagination.total, suffix: countSuffix })} primaryAction={collection.canManage ? <Button onClick={() => setDialogMode("ITEM")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("catalog.newItem")}</Button> : undefined} secondaryActions={collection.canManage ? <><Button variant="outline" onClick={() => setDialogMode("CATEGORY")}><Layers3 className="h-4 w-4" />{t("catalog.category")}</Button><Button variant="outline" onClick={() => setDialogMode("UNIT")}><Ruler className="h-4 w-4" />{t("catalog.unit")}</Button></> : undefined} />
      <ModuleMetrics label={t("catalog.metrics")}><ModuleMetric label={t("catalog.activeProducts")} value={collection.metrics.products || 0} /><ModuleMetric label={t("catalog.activeServices")} value={collection.metrics.services || 0} /><ModuleMetric label={t("catalog.stockTracked")} value={collection.metrics.tracked || 0} /><ModuleMetric label={t("catalog.categories")} value={categories.length} /></ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("catalog.search")} />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} label={t("catalog.views")} items={[{ id: "ALL", label: t("catalog.all"), count: collection.pagination.total }, { id: "PRODUCT", label: t("catalog.products"), count: collection.metrics.products }, { id: "SERVICE", label: t("catalog.services"), count: collection.metrics.services }, { id: "CATEGORY", label: t("catalog.categories"), count: categories.length }, { id: "UNIT", label: t("catalog.units"), count: units.length }]} />} />
      <ModuleContent>
        <ModuleSection title={filteredCategories ? t("catalog.categories") : filteredUnits ? t("catalog.unitsOfMeasure") : t("catalog.operational")} description={t("catalog.scopeDescription")}>
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : filteredCategories ? (
            categories.length ? <BusinessList ariaLabel={t("catalog.categoriesAria")}>{categories.map((category) => <BusinessListItem key={category.id} title={category.name} status={<StatusBadge tone={category.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "status", category.status)}</StatusBadge>} meta={category.code} description={category.description || t("catalog.noCategoryDescription")} />)}</BusinessList> : <EmptyState title={t("catalog.noCategoryTitle")} description={t("catalog.noCategoryHelp")} />
          ) : filteredUnits ? (
            units.length ? <BusinessList ariaLabel={t("catalog.unitsAria")}>{units.map((unit) => { const precisionSuffix = locale === "en" ? (unit.decimalScale === 1 ? "" : "s") : (unit.decimalScale > 1 ? "s" : ""); return <BusinessListItem key={unit.id} title={`${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}`} status={<StatusBadge>{professionalErpEnumLabel(locale, "unitCategory", unit.category)}</StatusBadge>} meta={unit.code} description={t("catalog.precision", { count: unit.decimalScale, suffix: precisionSuffix })} />; })}</BusinessList> : <EmptyState title={t("catalog.noUnitTitle")} description={t("catalog.noUnitHelp")} />
          ) : collection.items.length ? <BusinessList ariaLabel={t("catalog.itemsAria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.name} leading={item.itemType === "PRODUCT" ? <ShoppingBag className="h-5 w-5 text-dtsc-blue" /> : <Boxes className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "itemType", item.itemType)}</StatusBadge>} meta={`${item.code}${item.sku ? ` · SKU ${item.sku}` : ""} · ${item.category?.name || t("catalog.noCategory")}`} description={`${professionalErpMoney(item.indicativeSalePrice, item.currency, locale)} · ${item.unitOfMeasure.name}${item.trackInventory ? ` · ${t("catalog.stockTracking")}` : ""}`} onOpen={() => setDetail(item)} openLabel={t("catalog.open", { name: item.name })} />)}</BusinessList> : <EmptyState title={t("catalog.emptyTitle")} description={t("catalog.emptyHelp")} action={collection.canManage ? <Button onClick={() => setDialogMode("ITEM")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("catalog.createItem")}</Button> : undefined} />}
          {!filteredCategories && !filteredUnits ? <div className="mt-4 flex items-center justify-between gap-3 text-sm text-dtsc-muted"><span>{t("common.pageOf", { page: collection.pagination.page, pageCount: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div> : null}
        </ModuleSection>
        <ModuleSection title={t("catalog.firstSetup")} description={t("catalog.firstSetupHelp")}><ProfessionalHelp moduleCode="CATALOG" /></ModuleSection>
      </ModuleContent>

      <Dialog open={dialogMode === "ITEM"} onClose={() => setDialogMode(null)} title={t("catalog.newItemTitle")} description={t("catalog.newItemDescription")} className="h-[94dvh] max-w-5xl">
        <form onSubmit={createItem} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title={t("catalog.generalInfo")}><Field label={t("catalog.name")}><Input name="name" required /></Field><Field label={t("catalog.type")}><NativeSelect name="itemType" defaultValue="PRODUCT" items={itemTypeItems} /></Field><Field label={t("catalog.sku")}><Input name="sku" /></Field><Field label={t("catalog.description")}><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection>
          <ProfessionalFormSection title={t("catalog.classification")}><Field label={t("catalog.category")}><NativeSelect name="categoryId" items={[{ id: "", label: t("catalog.noCategory") }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label={t("catalog.unitOfMeasure")}><NativeSelect name="unitOfMeasureId" required items={units.map((unit) => ({ id: unit.id, label: `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}` }))} /></Field></ProfessionalFormSection>
          <ProfessionalFormSection title={t("catalog.pricing")}><Field label={t("catalog.salePrice")}><Input name="indicativeSalePrice" type="number" min="0" step="0.01" /></Field><Field label={t("catalog.purchaseCost")}><Input name="indicativeCost" type="number" min="0" step="0.01" /></Field><Field label={t("catalog.currency")}><Input name="currency" defaultValue="USD" maxLength={3} /></Field><Field label={t("catalog.taxCode")}><Input name="taxCode" /></Field><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="taxable" />{t("catalog.taxable")}</label><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="trackInventory" />{t("catalog.trackInventory")}</label></ProfessionalFormSection>
          <ProfessionalFormSection title={t("catalog.notesAvailability")}><Field label={t("catalog.notes")}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection>
          <div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={!units.length} className="bg-dtsc-blue text-white">{t("common.save")}</Button></div>
        </form>
      </Dialog>

      <Dialog open={dialogMode === "CATEGORY"} onClose={() => setDialogMode(null)} title={t("catalog.newCategory")} className="h-[90dvh] max-w-3xl"><form onSubmit={createCategory} className="grid gap-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("catalog.classificationTitle")}><Field label={t("catalog.name")}><Input name="name" required /></Field><Field label={t("catalog.code")}><Input name="code" placeholder="SERVICES" /></Field><Field label={t("catalog.parentCategory")}><NativeSelect name="parentCategoryId" items={[{ id: "", label: t("common.none") }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label={t("catalog.order")}><Input name="sortOrder" type="number" min="0" defaultValue="0" /></Field><Field label={t("catalog.description")}><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" className="bg-dtsc-blue text-white">{t("catalog.create")}</Button></div></form></Dialog>
      <Dialog open={dialogMode === "UNIT"} onClose={() => setDialogMode(null)} title={t("catalog.newUnit")} className="h-[90dvh] max-w-3xl"><form onSubmit={createUnit} className="grid gap-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("catalog.unit")}><Field label={t("catalog.code")}><Input name="code" required placeholder="UNIT" /></Field><Field label={t("catalog.name")}><Input name="name" required placeholder={t("catalog.unit")} /></Field><Field label={t("catalog.symbol")}><Input name="symbol" /></Field><Field label={t("catalog.category")}><Input name="category" defaultValue="GENERAL" /></Field><Field label={t("catalog.decimals")}><Input name="decimalScale" type="number" min="0" max="6" defaultValue="3" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" className="bg-dtsc-blue text-white">{t("catalog.create")}</Button></div></form></Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name || t("catalog.detail")} description={detail ? `${detail.code} · ${professionalErpEnumLabel(locale, "itemType", detail.itemType)}` : undefined} className="h-[94dvh] max-w-5xl">{detail ? <div className="grid gap-6"><div className="grid gap-4 md:grid-cols-2"><Info title={t("catalog.category")} value={detail.category?.name || t("catalog.noCategory")} /><Info title={t("catalog.unit")} value={`${detail.unitOfMeasure.name}${detail.unitOfMeasure.symbol ? ` (${detail.unitOfMeasure.symbol})` : ""}`} /><Info title={t("catalog.salePriceDetail")} value={professionalErpMoney(detail.indicativeSalePrice, detail.currency, locale)} /><Info title={t("catalog.costDetail")} value={professionalErpMoney(detail.indicativeCost, detail.currency, locale)} /><Info title={t("catalog.tax")} value={detail.taxable ? `${t("catalog.taxableValue")}${detail.taxCode ? ` · ${detail.taxCode}` : ""}` : t("catalog.notTaxable")} /><Info title={t("catalog.availability")} value={detail.trackInventory ? t("catalog.stockActive") : t("catalog.noStock")} /></div><ModuleSection title={t("catalog.priceHistory")} count={detail.prices.length}>{detail.prices.length ? <BusinessList ariaLabel={t("catalog.priceHistoryAria")}>{detail.prices.map((price) => <BusinessListItem key={price.id} title={professionalErpEnumLabel(locale, "priceType", price.priceType)} status={<StatusBadge>{price.status === "ACTIVE" ? t("catalog.current") : t("catalog.history")}</StatusBadge>} meta={professionalErpMoney(price.amount, price.currency, locale)} description={`${t("catalog.effectiveFrom", { date: professionalErpDate(price.effectiveFrom, locale) })}${price.effectiveUntil ? ` · ${t("catalog.effectiveUntil", { date: professionalErpDate(price.effectiveUntil, locale) })}` : ""}`} />)}</BusinessList> : <EmptyState compact title={t("catalog.noHistory")} description={t("catalog.noHistoryHelp")} />}</ModuleSection><ModuleSection title={t("catalog.businessUse")}><div className="border-y border-dtsc-border py-4 text-sm text-dtsc-muted">{t("catalog.businessUseHelp")} <strong>{detail.code}</strong>.</div></ModuleSection>{collection.canManage ? <div className="flex justify-end"><Button variant="outline" onClick={() => setEdit(detail)}><Pencil className="h-4 w-4" />{t("catalog.editItem")}</Button></div> : null}</div> : null}</Dialog>
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? t("catalog.editNamed", { name: edit.name }) : t("catalog.editItem")} className="h-[94dvh] max-w-5xl">{edit ? <form onSubmit={updateItem} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("catalog.infoClassification")}><Field label={t("catalog.name")}><Input name="name" required defaultValue={edit.name} /></Field><Field label={t("catalog.type")}><NativeSelect name="itemType" defaultValue={edit.itemType} items={itemTypeItems} /></Field><Field label="SKU"><Input name="sku" defaultValue={edit.sku || ""} /></Field><Field label={t("catalog.category")}><NativeSelect name="categoryId" defaultValue={edit.category?.id || ""} items={[{ id: "", label: t("catalog.noCategory") }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label={t("catalog.unit")}><NativeSelect name="unitOfMeasureId" defaultValue={edit.unitOfMeasure.id} items={units.map((unit) => ({ id: unit.id, label: `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}` }))} /></Field><Field label={t("catalog.description")}><textarea name="description" defaultValue={edit.description || ""} rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("catalog.pricingTaxStatus")}><Field label={t("catalog.salePrice")}><Input name="indicativeSalePrice" type="number" min="0" step="0.01" defaultValue={edit.indicativeSalePrice == null ? "" : String(edit.indicativeSalePrice)} /></Field><Field label={t("catalog.purchaseCost")}><Input name="indicativeCost" type="number" min="0" step="0.01" defaultValue={edit.indicativeCost == null ? "" : String(edit.indicativeCost)} /></Field><Field label={t("catalog.currency")}><Input name="currency" maxLength={3} defaultValue={edit.currency || "USD"} /></Field><Field label={t("catalog.taxCode")}><Input name="taxCode" defaultValue={edit.taxCode || ""} /></Field><Field label={t("customers.status")}><NativeSelect name="status" defaultValue={edit.status} items={[{ id: "ACTIVE", label: professionalErpEnumLabel(locale, "status", "ACTIVE") }, { id: "INACTIVE", label: t("catalog.inactiveLogical") }]} /></Field><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="taxable" defaultChecked={edit.taxable} />{t("catalog.taxable")}</label><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="trackInventory" defaultChecked={edit.trackInventory} />{t("catalog.trackInventory")}</label></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button type="submit" className="bg-dtsc-blue text-white">{t("catalog.saveChanges")}</Button></div></form> : null}</Dialog>
    </ModuleWorkspace>
  );
}

function Info({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 text-sm font-bold text-dtsc-ink">{value}</p></div>; }
