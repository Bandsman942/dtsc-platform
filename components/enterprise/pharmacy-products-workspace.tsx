"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Archive, CircleHelp, ClipboardList, Eye, Pencil, Plus } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import {
  PHARMACY_ADMINISTRATION_ROUTES, PHARMACY_CURRENCIES, PHARMACY_PRODUCT_CATEGORIES, PHARMACY_PRODUCT_FORMS,
  PHARMACY_PRODUCT_LABELS, PHARMACY_PRODUCT_STATUSES, PHARMACY_PRODUCT_UNITS, PHARMACY_STORAGE_TYPES,
} from "@/lib/pharmacy-products";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type Product = Record<string, unknown> & { id: string; name: string; internalCode: string; category: string; pharmaceuticalForm: string; status: string; createdAt: string };
type ProductForm = Record<string, string | boolean>;

type TextField = "name" | "genericName" | "internalCode" | "barcode" | "manufacturer" | "brand" | "shortDescription" | "subcategory" | "dosage" | "packaging" | "saleWarningMessage" | "defaultLocation" | "shelf" | "storageNotes" | "deactivationReason" | "notes";
const numberFields = ["maxQuantityPerSale", "minStock", "maxStock", "safetyStock", "unitsPerPackage", "tempMin", "tempMax", "referencePurchasePrice", "referenceSalePrice", "targetMargin", "taxRate", "maxDiscountRate"] as const;
type BooleanField = "prescriptionRequired" | "pharmacistValidationRequired" | "controlledProduct" | "otcAllowed" | "genericSubstitutionAllowed" | "stockTrackingEnabled" | "lightSensitive" | "humiditySensitive" | "refrigerated" | "priceEditableAtSale" | "discountAllowed";

