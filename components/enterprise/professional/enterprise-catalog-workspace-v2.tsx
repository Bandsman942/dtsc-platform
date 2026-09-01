"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, Layers3, Pencil, Plus, Ruler, ShoppingBag } from "lucide-react";
import { currencyChoices, Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { COMMERCIAL_UNIT_CATEGORIES, commercialHotfixCopy } from "@/components/enterprise/professional/commercial-hotfix-copy";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { professionalErpDate, professionalErpEnumLabel, professionalErpMoney, professionalErpT, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Unit = { id: string; code: string; name: string; symbol: string | null; category: string; decimalScale: number; status: string };
type Category = { id: string; code: string; name: string; parentCategoryId: string | null; description: string | null; status: string };
type Price = { id: string; priceType: string; amount: string | number; currency: string; effectiveFrom: string; effectiveUntil: string | null; status: string };
type CatalogItem = { id: string; code: string; sku: string | null; name: string; description: string | null; itemType: "PRODUCT" | "SERVICE"; indicativeSalePrice: string | number | null; indicativeCost: string | number | null; currency: string | null; taxable: boolean; taxCode: string | null; trackInventory: boolean; status: string; revision: number; category: Pick<Category, "id" | "code" | "name"> | null; unitOfMeasure: Pick<Unit, "id" | "code" | "name" | "symbol">; prices: Price[] };
type CatalogExtra = { units: Unit[]; categories: Category[] };
type TaxCode = { id: string; code: string; nameFr: string; nameEn: string; category: string };
type Lookups = { currencies: string[]; taxCodes: TaxCode[] };

function unitCategoryLabel(key: string, hotfix: ReturnType<typeof commercialHotfixCopy>) {
  if (key === "QUANTITY") return hotfix.unitCategoryQuantity;
  if (key === "WEIGHT") return hotfix.unitCategoryWeight;
  if (key === "VOLUME") return hotfix.unitCategoryVolume;
  if (key === "LENGTH") return hotfix.unitCategoryLength;
  if (key === "TIME") return hotfix.unitCategoryTime;
  if (key === "SERVICE") return hotfix.unitCategoryService;
  return hotfix.unitCategoryOther;
}

export function EnterpriseCatalogWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const hotfix = commercialHotfixCopy(locale);
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogMode, setDialogMode] = useState<"ITEM" | "CATEGORY" | "UNIT" | null>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [edit, setEdit] = useState<CatalogItem | null>(null);
  const [lookups, setLookups] = useState<Lookups>({ currencies: [], taxCodes: [] });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useToastMessage(success, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=CATALOG`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null) as (Lookups & { message?: string; error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || t("common.selectorsUnavailable"));
      if (active) setLookups({ currencies: body.currencies || [], taxCodes: body.taxCodes || [] });
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("common.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (tab === "PRODUCT" || tab === "SERVICE") value.set("itemType", tab); return value; }, [page, search, tab]);
  const collection = useProfessionalCollection<CatalogItem, CatalogExtra>({ endpoint: `/api/enterprise/${organizationId}/catalog`, params, refreshKey });
  const units = collection.extra.units || [];
  const categories = collection.extra.categories || [];
  const currencies = lookups.currencies.length ? lookups.currencies.map((code) => ({ id: code, label: code })) : currencyChoices(locale);
  const taxChoices = [{ id: "", label: hotfix.noTaxCode }, ...lookups.taxCodes.map((tax) => ({ id: tax.code, label: `${tax.code} · ${locale === "en" ? tax.nameEn : tax.nameFr}` }))];
  const unitCategories = COMMERCIAL_UNIT_CATEGORIES.map((id) => ({ id, label: unitCategoryLabel(id, hotfix) }));
  const itemTypeItems = ["PRODUCT", "SERVICE"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "itemType", id) }));
  const canWrite = collection.canWrite || collection.canManage;

  function clearFeedback() { setMessage(""); setSuccess(""); }
  function openEdit(item: CatalogItem) { clearFeedback(); setDetail(null); setEdit(item); }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/catalog`, { name: String(form.get("name") || ""), sku: String(form.get("sku") || "") || null, description: String(form.get("description") || "") || null, itemType: String(form.get("itemType") || "PRODUCT"), categoryId: String(form.get("categoryId") || "") || null, unitOfMeasureId: String(form.get("unitOfMeasureId") || ""), indicativeSalePrice: form.get("indicativeSalePrice") ? Number(form.get("indicativeSalePrice")) : null, indicativeCost: form.get("indicativeCost") ? Number(form.get("indicativeCost")) : null, currency: String(form.get("currency") || "") || null, taxable: form.get("taxable") === "on", taxCode: String(form.get("taxCode") || "") || null, trackInventory: form.get("trackInventory") === "on", notes: String(form.get("notes") || "") || null });
      setDialogMode(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedCatalogItem);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); } finally { setBusy(false); }
  }

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return; clearFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/catalog`, { itemId: edit.id, revision: edit.revision, name: String(form.get("name") || ""), sku: String(form.get("sku") || "") || null, description: String(form.get("description") || "") || null, itemType: String(form.get("itemType") || edit.itemType), categoryId: String(form.get("categoryId") || "") || null, unitOfMeasureId: String(form.get("unitOfMeasureId") || edit.unitOfMeasure.id), indicativeSalePrice: form.get("indicativeSalePrice") ? Number(form.get("indicativeSalePrice")) : null, indicativeCost: form.get("indicativeCost") ? Number(form.get("indicativeCost")) : null, currency: String(form.get("currency") || "") || null, taxable: form.get("taxable") === "on", taxCode: String(form.get("taxCode") || "") || null, trackInventory: form.get("trackInventory") === "on", status: String(form.get("status") || edit.status) }, "PATCH");
      setEdit(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.updatedCatalogItem);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.updateFailed")); } finally { setBusy(false); }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try { await professionalMutation(`/api/enterprise/${organizationId}/catalog-categories`, { name: String(form.get("name") || ""), code: String(form.get("code") || "") || undefined, parentCategoryId: String(form.get("parentCategoryId") || "") || null, description: String(form.get("description") || "") || null, sortOrder: Number(form.get("sortOrder") || 0) }); setDialogMode(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedCategory); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); } finally { setBusy(false); }
  }

  async function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try { await professionalMutation(`/api/enterprise/${organizationId}/units-of-measure`, { code: String(form.get("code") || ""), name: String(form.get("name") || ""), symbol: String(form.get("symbol") || "") || null, category: String(form.get("category") || "QUANTITY"), decimalScale: Number(form.get("decimalScale") || 3) }); setDialogMode(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedUnit); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); } finally { setBusy(false); }
  }

  const categoriesView = tab === "CATEGORY";
  const unitsView = tab === "UNIT";
  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("catalog.eyebrow", { organization: organizationName })} title={t("catalog.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("catalog.count", { count: collection.pagination.total, suffix: collection.pagination.total === 1 ? "" : "s" })} primaryAction={canWrite ? <Button onClick={() => { clearFeedback(); setDialogMode("ITEM"); }}><Plus className="h-4 w-4" />{t("catalog.newItem")}</Button> : undefined} secondaryActions={canWrite ? <><Button variant="outline" onClick={() => { clearFeedback(); setDialogMode("CATEGORY"); }}><Layers3 className="h-4 w-4" />{t("catalog.category")}</Button><Button variant="outline" onClick={() => { clearFeedback(); setDialogMode("UNIT"); }}><Ruler className="h-4 w-4" />{t("catalog.unit")}</Button></> : undefined} />
    <ModuleMetrics label={t("catalog.metrics")}><ModuleMetric label={t("catalog.activeProducts")} value={collection.metrics.products || 0} /><ModuleMetric label={t("catalog.activeServices")} value={collection.metrics.services || 0} /><ModuleMetric label={t("catalog.stockTracked")} value={collection.metrics.tracked || 0} /><ModuleMetric label={t("catalog.categories")} value={categories.length} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("catalog.search")} />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} label={t("catalog.views")} items={[{ id: "ALL", label: t("catalog.all"), count: collection.pagination.total }, { id: "PRODUCT", label: t("catalog.products"), count: collection.metrics.products }, { id: "SERVICE", label: t("catalog.services"), count: collection.metrics.services }, { id: "CATEGORY", label: t("catalog.categories"), count: categories.length }, { id: "UNIT", label: t("catalog.units"), count: units.length }]} />} />
    <ModuleContent>
      {message && !dialogMode && !edit ? <ProfessionalError message={message} /> : null}
      <ModuleSection title={categoriesView ? t("catalog.categories") : unitsView ? t("catalog.unitsOfMeasure") : t("catalog.operational")} description={t("catalog.scopeDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : categoriesView ? (categories.length ? <BusinessList ariaLabel={t("catalog.categoriesAria")}>{categories.map((category) => <BusinessListItem key={category.id} title={category.name} status={<StatusBadge tone={category.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "status", category.status)}</StatusBadge>} meta={category.code} description={category.description || t("catalog.noCategoryDescription")} />)}</BusinessList> : <EmptyState title={t("catalog.noCategoryTitle")} description={t("catalog.noCategoryHelp")} />) : unitsView ? (units.length ? <BusinessList ariaLabel={t("catalog.unitsAria")}>{units.map((unit) => <BusinessListItem key={unit.id} title={`${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}`} status={<StatusBadge>{unitCategoryLabel(unit.category, hotfix)}</StatusBadge>} meta={unit.code} description={t("catalog.precision", { count: unit.decimalScale, suffix: unit.decimalScale === 1 ? "" : "s" })} />)}</BusinessList> : <EmptyState title={t("catalog.noUnitTitle")} description={t("catalog.noUnitHelp")} />) : collection.items.length ? <BusinessList ariaLabel={t("catalog.itemsAria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.name} leading={item.itemType === "PRODUCT" ? <ShoppingBag className="h-5 w-5 text-dtsc-blue" /> : <Boxes className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "itemType", item.itemType)}</StatusBadge>} meta={`${item.code}${item.sku ? ` · SKU ${item.sku}` : ""} · ${item.category?.name || t("catalog.noCategory")}`} description={`${professionalErpMoney(item.indicativeSalePrice, item.currency, locale)} · ${item.unitOfMeasure.name}${item.trackInventory ? ` · ${t("catalog.stockTracking")}` : ""}`} onOpen={() => setDetail(item)} openLabel={t("catalog.open", { name: item.name })} />)}</BusinessList> : <EmptyState title={t("catalog.emptyTitle")} description={t("catalog.emptyHelp")} />}
        {!categoriesView && !unitsView ? <div className="mt-4 flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div> : null}
      </ModuleSection><ProfessionalHelp moduleCode="CATALOG" />
    </ModuleContent>

    <CatalogItemDialog open={dialogMode === "ITEM"} title={t("catalog.newItemTitle")} description={t("catalog.newItemDescription")} formId="catalog-create-form" busy={busy} message={message} submitLabel={t("catalog.create")} cancelLabel={t("common.cancel")} onClose={() => setDialogMode(null)} onSubmit={createItem} t={t} hotfix={hotfix} locale={locale} itemTypeItems={itemTypeItems} categories={categories} units={units} currencies={currencies} taxChoices={taxChoices} />
    <CatalogItemDialog open={Boolean(edit)} title={edit ? t("catalog.editNamed", { name: edit.name }) : t("catalog.editItem")} formId="catalog-edit-form" busy={busy} message={message} submitLabel={t("catalog.saveChanges")} cancelLabel={t("common.cancel")} onClose={() => setEdit(null)} onSubmit={updateItem} t={t} hotfix={hotfix} locale={locale} itemTypeItems={itemTypeItems} categories={categories} units={units} currencies={currencies} taxChoices={taxChoices} item={edit} />

    <Dialog open={dialogMode === "CATEGORY"} onClose={() => { if (!busy) setDialogMode(null); }} title={t("catalog.newCategory")} className="max-w-2xl"><form onSubmit={createCategory} className="grid gap-4">{message ? <ProfessionalError message={message} /> : null}<Field label={t("catalog.name")} required><Input name="name" required /></Field><Field label={t("catalog.code")}><Input name="code" /></Field><Field label={t("catalog.parentCategory")}><NativeSelect name="parentCategoryId" items={categories.map((category) => ({ id: category.id, label: category.name }))} /></Field><Field label={t("catalog.description")}><textarea name="description" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><Field label={t("catalog.order")}><Input name="sortOrder" type="number" defaultValue="0" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={busy}>{busy ? t("common.saving") : t("catalog.create")}</Button></div></form></Dialog>
    <Dialog open={dialogMode === "UNIT"} onClose={() => { if (!busy) setDialogMode(null); }} title={t("catalog.newUnit")} className="max-w-2xl"><form onSubmit={createUnit} className="grid gap-4">{message ? <ProfessionalError message={message} /> : null}<Field label={t("catalog.code")} required><Input name="code" required /></Field><Field label={t("catalog.name")} required><Input name="name" required /></Field><Field label={t("catalog.symbol")}><Input name="symbol" /></Field><Field label={hotfix.selectUnitCategory} help={hotfix.unitCategoryHelp} required><NativeSelect name="category" defaultValue="QUANTITY" required items={unitCategories} /></Field><Field label={t("catalog.decimals")}><Input name="decimalScale" type="number" min="0" max="6" defaultValue="3" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDialogMode(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={busy}>{busy ? t("common.saving") : t("catalog.create")}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name || t("catalog.detail")} className="h-[92dvh] max-w-4xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{detail.code}</StatusBadge><StatusBadge tone={detail.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "status", detail.status)}</StatusBadge><StatusBadge>{professionalErpEnumLabel(locale, "itemType", detail.itemType)}</StatusBadge></div><dl className="grid gap-3 sm:grid-cols-2"><DetailBlock title={t("catalog.salePriceDetail")} value={professionalErpMoney(detail.indicativeSalePrice, detail.currency, locale)} /><DetailBlock title={t("catalog.costDetail")} value={professionalErpMoney(detail.indicativeCost, detail.currency, locale)} /><DetailBlock title={t("catalog.tax")} value={detail.taxable ? `${t("catalog.taxableValue")}${detail.taxCode ? ` · ${detail.taxCode}` : ""}` : t("catalog.notTaxable")} /><DetailBlock title={t("catalog.availability")} value={detail.trackInventory ? t("catalog.stockActive") : t("catalog.noStock")} /></dl><ModuleSection title={t("catalog.priceHistory")} count={detail.prices.length}>{detail.prices.length ? <BusinessList ariaLabel={t("catalog.priceHistoryAria")}>{detail.prices.map((price) => <BusinessListItem key={price.id} title={professionalErpMoney(price.amount, price.currency, locale)} status={<StatusBadge tone={price.status === "ACTIVE" ? "success" : "neutral"}>{price.status === "ACTIVE" ? t("catalog.current") : t("catalog.history")}</StatusBadge>} meta={professionalErpEnumLabel(locale, "priceType", price.priceType)} description={`${t("catalog.effectiveFrom", { date: professionalErpDate(price.effectiveFrom, locale) })}${price.effectiveUntil ? ` · ${t("catalog.effectiveUntil", { date: professionalErpDate(price.effectiveUntil, locale) })}` : ""}`} />)}</BusinessList> : <EmptyState compact title={t("catalog.noHistory")} description={t("catalog.noHistoryHelp")} />}</ModuleSection>{canWrite ? <div className="flex justify-end border-t border-dtsc-border pt-3"><Button onClick={() => openEdit(detail)}><Pencil className="h-4 w-4" />{t("catalog.editItem")}</Button></div> : null}</div> : null}</Dialog>
  </ModuleWorkspace>;
}

function CatalogItemDialog({ open, title, description, formId, busy, message, submitLabel, cancelLabel, onClose, onSubmit, t, hotfix, locale, itemTypeItems, categories, units, currencies, taxChoices, item }: { open: boolean; title: string; description?: string; formId: string; busy: boolean; message: string; submitLabel: string; cancelLabel: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; t: (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => string; hotfix: ReturnType<typeof commercialHotfixCopy>; locale: "fr" | "en"; itemTypeItems: Array<{ id: string; label: string }>; categories: Category[]; units: Unit[]; currencies: Array<{ id: string; label: string }>; taxChoices: Array<{ id: string; label: string }>; item?: CatalogItem | null }) {
  return <Dialog open={open} onClose={() => { if (!busy) onClose(); }} title={title} description={description} className="h-[94dvh] max-w-5xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={onClose}>{cancelLabel}</Button><Button type="submit" form={formId} disabled={busy}>{busy ? t("common.saving") : submitLabel}</Button></>}><form id={formId} onSubmit={onSubmit} className="grid gap-6 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("catalog.generalInfo")}><Field label={t("catalog.name")} required><Input name="name" required defaultValue={item?.name || ""} /></Field><Field label={t("catalog.type")} required><NativeSelect name="itemType" defaultValue={item?.itemType || "PRODUCT"} required items={itemTypeItems} /></Field><Field label={t("catalog.sku")}><Input name="sku" defaultValue={item?.sku || ""} /></Field><Field label={t("catalog.description")}><textarea name="description" rows={3} defaultValue={item?.description || ""} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("catalog.classification")}><Field label={t("catalog.category")}><NativeSelect name="categoryId" defaultValue={item?.category?.id || ""} items={[{ id: "", label: t("catalog.noCategory") }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label={t("catalog.unitOfMeasure")} required><NativeSelect name="unitOfMeasureId" defaultValue={item?.unitOfMeasure.id || ""} required items={units.map((unit) => ({ id: unit.id, label: `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}` }))} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("catalog.pricing")}><Field label={t("catalog.salePrice")}><Input name="indicativeSalePrice" type="number" min="0" step="0.01" defaultValue={item?.indicativeSalePrice != null ? String(item.indicativeSalePrice) : ""} /></Field><Field label={t("catalog.purchaseCost")}><Input name="indicativeCost" type="number" min="0" step="0.01" defaultValue={item?.indicativeCost != null ? String(item.indicativeCost) : ""} /></Field><Field label={t("catalog.currency")} help={hotfix.currencyConfigurationHelp}><NativeSelect name="currency" defaultValue={item?.currency || currencies[0]?.id || ""} items={currencies} /></Field><Field label={t("catalog.taxCode")} help={hotfix.taxConfigurationHelp}><NativeSelect name="taxCode" defaultValue={item?.taxCode || ""} items={taxChoices} /></Field><Field label={t("catalog.taxable")}><label className="flex min-h-11 items-center gap-2"><input name="taxable" type="checkbox" defaultChecked={item?.taxable || false} />{t("catalog.taxable")}</label></Field><Field label={t("catalog.trackInventory")}><label className="flex min-h-11 items-center gap-2"><input name="trackInventory" type="checkbox" defaultChecked={item?.trackInventory || false} />{t("catalog.trackInventory")}</label></Field>{item ? <Field label={t("customers.status")}><NativeSelect name="status" defaultValue={item.status} items={[{ id: "ACTIVE", label: professionalErpEnumLabel(locale, "status", "ACTIVE") }, { id: "INACTIVE", label: professionalErpEnumLabel(locale, "status", "INACTIVE") }]} /></Field> : null}</ProfessionalFormSection></form></Dialog>;
}

function DetailBlock({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><dt className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</dt><dd className="mt-1 text-sm font-bold text-dtsc-ink">{value}</dd></div>; }
