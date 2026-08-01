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

function money(value: string | number | null, currency: string | null) {
  if (value == null) return "Non défini";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "USD" }).format(number) : `${value} ${currency || ""}`;
}

export function EnterpriseCatalogWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
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
      setMessage(error instanceof Error ? error.message : "Modification impossible.");
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/catalog-categories`, { name: String(form.get("name") || ""), code: String(form.get("code") || "") || undefined, parentCategoryId: String(form.get("parentCategoryId") || "") || null, description: String(form.get("description") || "") || null, sortOrder: Number(form.get("sortOrder") || 0) });
      setDialogMode(null); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
  }

  async function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/units-of-measure`, { code: String(form.get("code") || ""), name: String(form.get("name") || ""), symbol: String(form.get("symbol") || "") || null, category: String(form.get("category") || "GENERAL"), decimalScale: Number(form.get("decimalScale") || 3) });
      setDialogMode(null); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
  }

  const filteredCategories = tab === "CATEGORY";
  const filteredUnits = tab === "UNIT";
  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={`Catalogue commun · ${organizationName}`} title="Produits et services" description={definition.descriptionFr} count={`${collection.pagination.total} article${collection.pagination.total > 1 ? "s" : ""}`} primaryAction={collection.canManage ? <Button onClick={() => setDialogMode("ITEM")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Nouvel article</Button> : undefined} secondaryActions={collection.canManage ? <><Button variant="outline" onClick={() => setDialogMode("CATEGORY")}><Layers3 className="h-4 w-4" />Catégorie</Button><Button variant="outline" onClick={() => setDialogMode("UNIT")}><Ruler className="h-4 w-4" />Unité</Button></> : undefined} />
      <ModuleMetrics label="Indicateurs du catalogue"><ModuleMetric label="Produits actifs" value={collection.metrics.products || 0} /><ModuleMetric label="Services actifs" value={collection.metrics.services || 0} /><ModuleMetric label="Suivis en stock" value={collection.metrics.tracked || 0} /><ModuleMetric label="Catégories" value={categories.length} /></ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Nom, référence ou SKU…" />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} label="Vues du catalogue" items={[{ id: "ALL", label: "Tous", count: collection.pagination.total }, { id: "PRODUCT", label: "Produits", count: collection.metrics.products }, { id: "SERVICE", label: "Services", count: collection.metrics.services }, { id: "CATEGORY", label: "Catégories", count: categories.length }, { id: "UNIT", label: "Unités", count: units.length }]} />} />
      <ModuleContent>
        <ModuleSection title={filteredCategories ? "Catégories" : filteredUnits ? "Unités de mesure" : "Catalogue opérationnel"} description="Les données pharmaceutiques, lots, règles cliniques et autres attributs sectoriels restent dans leurs modules spécialisés.">
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : filteredCategories ? (
            categories.length ? <BusinessList ariaLabel="Catégories du catalogue">{categories.map((category) => <BusinessListItem key={category.id} title={category.name} status={<StatusBadge tone={category.status === "ACTIVE" ? "success" : "neutral"}>{category.status === "ACTIVE" ? "Active" : "Inactive"}</StatusBadge>} meta={category.code} description={category.description || "Catégorie sans description"} />)}</BusinessList> : <EmptyState title="Aucune catégorie" description="Créez une première catégorie pour structurer le catalogue." />
          ) : filteredUnits ? (
            units.length ? <BusinessList ariaLabel="Unités de mesure">{units.map((unit) => <BusinessListItem key={unit.id} title={`${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}`} status={<StatusBadge>{unit.category}</StatusBadge>} meta={unit.code} description={`Précision : ${unit.decimalScale} décimale${unit.decimalScale > 1 ? "s" : ""}`} />)}</BusinessList> : <EmptyState title="Aucune unité" description="Une unité est nécessaire avant de créer un produit ou un service." />
          ) : collection.items.length ? <BusinessList ariaLabel="Produits et services">{collection.items.map((item) => <BusinessListItem key={item.id} title={item.name} leading={item.itemType === "PRODUCT" ? <ShoppingBag className="h-5 w-5 text-dtsc-blue" /> : <Boxes className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{item.itemType === "PRODUCT" ? "Produit" : "Service"}</StatusBadge>} meta={`${item.code}${item.sku ? ` · SKU ${item.sku}` : ""} · ${item.category?.name || "Sans catégorie"}`} description={`${money(item.indicativeSalePrice, item.currency)} · ${item.unitOfMeasure.name}${item.trackInventory ? " · Suivi de stock" : ""}`} onOpen={() => setDetail(item)} openLabel={`Ouvrir ${item.name}`} />)}</BusinessList> : <EmptyState title="Catalogue vide" description="Créez une catégorie, une unité puis votre premier produit ou service." action={collection.canManage ? <Button onClick={() => setDialogMode("ITEM")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Créer un article</Button> : undefined} />}
          {!filteredCategories && !filteredUnits ? <div className="mt-4 flex items-center justify-between gap-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page} sur {collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Précédent</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>Suivant</Button></div></div> : null}
        </ModuleSection>
        <ModuleSection title="Première configuration" description="Créez une catégorie, définissez une unité puis ajoutez un produit ou service."><ProfessionalHelp moduleCode="CATALOG" /></ModuleSection>
      </ModuleContent>

      <Dialog open={dialogMode === "ITEM"} onClose={() => setDialogMode(null)} title="Nouveau produit ou service" description="La tarification de référence est historisée à compter de sa date de création." className="h-[94dvh] max-w-5xl">
        <form onSubmit={createItem} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title="1. Informations générales"><Field label="Nom"><Input name="name" required /></Field><Field label="Type"><NativeSelect name="itemType" defaultValue="PRODUCT" items={[{ id: "PRODUCT", label: "Produit" }, { id: "SERVICE", label: "Service" }]} /></Field><Field label="Référence fournisseur / SKU"><Input name="sku" /></Field><Field label="Description"><textarea name="description" rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection>
          <ProfessionalFormSection title="2. Classification"><Field label="Catégorie"><NativeSelect name="categoryId" items={[{ id: "", label: "Sans catégorie" }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label="Unité de mesure"><NativeSelect name="unitOfMeasureId" required items={units.map((unit) => ({ id: unit.id, label: `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}` }))} /></Field></ProfessionalFormSection>
          <ProfessionalFormSection title="3. Tarification"><Field label="Prix de vente"><Input name="indicativeSalePrice" type="number" min="0" step="0.01" /></Field><Field label="Coût d’achat"><Input name="indicativeCost" type="number" min="0" step="0.01" /></Field><Field label="Devise"><Input name="currency" defaultValue="USD" maxLength={3} /></Field><Field label="Code taxe"><Input name="taxCode" /></Field><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="taxable" />Article taxable</label><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="trackInventory" />Suivre en stock</label></ProfessionalFormSection>
          <ProfessionalFormSection title="4. Notes et disponibilité"><Field label="Notes"><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection>
          <div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Annuler</Button><Button type="submit" disabled={!units.length} className="bg-dtsc-blue text-white">Enregistrer</Button></div>
        </form>
      </Dialog>

      <Dialog open={dialogMode === "CATEGORY"} onClose={() => setDialogMode(null)} title="Nouvelle catégorie" className="h-[90dvh] max-w-3xl"><form onSubmit={createCategory} className="grid gap-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Classification"><Field label="Nom"><Input name="name" required /></Field><Field label="Code"><Input name="code" placeholder="SERVICES" /></Field><Field label="Catégorie parente"><NativeSelect name="parentCategoryId" items={[{ id: "", label: "Aucune" }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label="Ordre"><Input name="sortOrder" type="number" min="0" defaultValue="0" /></Field><Field label="Description"><textarea name="description" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Créer</Button></div></form></Dialog>
      <Dialog open={dialogMode === "UNIT"} onClose={() => setDialogMode(null)} title="Nouvelle unité de mesure" className="h-[90dvh] max-w-3xl"><form onSubmit={createUnit} className="grid gap-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Unité"><Field label="Code"><Input name="code" required placeholder="UNIT" /></Field><Field label="Nom"><Input name="name" required placeholder="Unité" /></Field><Field label="Symbole"><Input name="symbol" /></Field><Field label="Catégorie"><Input name="category" defaultValue="GENERAL" /></Field><Field label="Décimales"><Input name="decimalScale" type="number" min="0" max="6" defaultValue="3" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setDialogMode(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Créer</Button></div></form></Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name || "Détail du catalogue"} description={detail ? `${detail.code} · ${detail.itemType === "PRODUCT" ? "Produit" : "Service"}` : undefined} className="h-[94dvh] max-w-5xl">{detail ? <div className="grid gap-6"><div className="grid gap-4 md:grid-cols-2"><Info title="Catégorie" value={detail.category?.name || "Sans catégorie"} /><Info title="Unité" value={`${detail.unitOfMeasure.name}${detail.unitOfMeasure.symbol ? ` (${detail.unitOfMeasure.symbol})` : ""}`} /><Info title="Prix de vente" value={money(detail.indicativeSalePrice, detail.currency)} /><Info title="Coût indicatif" value={money(detail.indicativeCost, detail.currency)} /><Info title="Fiscalité" value={detail.taxable ? `Taxable${detail.taxCode ? ` · ${detail.taxCode}` : ""}` : "Non taxable"} /><Info title="Disponibilité" value={detail.trackInventory ? "Suivi de stock actif" : "Sans suivi de stock"} /></div><ModuleSection title="Historique des prix" count={detail.prices.length}>{detail.prices.length ? <BusinessList ariaLabel="Historique des prix">{detail.prices.map((price) => <BusinessListItem key={price.id} title={price.priceType === "SALE" ? "Prix de vente" : "Coût d’achat"} status={<StatusBadge>{price.status === "ACTIVE" ? "En vigueur" : "Historique"}</StatusBadge>} meta={money(price.amount, price.currency)} description={`Effet au ${new Date(price.effectiveFrom).toLocaleDateString("fr-FR")}${price.effectiveUntil ? ` · fin le ${new Date(price.effectiveUntil).toLocaleDateString("fr-FR")}` : ""}`} />)}</BusinessList> : <EmptyState compact title="Aucun historique" description="Le prochain changement tarifaire créera une nouvelle période de prix." />}</ModuleSection><ModuleSection title="Utilisation métier"><div className="border-y border-dtsc-border py-4 text-sm text-dtsc-muted">Les ventes, achats et mouvements de stock référencent l’article par son identifiant interne, tandis que l’utilisateur voit la référence <strong>{detail.code}</strong>.</div></ModuleSection>{collection.canManage ? <div className="flex justify-end"><Button variant="outline" onClick={() => setEdit(detail)}><Pencil className="h-4 w-4" />Modifier l’article</Button></div> : null}</div> : null}</Dialog>
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? `Modifier ${edit.name}` : "Modifier l’article"} className="h-[94dvh] max-w-5xl">{edit ? <form onSubmit={updateItem} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Informations et classification"><Field label="Nom"><Input name="name" required defaultValue={edit.name} /></Field><Field label="Type"><NativeSelect name="itemType" defaultValue={edit.itemType} items={[{ id: "PRODUCT", label: "Produit" }, { id: "SERVICE", label: "Service" }]} /></Field><Field label="SKU"><Input name="sku" defaultValue={edit.sku || ""} /></Field><Field label="Catégorie"><NativeSelect name="categoryId" defaultValue={edit.category?.id || ""} items={[{ id: "", label: "Sans catégorie" }, ...categories.map((category) => ({ id: category.id, label: category.name }))]} /></Field><Field label="Unité"><NativeSelect name="unitOfMeasureId" defaultValue={edit.unitOfMeasure.id} items={units.map((unit) => ({ id: unit.id, label: `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ""}` }))} /></Field><Field label="Description"><textarea name="description" defaultValue={edit.description || ""} rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection><ProfessionalFormSection title="Tarification, fiscalité et statut"><Field label="Prix de vente"><Input name="indicativeSalePrice" type="number" min="0" step="0.01" defaultValue={edit.indicativeSalePrice == null ? "" : String(edit.indicativeSalePrice)} /></Field><Field label="Coût d’achat"><Input name="indicativeCost" type="number" min="0" step="0.01" defaultValue={edit.indicativeCost == null ? "" : String(edit.indicativeCost)} /></Field><Field label="Devise"><Input name="currency" maxLength={3} defaultValue={edit.currency || "USD"} /></Field><Field label="Code taxe"><Input name="taxCode" defaultValue={edit.taxCode || ""} /></Field><Field label="Statut"><NativeSelect name="status" defaultValue={edit.status} items={[{ id: "ACTIVE", label: "Actif" }, { id: "INACTIVE", label: "Inactif / archivé logiquement" }]} /></Field><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="taxable" defaultChecked={edit.taxable} />Article taxable</label><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="trackInventory" defaultChecked={edit.trackInventory} />Suivre en stock</label></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Enregistrer les modifications</Button></div></form> : null}</Dialog>

    </ModuleWorkspace>
  );
}

function Info({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 text-sm font-bold text-dtsc-ink">{value}</p></div>; }