const FIELD_HELP: Record<string, { label: string; hint: string }> = {
  name: { label: "Nom commercial", hint: "Nom utilisé pour identifier le produit auprès des clients et dans les opérations." },
  genericName: { label: "DCI ou nom générique", hint: "Nom de la substance active ou appellation générique du produit." },
  internalCode: { label: "Code interne unique", hint: "Référence unique utilisée par la pharmacie pour retrouver ce produit." },
  barcode: { label: "Code-barres ou GTIN", hint: "Code imprimé sur l'emballage et utilisable avec un lecteur de code-barres." },
  manufacturer: { label: "Fabricant", hint: "Entreprise qui fabrique le produit." },
  brand: { label: "Marque", hint: "Marque commerciale affichée sur le produit." },
  category: { label: "Catégorie", hint: "Famille principale à laquelle appartient le produit." },
  subcategory: { label: "Sous-catégorie", hint: "Classement complémentaire pour affiner la recherche du produit." },
  pharmaceuticalForm: { label: "Forme pharmaceutique", hint: "Présentation du produit, par exemple comprimé, sirop ou pommade." },
  dosage: { label: "Dosage", hint: "Quantité de substance active indiquée sur le produit." },
  saleUnit: { label: "Unité de vente", hint: "Unité utilisée lors de la vente au client." },
  stockUnit: { label: "Unité de gestion du stock", hint: "Unité utilisée pour compter les quantités disponibles." },
  packaging: { label: "Conditionnement", hint: "Présentation de l'emballage, par exemple boîte de 20 comprimés." },
  administrationRoute: { label: "Voie d'administration", hint: "Manière dont le médicament est administré au patient." },
  prescriptionRequired: { label: "Ordonnance obligatoire", hint: "Activez cette option si le produit ne peut être délivré que sur ordonnance." },
  pharmacistValidationRequired: { label: "Validation du pharmacien obligatoire", hint: "Exige l'accord d'un pharmacien avant la délivrance." },
  controlledProduct: { label: "Produit soumis à contrôle renforcé", hint: "Signale un produit sensible nécessitant une surveillance particulière." },
  otcAllowed: { label: "Vente sans ordonnance autorisée", hint: "Autorise la vente directe sans présentation d'une ordonnance." },
  genericSubstitutionAllowed: { label: "Substitution par un générique autorisée", hint: "Autorise le remplacement par un médicament générique équivalent." },
  maxQuantityPerSale: { label: "Quantité maximale par vente", hint: "Nombre maximal d'unités pouvant être délivrées lors d'une vente." },
  saleWarningMessage: { label: "Avertissement lors de la vente", hint: "Message important affiché au personnel au moment de la vente." },
  stockTrackingEnabled: { label: "Suivre les quantités en stock", hint: "Active le suivi des entrées, sorties et quantités disponibles." },
  minStock: { label: "Seuil d'alerte de stock", hint: "Quantité à partir de laquelle une alerte de stock faible doit être affichée." },
  maxStock: { label: "Capacité maximale de stock", hint: "Quantité maximale recommandée pour ce produit." },
  safetyStock: { label: "Stock de sécurité", hint: "Réserve minimale à conserver pour limiter le risque de rupture." },
  unitsPerPackage: { label: "Nombre d'unités par emballage", hint: "Nombre d'unités contenues dans une boîte, un paquet ou un conditionnement." },
  defaultLocation: { label: "Emplacement par défaut", hint: "Zone habituelle de rangement du produit." },
  shelf: { label: "Rayon ou étagère", hint: "Repère précis permettant de retrouver rapidement le produit." },
  storageType: { label: "Conditions de conservation", hint: "Condition principale requise pour conserver correctement le produit." },
  tempMin: { label: "Température minimale (°C)", hint: "Température la plus basse recommandée pour conserver le produit." },
  tempMax: { label: "Température maximale (°C)", hint: "Température la plus haute recommandée pour conserver le produit." },
  lightSensitive: { label: "Protéger de la lumière", hint: "Indique que le produit doit être conservé à l'abri de la lumière." },
  humiditySensitive: { label: "Protéger de l'humidité", hint: "Indique que le produit doit être conservé dans un endroit sec." },
  refrigerated: { label: "Conserver au réfrigérateur", hint: "Indique que le produit doit rester dans la chaîne du froid." },
  storageNotes: { label: "Consignes de conservation", hint: "Précisions utiles pour le rangement et la conservation du produit." },
  referencePurchasePrice: { label: "Prix d'achat de référence", hint: "Prix indicatif payé par la pharmacie pour acheter le produit." },
  referenceSalePrice: { label: "Prix de vente de référence", hint: "Prix indicatif proposé lors de la vente du produit." },
  currency: { label: "Devise", hint: "Devise utilisée pour les prix de référence." },
  targetMargin: { label: "Marge souhaitée (%)", hint: "Pourcentage de marge visé entre le prix d'achat et le prix de vente." },
  taxRate: { label: "Taux de taxe (%)", hint: "Pourcentage de taxe applicable au produit." },
  priceEditableAtSale: { label: "Autoriser la modification du prix à la vente", hint: "Permet au personnel autorisé d'ajuster le prix pendant une vente." },
  discountAllowed: { label: "Autoriser les remises", hint: "Permet d'appliquer une réduction sur ce produit." },
  maxDiscountRate: { label: "Remise maximale autorisée (%)", hint: "Pourcentage maximal de réduction pouvant être accordé." },
  status: { label: "Statut du produit", hint: "Indique si le produit est actif, suspendu, inactif ou archivé." },
  deactivationReason: { label: "Motif de désactivation", hint: "Explique pourquoi le produit a été désactivé ou suspendu." },
  notes: { label: "Notes internes", hint: "Informations complémentaires réservées au personnel autorisé." },
  createdAt: { label: "Date de création", hint: "Date à laquelle la fiche produit a été créée." },
  updatedAt: { label: "Dernière modification", hint: "Date de la dernière mise à jour de la fiche produit." },
};

function emptyForm(): ProductForm {
  return {
    name: "", genericName: "", internalCode: "", barcode: "", manufacturer: "", brand: "", shortDescription: "", category: "MEDICINE",
    subcategory: "", pharmaceuticalForm: "TABLET", dosage: "", saleUnit: "UNIT", stockUnit: "UNIT", packaging: "", administrationRoute: "ORAL",
    prescriptionRequired: false, pharmacistValidationRequired: false, controlledProduct: false, otcAllowed: true, maxQuantityPerSale: "",
    genericSubstitutionAllowed: false, saleWarningMessage: "", stockTrackingEnabled: true, minStock: "0", maxStock: "", safetyStock: "",
    defaultLocation: "", shelf: "", unitsPerPackage: "", storageType: "AMBIENT", tempMin: "", tempMax: "", lightSensitive: false,
    humiditySensitive: false, refrigerated: false, storageNotes: "", referencePurchasePrice: "", referenceSalePrice: "", currency: "USD",
    targetMargin: "", taxRate: "", priceEditableAtSale: false, discountAllowed: true, maxDiscountRate: "", status: "ACTIVE",
    deactivationReason: "", notes: "",
  };
}

function productForm(product: Product): ProductForm {
  const form = emptyForm();
  for (const key of Object.keys(form)) {
    const value = product[key];
    if (typeof form[key] === "boolean") form[key] = value === true;
    else form[key] = value === null || value === undefined ? "" : String(value);
  }
  return form;
}

export function PharmacyProductsWorkspace({ organizationId }: { organizationId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [productFormFilter, setProductFormFilter] = useState("");
  const [flag, setFlag] = useState("");
  const [sort, setSort] = useState("name");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/products?pageSize=100`);
    const body = (await response.json().catch(() => null)) as { products?: Product[]; message?: string } | null;
    setProducts(body?.products || []);
    if (!response.ok) setMessage(body?.message || "Chargement des produits impossible.");
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => products.filter((product) =>
    (!category || product.category === category)
    && (!status || product.status === status)
    && (!productFormFilter || product.pharmaceuticalForm === productFormFilter)
    && (!flag || product[flag] === true)
  ).sort((left, right) => {
    const key = sort === "createdAt" ? "createdAt" : sort;
    return String(left[key] || "").localeCompare(String(right[key] || ""), "fr", { sensitivity: "base" });
  }), [category, flag, productFormFilter, products, sort, status]);
  const list = useSmartList({ items: filtered, pageSize: 12, getSearchText: useCallback((product: Product) => `${product.name} ${String(product.genericName || "")} ${product.internalCode} ${String(product.barcode || "")}`, []) });
  function change(key: string, value: string | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  function openCreate() { setEditing(null); setForm(emptyForm()); setFormOpen(true); setMessage(""); }
  function openEdit(product: Product) { setEditing(product); setForm(productForm(product)); setFormOpen(true); setMessage(""); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = editing ? `/api/enterprise/${organizationId}/pharmacy/products/${editing.id}` : `/api/enterprise/${organizationId}/pharmacy/products`;
    const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Produit enregistré." : body?.message || "Enregistrement impossible.");
    if (response.ok) { setFormOpen(false); await load(); }
  }
  async function archive(product: Product) {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/products/${product.id}`, { method: "DELETE" });
    setMessage(response.ok ? "Produit archivé." : "Archivage impossible.");
    if (response.ok) await load();
  }
  async function reactivate(product: Product) {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ACTIVE", deactivationReason: "" }) });
    setMessage(response.ok ? "Produit réactivé." : "Réactivation impossible.");
    if (response.ok) await load();
  }

  return <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black text-dtsc-ink">Produits & médicaments</h3><p className="text-sm text-dtsc-muted">Catalogue central des produits vendus, stockés ou dispensés par la pharmacie.</p></div><Button type="button" onClick={openCreate} className="rounded-xl bg-[#002b5b] text-white"><Plus className="h-4 w-4" />Nouveau produit</Button></div>
    <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-5"><Filter value={category} onChange={setCategory} options={PHARMACY_PRODUCT_CATEGORIES} label="Toutes les catégories" /><Filter value={productFormFilter} onChange={setProductFormFilter} options={PHARMACY_PRODUCT_FORMS} label="Toutes les formes" /><Filter value={status} onChange={setStatus} options={PHARMACY_PRODUCT_STATUSES} label="Tous les statuts" /><Filter value={flag} onChange={setFlag} options={["prescriptionRequired", "controlledProduct", "refrigerated"]} label="Toutes les règles" /><Filter value={sort} onChange={setSort} options={["name", "category", "status", "createdAt"]} label="Tri" /></div>
    <div className="mt-3"><ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} placeholder="Nom, DCI, code interne ou code-barres..." onPageChange={list.setPage} /></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.paginatedItems.map((product) => <article key={product.id} className="dtsc-glass-list-item rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase text-emerald-600">{label(product.status)} · {label(product.category)}</p><h4 className="mt-1 truncate font-black text-dtsc-ink">{product.name}</h4><p className="mt-1 text-xs text-dtsc-muted">{String(product.genericName || "Sans DCI")} · {product.internalCode}</p></div><ActionMenu label="Actions" items={actions(product, setDetail, openEdit, archive, reactivate)} /></div><div className="mt-3 flex flex-wrap gap-2"><Tag value={label(product.pharmaceuticalForm)} /><Tag value={String(product.dosage || "")} />{product.prescriptionRequired === true && <Tag value="Ordonnance" />}{product.controlledProduct === true && <Tag value="Contrôlé" />}{product.refrigerated === true && <Tag value="Réfrigéré" />}</div></article>)}
      {!loading && !list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun produit ne correspond aux critères. Créez le premier produit ou ajustez les filtres.</p>}
      {loading && <p className="text-sm font-bold text-dtsc-muted">Chargement du catalogue...</p>}
    </div>
    {message && <p className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
    <Dialog open={formOpen} title={editing ? `Modifier ${editing.name}` : "Nouveau produit"} description="Les informations sont isolées dans la pharmacie active." onClose={() => setFormOpen(false)} className="h-[94dvh] max-w-6xl"><form onSubmit={save} className="grid gap-4">
      <Section title="Identification"><Grid><Text form={form} field="name" labelText="Nom commercial" change={change} required /><Text form={form} field="genericName" labelText="DCI / nom générique" change={change} /><Text form={form} field="internalCode" labelText="Code interne unique" change={change} required /><Text form={form} field="barcode" labelText="Code-barres / GTIN" change={change} /><Text form={form} field="manufacturer" labelText="Fabricant" change={change} /><Text form={form} field="brand" labelText="Marque" change={change} /></Grid></Section>
      <Section title="Classification et présentation"><Grid><Choice field="category" labelText="Catégorie" form={form} options={PHARMACY_PRODUCT_CATEGORIES} change={change} /><Text form={form} field="subcategory" labelText="Sous-catégorie" change={change} /><Choice field="pharmaceuticalForm" labelText="Forme pharmaceutique" form={form} options={PHARMACY_PRODUCT_FORMS} change={change} /><Text form={form} field="dosage" labelText="Dosage" change={change} /><Choice field="saleUnit" labelText="Unité de vente" form={form} options={PHARMACY_PRODUCT_UNITS} change={change} /><Choice field="stockUnit" labelText="Unité de stock" form={form} options={PHARMACY_PRODUCT_UNITS} change={change} /><Text form={form} field="packaging" labelText="Conditionnement" change={change} /><Choice field="administrationRoute" labelText="Voie d'administration" form={form} options={PHARMACY_ADMINISTRATION_ROUTES} change={change} /></Grid></Section>
      <Section title="Dispensation"><Checks form={form} fields={["prescriptionRequired", "pharmacistValidationRequired", "controlledProduct", "otcAllowed", "genericSubstitutionAllowed"]} change={change} /><Grid><NumberField form={form} field="maxQuantityPerSale" labelText="Quantité maximale par vente" change={change} /><Text form={form} field="saleWarningMessage" labelText="Avertissement à la vente" change={change} /></Grid></Section>
      <Section title="Stock"><Checks form={form} fields={["stockTrackingEnabled"]} change={change} /><Grid>{numberFields.slice(1, 5).map((field) => <NumberField key={field} form={form} field={field} change={change} />)}<Text form={form} field="defaultLocation" labelText="Emplacement par défaut" change={change} /><Text form={form} field="shelf" labelText="Rayon" change={change} /></Grid></Section>
      <Section title="Conservation"><Choice field="storageType" labelText="Type de conservation" form={form} options={PHARMACY_STORAGE_TYPES} change={change} /><Grid><NumberField form={form} field="tempMin" labelText="Température minimale" change={change} /><NumberField form={form} field="tempMax" labelText="Température maximale" change={change} /><Text form={form} field="storageNotes" labelText="Consignes de conservation" change={change} /></Grid><Checks form={form} fields={["lightSensitive", "humiditySensitive", "refrigerated"]} change={change} /></Section>
      <Section title="Prix"><Grid>{numberFields.slice(7).map((field) => <NumberField key={field} form={form} field={field} change={change} />)}<Choice field="currency" labelText="Devise" form={form} options={PHARMACY_CURRENCIES} change={change} /></Grid><Checks form={form} fields={["priceEditableAtSale", "discountAllowed"]} change={change} /></Section>
      <Section title="Statut et notes"><Grid><Choice field="status" labelText="Statut" form={form} options={PHARMACY_PRODUCT_STATUSES} change={change} /><Text form={form} field="deactivationReason" labelText="Motif de désactivation" change={change} /><Text form={form} field="notes" labelText="Notes internes" change={change} /></Grid></Section>
      <Button className="w-fit rounded-xl bg-[#002b5b] text-white">Enregistrer le produit</Button>
    </form></Dialog>
    <Dialog open={Boolean(detail)} title={detail?.name || "Détail produit"} description="Fiche produit et futurs liens métier." onClose={() => setDetail(null)} className="max-w-5xl">{detail && <ProductDetail product={detail} />}</Dialog>
  </section>;
}

function actions(product: Product, detail: (value: Product) => void, edit: (value: Product) => void, archive: (value: Product) => Promise<void>, reactivate: (value: Product) => Promise<void>): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: "view", label: "Voir la fiche", icon: Eye, onSelect: () => detail(product) }, { key: "edit", label: "Modifier", icon: Pencil, onSelect: () => edit(product) }];
  items.push(product.status === "ARCHIVED" ? { key: "reactivate", label: "Réactiver", icon: ClipboardList, onSelect: () => void reactivate(product) } : { key: "archive", label: "Archiver", icon: Archive, destructive: true, onSelect: () => void archive(product) });
  return items;
}
function ProductDetail({ product }: { product: Product }) { const [activeTab, setActiveTab] = useState("Fiche"); const rows = Object.entries(product).filter(([key, value]) => !["id", "organizationId", "createdById", "updatedById"].includes(key) && value !== null && value !== "" && value !== false); return <div className="space-y-4"><div className="flex flex-wrap gap-2">{["Fiche", "Lots", "Mouvements", "Ventes", "Commandes", "Documents", "Alertes", "Historique"].map((tab) => <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`rounded-full border px-3 py-1 text-xs font-black ${activeTab === tab ? "border-emerald-400 bg-emerald-400/15 text-emerald-700" : "border-dtsc-border text-dtsc-muted"}`}>{tab}</button>)}</div>{activeTab === "Fiche" ? <div className="grid gap-3 md:grid-cols-2">{rows.map(([key, value]) => <div key={key} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-dtsc-muted" title={FIELD_HELP[key]?.hint}>{fieldLabel(key)}</p><p className="mt-1 text-sm font-bold text-dtsc-ink">{typeof value === "boolean" ? (value ? "Oui" : "Non") : label(value)}</p></div>)}</div> : <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucun élément lié dans {activeTab.toLowerCase()} pour ce produit.</p>}</div>; }
function fieldLabel(field: string) { return FIELD_HELP[field]?.label || "Information produit"; }
function label(value: unknown) { return PHARMACY_PRODUCT_LABELS[String(value)] || FIELD_HELP[String(value)]?.label || String(value); }
function Tag({ value }: { value: string }) { return value ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{value}</span> : null; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-600">{title}</h3>{children}</section>; }
function Grid({ children }: { children: ReactNode }) { return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>; }
function Field({ labelText, hint, children }: { labelText: string; hint?: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-black text-dtsc-ink"><span className="flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-dtsc-muted">{labelText}{hint && <span tabIndex={0} title={hint} aria-label={`${labelText} : ${hint}`} className="cursor-help"><CircleHelp className="h-3.5 w-3.5" /></span>}</span>{children}</label>; }
function Text({ form, field, labelText, change, required = false }: { form: ProductForm; field: TextField; labelText: string; change: (key: string, value: string | boolean) => void; required?: boolean }) { return <Field labelText={labelText} hint={FIELD_HELP[field]?.hint}><Input value={String(form[field])} title={FIELD_HELP[field]?.hint} onChange={(event) => change(field, event.target.value)} required={required} /></Field>; }
function NumberField({ form, field, labelText, change }: { form: ProductForm; field: typeof numberFields[number]; labelText?: string; change: (key: string, value: string | boolean) => void }) { const meta = FIELD_HELP[field]; return <Field labelText={labelText || meta.label} hint={meta.hint}><Input type="number" step="any" value={String(form[field])} title={meta.hint} onChange={(event) => change(field, event.target.value)} /></Field>; }
function Choice({ form, field, labelText, options, change }: { form: ProductForm; field: string; labelText: string; options: readonly string[]; change: (key: string, value: string | boolean) => void }) { const hint = FIELD_HELP[field]?.hint; return <Field labelText={labelText} hint={hint}><select value={String(form[field])} title={hint} onChange={(event) => change(field, event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3">{options.map((option) => <option key={option} value={option}>{label(option)}</option>)}</select></Field>; }
function Checks({ form, fields, change }: { form: ProductForm; fields: BooleanField[]; change: (key: string, value: string | boolean) => void }) { return <div className="flex flex-wrap gap-3">{fields.map((field) => { const meta = FIELD_HELP[field]; return <label key={field} title={meta.hint} className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={form[field] === true} onChange={(event) => change(field, event.target.checked)} /><span>{meta.label}</span><span tabIndex={0} title={meta.hint} aria-label={`${meta.label} : ${meta.hint}`} className="cursor-help text-dtsc-muted"><CircleHelp className="h-3.5 w-3.5" /></span></label>; })}</div>; }
function Filter({ value, onChange, options, label: placeholder }: { value: string; onChange: (value: string) => void; options: readonly string[]; label: string }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold"><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{label(option)}</option>)}</select>; }
