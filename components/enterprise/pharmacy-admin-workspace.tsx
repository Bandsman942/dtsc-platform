"use client";

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, BadgeCheck, Boxes, ClipboardList, FileText, PackageCheck, Pill, Plus, ReceiptText, Settings2, Trash2 } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import type { EnterpriseDepartmentItem, EnterpriseMemberItem, EnterpriseSectorRecordItem } from "@/lib/enterprise/enterprise-admin-types";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { PharmacyProductsWorkspace } from "@/components/enterprise/pharmacy-products-workspace";
import { PharmacyBatchesWorkspace } from "@/components/enterprise/pharmacy-batches-workspace";
import { PharmacyStockWorkspace } from "@/components/enterprise/pharmacy-stock-workspace";
import { PharmacyReceiptsWorkspace } from "@/components/enterprise/pharmacy-receipts-workspace";
import { PharmacySalesWorkspace } from "@/components/enterprise/pharmacy-sales-workspace";
import { PharmacyPrescriptionsWorkspace } from "@/components/enterprise/pharmacy-prescriptions-workspace";

type ModuleCode =
  | "PHARMACY_DASHBOARD"
  | "MEDICINES_PRODUCTS"
  | "BATCH_EXPIRY"
  | "STOCK_INVENTORY"
  | "STOCK_RECEIPTS"
  | "SALES_DISPENSATION"
  | "PRESCRIPTIONS"
  | "SUPPLIERS_ORDERS"
  | "CASH_INVOICES_PAYMENTS"
  | "RETURNS_ADJUSTMENTS_LOSSES"
  | "ALERTS_EXPIRY_LOW_STOCK"
  | "QUALITY_PHARMACOVIGILANCE"
  | "PHARMACY_DOCUMENTS"
  | "PHARMACY_REPORTS"
  | "PHARMACY_SETTINGS";
type RecordModuleCode = Exclude<ModuleCode, "PHARMACY_DASHBOARD">;

const recordTypeByModule: Record<RecordModuleCode, string> = {
  MEDICINES_PRODUCTS: "PHARMACY_PRODUCT",
  BATCH_EXPIRY: "PHARMACY_BATCH",
  STOCK_INVENTORY: "PHARMACY_INVENTORY",
  STOCK_RECEIPTS: "PHARMACY_RECEIPT",
  SALES_DISPENSATION: "PHARMACY_SALE",
  PRESCRIPTIONS: "PHARMACY_PRESCRIPTION",
  SUPPLIERS_ORDERS: "PHARMACY_SUPPLIER_ORDER",
  CASH_INVOICES_PAYMENTS: "PHARMACY_CASH",
  RETURNS_ADJUSTMENTS_LOSSES: "PHARMACY_ADJUSTMENT",
  ALERTS_EXPIRY_LOW_STOCK: "PHARMACY_ALERT",
  QUALITY_PHARMACOVIGILANCE: "PHARMACY_QUALITY_INCIDENT",
  PHARMACY_DOCUMENTS: "PHARMACY_DOCUMENT",
  PHARMACY_REPORTS: "PHARMACY_REPORT",
  PHARMACY_SETTINGS: "PHARMACY_SETTING",
};

const submodules: Array<{ code: ModuleCode; label: string; description: string; icon: typeof Pill; createLabel?: string }> = [
  { code: "PHARMACY_DASHBOARD", label: "Tableau de bord pharmacie", description: "Produits, lots, stock, ventes, commandes, alertes et incidents.", icon: Activity },
  { code: "MEDICINES_PRODUCTS", label: "Produits & médicaments", description: "Référentiel produits, règles de dispensation, seuils et prix.", icon: Pill, createLabel: "Nouveau produit" },
  { code: "BATCH_EXPIRY", label: "Lots & péremptions", description: "Traçabilité des lots, quantités, stockage, quarantaine et rappels.", icon: PackageCheck, createLabel: "Nouveau lot" },
  { code: "STOCK_INVENTORY", label: "Stock & inventaire", description: "Sessions d'inventaire, quantités comptées, écarts et validation.", icon: Boxes, createLabel: "Nouvel inventaire" },
  { code: "STOCK_RECEIPTS", label: "Entrées stock / réceptions", description: "Réceptions fournisseurs avec augmentation de stock idempotente.", icon: Plus, createLabel: "Nouvelle réception" },
  { code: "SALES_DISPENSATION", label: "Sorties, ventes & dispensation", description: "Ventes liées aux lots disponibles avec impact stock contrôlé.", icon: ReceiptText, createLabel: "Nouvelle vente" },
  { code: "PRESCRIPTIONS", label: "Ordonnances / prescriptions", description: "Ordonnances reçues, validation pharmacien et liaison vente.", icon: ClipboardList, createLabel: "Nouvelle ordonnance" },
  { code: "SUPPLIERS_ORDERS", label: "Fournisseurs & commandes", description: "Fournisseurs, commandes, validation et suivi des réceptions.", icon: PackageCheck, createLabel: "Nouveau fournisseur / commande" },
  { code: "CASH_INVOICES_PAYMENTS", label: "Caisse, factures & paiements", description: "Sessions caisse, factures, paiements, clôtures et écarts.", icon: ReceiptText, createLabel: "Nouvel élément caisse" },
  { code: "RETURNS_ADJUSTMENTS_LOSSES", label: "Retours, ajustements & pertes", description: "Corrections de stock avec motif, validation et audit.", icon: Boxes, createLabel: "Nouvel ajustement" },
  { code: "ALERTS_EXPIRY_LOW_STOCK", label: "Alertes stock / péremption / rappel", description: "Alertes critiques, assignation, traitement et résolution.", icon: AlertTriangle, createLabel: "Nouvelle alerte" },
  { code: "QUALITY_PHARMACOVIGILANCE", label: "Incidents qualité & pharmacovigilance", description: "Incidents qualité, effets indésirables et actions immédiates.", icon: AlertTriangle, createLabel: "Nouvel incident" },
  { code: "PHARMACY_DOCUMENTS", label: "Documents & conformité", description: "Documents internes contrôlés et références de conformité.", icon: FileText, createLabel: "Nouveau document" },
  { code: "PHARMACY_REPORTS", label: "Rapports pharmacie", description: "Rapports stock, ventes, achats, pertes, péremptions et caisse.", icon: FileText, createLabel: "Nouveau rapport" },
  { code: "PHARMACY_SETTINGS", label: "Paramètres pharmacie", description: "Préfixes, devise, seuils, FEFO et règles de validation.", icon: Settings2, createLabel: "Nouveau paramètre" },
];

type FormState = {
  moduleCode: RecordModuleCode; recordType: string; title: string; summary: string; status: string; priority: string; assignedToUserId: string;
  productId: string; batchId: string; supplierId: string; purchaseOrderId: string; prescriptionId: string; departmentId: string; responsibleUserId: string;
  recordKind: string; internalCode: string; genericName: string; barcode: string; category: string; pharmaceuticalForm: string; dosage: string; unit: string;
  batchNumber: string; expiryDate: string; transactionDate: string; quantity: string; availableQuantity: string; minStock: string; maxStock: string;
  unitPrice: string; totalAmount: string; currency: string; location: string; paymentMethod: string; customerName: string; reason: string; notes: string;
  documentUrl: string; prescriptionRequired: boolean; controlledProduct: boolean; pharmacistValidationRequired: boolean;
};

function text(record: EnterpriseSectorRecordItem, key: string) {
  const value = record.payloadJson?.[key];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}
function bool(record: EnterpriseSectorRecordItem, key: string) {
  return record.payloadJson?.[key] === true;
}
function defaultForm(moduleCode: RecordModuleCode): FormState {
  return { moduleCode, recordType: recordTypeByModule[moduleCode], title: "", summary: "", status: moduleCode === "MEDICINES_PRODUCTS" || moduleCode === "BATCH_EXPIRY" ? "ACTIVE" : "DRAFT", priority: "NORMAL", assignedToUserId: "", productId: "", batchId: "", supplierId: "", purchaseOrderId: "", prescriptionId: "", departmentId: "", responsibleUserId: "", recordKind: "", internalCode: "", genericName: "", barcode: "", category: "", pharmaceuticalForm: "", dosage: "", unit: "unité", batchNumber: "", expiryDate: "", transactionDate: new Date().toISOString().slice(0, 10), quantity: "0", availableQuantity: "0", minStock: "0", maxStock: "", unitPrice: "0", totalAmount: "0", currency: "USD", location: "", paymentMethod: "", customerName: "", reason: "", notes: "", documentUrl: "", prescriptionRequired: false, controlledProduct: false, pharmacistValidationRequired: false };
}
function formFromRecord(record: EnterpriseSectorRecordItem): FormState {
  const base = defaultForm(record.moduleCode as RecordModuleCode);
  const next = { ...base, title: record.title, summary: record.summary || "", status: record.status, priority: record.priority, assignedToUserId: record.assignedTo?.id || "" };
  for (const key of Object.keys(base) as Array<keyof FormState>) {
    if (typeof base[key] === "string" && record.payloadJson?.[key] !== undefined && record.payloadJson?.[key] !== null) Object.assign(next, { [key]: text(record, key) });
  }
  next.prescriptionRequired = bool(record, "prescriptionRequired");
  next.controlledProduct = bool(record, "controlledProduct");
  next.pharmacistValidationRequired = bool(record, "pharmacistValidationRequired");
  return next;
}

export function PharmacyAdminWorkspace({ organizationId, records, members, departments, activeModuleCodes }: { organizationId: string; records: EnterpriseSectorRecordItem[]; members: EnterpriseMemberItem[]; departments: EnterpriseDepartmentItem[]; activeModuleCodes: Set<string> }) {
  const router = useRouter();
  const [activeCode, setActiveCode] = useState<ModuleCode>("PHARMACY_DASHBOARD");
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<EnterpriseSectorRecordItem | null>(null);
  const [editing, setEditing] = useState<EnterpriseSectorRecordItem | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultForm("MEDICINES_PRODUCTS"));
  const [message, setMessage] = useState("");
  const enabled = useMemo(() => submodules.filter((item) => item.code === "PHARMACY_DASHBOARD" || activeModuleCodes.has(item.code)), [activeModuleCodes]);
  const active = enabled.find((item) => item.code === activeCode) || enabled[0];
  const visible = useMemo(() => records.filter((record) => record.moduleCode === activeCode), [activeCode, records]);
  const products = useMemo(() => records.filter((record) => record.moduleCode === "MEDICINES_PRODUCTS" && record.status === "ACTIVE"), [records]);
  const batches = useMemo(() => records.filter((record) => record.moduleCode === "BATCH_EXPIRY" && !["EXPIRED", "RECALLED", "QUARANTINED", "DEPLETED"].includes(record.status)), [records]);
  const suppliers = useMemo(() => records.filter((record) => record.moduleCode === "SUPPLIERS_ORDERS" && text(record, "recordKind") === "SUPPLIER"), [records]);
  const orders = useMemo(() => records.filter((record) => record.moduleCode === "SUPPLIERS_ORDERS" && text(record, "recordKind") !== "SUPPLIER"), [records]);
  const prescriptions = useMemo(() => records.filter((record) => record.moduleCode === "PRESCRIPTIONS"), [records]);
  const list = useSmartList({ items: visible, pageSize: 8, getSearchText: useCallback((record: EnterpriseSectorRecordItem) => `${record.title} ${record.summary || ""} ${record.status} ${text(record, "internalCode")} ${text(record, "batchNumber")} ${text(record, "category")}`, []) });

  function change<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function openCreate(code: ModuleCode) { if (code === "PHARMACY_DASHBOARD") return; setEditing(null); setForm(defaultForm(code)); setFormOpen(true); setMessage(""); }
  function openEdit(record: EnterpriseSectorRecordItem) { setEditing(record); setForm(formFromRecord(record)); setFormOpen(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(editing ? `/api/enterprise/${organizationId}/pharmacy/${editing.id}` : `/api/enterprise/${organizationId}/pharmacy`, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Élément pharmacie enregistré." : body?.message || "Enregistrement impossible.");
    if (response.ok) { setFormOpen(false); router.refresh(); }
  }
  async function action(record: EnterpriseSectorRecordItem, actionName: string) {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Action pharmacie enregistrée." : body?.message || "Action impossible.");
    if (response.ok) router.refresh();
  }
  async function archive(record: EnterpriseSectorRecordItem) {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/${record.id}`, { method: "DELETE" });
    setMessage(response.ok ? "Élément archivé." : "Archivage impossible.");
    if (response.ok) router.refresh();
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex max-w-full gap-2 overflow-x-auto pb-2">
        {enabled.map((item) => <button key={item.code} type="button" onClick={() => setActiveCode(item.code)} className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${activeCode === item.code ? "border-emerald-300 bg-emerald-400/14 text-emerald-700" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink"}`}><span className="block max-w-56 truncate text-sm font-black">{item.label}</span><span className="mt-1 block max-w-56 truncate text-xs font-semibold text-dtsc-muted">{item.description}</span></button>)}
      </div>
      {activeCode === "PHARMACY_DASHBOARD" ? <Dashboard records={records} /> : activeCode === "MEDICINES_PRODUCTS" ? <PharmacyProductsWorkspace organizationId={organizationId} /> : activeCode === "BATCH_EXPIRY" ? <PharmacyBatchesWorkspace organizationId={organizationId} /> : activeCode === "STOCK_INVENTORY" ? <PharmacyStockWorkspace organizationId={organizationId} /> : activeCode === "STOCK_RECEIPTS" ? <PharmacyReceiptsWorkspace organizationId={organizationId} /> : activeCode === "SALES_DISPENSATION" ? <PharmacySalesWorkspace organizationId={organizationId} /> : activeCode === "PRESCRIPTIONS" ? <PharmacyPrescriptionsWorkspace organizationId={organizationId} /> : (
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black text-dtsc-ink">{active?.label}</h3><p className="text-sm text-dtsc-muted">{active?.description}</p></div><Button type="button" onClick={() => openCreate(activeCode)} className="rounded-xl bg-[#002b5b] text-white"><Plus className="h-4 w-4" />{active?.createLabel}</Button></div>
          <div className="mt-4"><ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} placeholder="Rechercher..." onPageChange={list.setPage} /></div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.paginatedItems.map((record) => <article key={record.id} className="dtsc-glass-list-item rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase text-emerald-600">{record.status} · {record.priority}</p><h4 className="mt-1 truncate font-black text-dtsc-ink">{record.title}</h4><p className="mt-1 line-clamp-2 text-xs text-dtsc-muted">{record.summary || text(record, "notes") || "Aucun résumé."}</p></div><ActionMenu label="Actions" items={recordActions(record, setDetails, openEdit, action, archive)} /></div><div className="mt-3 flex flex-wrap gap-2"><Tag value={text(record, "internalCode")} /><Tag value={text(record, "batchNumber")} /><Tag value={text(record, "availableQuantity") ? `${text(record, "availableQuantity")} ${text(record, "unit")}` : ""} /><Tag value={text(record, "expiryDate")} /></div></article>)}
            {!list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun élément enregistré dans ce sous-module.</p>}
          </div>
        </section>
      )}
      {message && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
      <Dialog open={formOpen} title={editing ? "Modifier l'élément pharmacie" : active?.createLabel || "Nouvel élément"} description="Formulaire métier persistant, isolé dans la pharmacie active." onClose={() => setFormOpen(false)} className="h-[94dvh] max-w-6xl"><form onSubmit={save} className="grid gap-4"><FormSection title="Identification"><div className="grid gap-3 md:grid-cols-2"><Field label="Titre"><Input value={form.title} onChange={(event) => change("title", event.target.value)} required /></Field><Field label="Statut"><Input value={form.status} onChange={(event) => change("status", event.target.value)} required /></Field><Field label="Résumé"><Input value={form.summary} onChange={(event) => change("summary", event.target.value)} /></Field><Select label="Responsable" value={form.assignedToUserId} onChange={(value) => change("assignedToUserId", value)} options={members.map((member) => [member.user.id, member.user.name])} /></div></FormSection><SpecificFields form={form} change={change} products={products} batches={batches} suppliers={suppliers} orders={orders} prescriptions={prescriptions} departments={departments} members={members} /><FormSection title="Notes et suivi"><div className="grid gap-3 md:grid-cols-2"><Field label="Motif / justification"><textarea value={form.reason} onChange={(event) => change("reason", event.target.value)} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><Field label="Notes internes"><textarea value={form.notes} onChange={(event) => change("notes", event.target.value)} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field></div></FormSection><Button className="w-fit rounded-xl bg-[#002b5b] text-white">Enregistrer</Button></form></Dialog>
      <Dialog open={Boolean(details)} title={details?.title || "Détail"} description="Données pharmacie confinées à l'entreprise active." onClose={() => setDetails(null)} className="max-w-4xl">{details && <Details record={details} />}</Dialog>
    </div>
  );
}

function Dashboard({ records }: { records: EnterpriseSectorRecordItem[] }) {
  const batches = records.filter((record) => record.moduleCode === "BATCH_EXPIRY");
  const today = new Date().toISOString().slice(0, 10);
  const near = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const metrics = [
    ["Produits actifs", records.filter((record) => record.moduleCode === "MEDICINES_PRODUCTS" && record.status === "ACTIVE").length],
    ["Lots actifs", batches.filter((record) => record.status === "ACTIVE").length],
    ["Stock faible", records.filter((record) => record.status === "LOW_STOCK").length],
    ["Ruptures", records.filter((record) => record.status === "OUT_OF_STOCK" || record.status === "DEPLETED").length],
    ["Lots expirés", batches.filter((record) => text(record, "expiryDate") && text(record, "expiryDate") < today).length],
    ["Péremptions proches", batches.filter((record) => text(record, "expiryDate") >= today && text(record, "expiryDate") <= near).length],
    ["Ventes du jour", records.filter((record) => record.moduleCode === "SALES_DISPENSATION" && text(record, "transactionDate") === today).length],
    ["Incidents ouverts", records.filter((record) => record.moduleCode === "QUALITY_PHARMACOVIGILANCE" && !["RESOLVED", "CLOSED", "ARCHIVED"].includes(record.status)).length],
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <article key={label} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase text-emerald-600">{label}</p><p className="mt-2 text-3xl font-black text-dtsc-ink">{value}</p></article>)}</div>;
}

function SpecificFields({ form, change, products, batches, suppliers, orders, prescriptions, departments, members }: { form: FormState; change: <K extends keyof FormState>(key: K, value: FormState[K]) => void; products: EnterpriseSectorRecordItem[]; batches: EnterpriseSectorRecordItem[]; suppliers: EnterpriseSectorRecordItem[]; orders: EnterpriseSectorRecordItem[]; prescriptions: EnterpriseSectorRecordItem[]; departments: EnterpriseDepartmentItem[]; members: EnterpriseMemberItem[] }) {
  const batchOptions = batches.filter((record) => !form.productId || text(record, "productId") === form.productId);
  return <FormSection title="Données métier"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {form.moduleCode !== "MEDICINES_PRODUCTS" && <RecordSelect label="Produit" value={form.productId} records={products} onChange={(value) => change("productId", value)} />}
    {["SALES_DISPENSATION", "STOCK_RECEIPTS", "RETURNS_ADJUSTMENTS_LOSSES", "ALERTS_EXPIRY_LOW_STOCK", "QUALITY_PHARMACOVIGILANCE", "PHARMACY_DOCUMENTS"].includes(form.moduleCode) && <RecordSelect label="Lot" value={form.batchId} records={batchOptions} onChange={(value) => change("batchId", value)} />}
    {["STOCK_RECEIPTS", "SUPPLIERS_ORDERS"].includes(form.moduleCode) && <RecordSelect label="Fournisseur" value={form.supplierId} records={suppliers} onChange={(value) => change("supplierId", value)} />}
    {form.moduleCode === "STOCK_RECEIPTS" && <RecordSelect label="Commande fournisseur" value={form.purchaseOrderId} records={orders} onChange={(value) => change("purchaseOrderId", value)} />}
    {form.moduleCode === "SALES_DISPENSATION" && <RecordSelect label="Ordonnance" value={form.prescriptionId} records={prescriptions} onChange={(value) => change("prescriptionId", value)} />}
    <Select label="Collaborateur responsable" value={form.responsibleUserId} onChange={(value) => change("responsibleUserId", value)} options={members.map((member) => [member.user.id, member.user.name])} />
    <Select label="Département / emplacement" value={form.departmentId} onChange={(value) => change("departmentId", value)} options={departments.map((department) => [department.id, department.labelFr])} />
    <Field label="Type / catégorie"><Input value={form.recordKind || form.category} onChange={(event) => change(form.moduleCode === "SUPPLIERS_ORDERS" ? "recordKind" : "category", event.target.value)} placeholder={form.moduleCode === "SUPPLIERS_ORDERS" ? "SUPPLIER ou PURCHASE_ORDER" : "Catégorie"} /></Field>
    {form.moduleCode === "MEDICINES_PRODUCTS" && <><Field label="Code interne unique"><Input value={form.internalCode} onChange={(event) => change("internalCode", event.target.value)} required /></Field><Field label="DCI / nom générique"><Input value={form.genericName} onChange={(event) => change("genericName", event.target.value)} /></Field><Field label="Code-barres / GTIN"><Input value={form.barcode} onChange={(event) => change("barcode", event.target.value)} /></Field><Field label="Forme pharmaceutique"><Input value={form.pharmaceuticalForm} onChange={(event) => change("pharmaceuticalForm", event.target.value)} /></Field><Field label="Dosage"><Input value={form.dosage} onChange={(event) => change("dosage", event.target.value)} /></Field></>}
    {form.moduleCode === "BATCH_EXPIRY" && <><Field label="Numéro de lot"><Input value={form.batchNumber} onChange={(event) => change("batchNumber", event.target.value)} required /></Field><Field label="Date de péremption"><Input type="date" value={form.expiryDate} onChange={(event) => change("expiryDate", event.target.value)} required /></Field></>}
    {["BATCH_EXPIRY", "STOCK_RECEIPTS", "SALES_DISPENSATION", "RETURNS_ADJUSTMENTS_LOSSES", "STOCK_INVENTORY"].includes(form.moduleCode) && <Field label="Quantité"><Input type="number" min="0" value={form.quantity} onChange={(event) => change("quantity", event.target.value)} /></Field>}
    {form.moduleCode === "BATCH_EXPIRY" && <Field label="Quantité disponible"><Input type="number" min="0" value={form.availableQuantity} onChange={(event) => change("availableQuantity", event.target.value)} /></Field>}
    {form.moduleCode === "MEDICINES_PRODUCTS" && <><Field label="Seuil minimal"><Input type="number" min="0" value={form.minStock} onChange={(event) => change("minStock", event.target.value)} /></Field><Field label="Seuil maximal"><Input type="number" min="0" value={form.maxStock} onChange={(event) => change("maxStock", event.target.value)} /></Field></>}
    <Field label="Unité"><Input value={form.unit} onChange={(event) => change("unit", event.target.value)} /></Field><Field label="Emplacement"><Input value={form.location} onChange={(event) => change("location", event.target.value)} /></Field>
    {["BATCH_EXPIRY", "STOCK_RECEIPTS", "SALES_DISPENSATION", "SUPPLIERS_ORDERS", "CASH_INVOICES_PAYMENTS"].includes(form.moduleCode) && <><Field label="Prix unitaire"><Input type="number" min="0" value={form.unitPrice} onChange={(event) => change("unitPrice", event.target.value)} /></Field><Field label="Montant total"><Input type="number" min="0" value={form.totalAmount} onChange={(event) => change("totalAmount", event.target.value)} /></Field><Field label="Devise"><Input value={form.currency} onChange={(event) => change("currency", event.target.value)} /></Field></>}
    {form.moduleCode === "SALES_DISPENSATION" && <><Field label="Client / patient"><Input value={form.customerName} onChange={(event) => change("customerName", event.target.value)} /></Field><Field label="Mode de paiement"><Input value={form.paymentMethod} onChange={(event) => change("paymentMethod", event.target.value)} /></Field></>}
    <Field label="Date"><Input type="date" value={form.transactionDate} onChange={(event) => change("transactionDate", event.target.value)} /></Field>
    {form.moduleCode === "MEDICINES_PRODUCTS" && <div className="grid gap-2"><Check label="Prescription obligatoire" checked={form.prescriptionRequired} onChange={(value) => change("prescriptionRequired", value)} /><Check label="Produit contrôlé / sensible" checked={form.controlledProduct} onChange={(value) => change("controlledProduct", value)} /><Check label="Validation pharmacien requise" checked={form.pharmacistValidationRequired} onChange={(value) => change("pharmacistValidationRequired", value)} /></div>}
  </div></FormSection>;
}

function recordActions(record: EnterpriseSectorRecordItem, details: (record: EnterpriseSectorRecordItem) => void, edit: (record: EnterpriseSectorRecordItem) => void, action: (record: EnterpriseSectorRecordItem, actionName: string) => Promise<void>, archive: (record: EnterpriseSectorRecordItem) => Promise<void>): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: "details", label: "Voir détail", icon: Pill, onSelect: () => details(record) }, { key: "edit", label: "Modifier", icon: ClipboardList, onSelect: () => edit(record) }];
  if (record.moduleCode === "SALES_DISPENSATION") items.push({ key: "pay", label: "Valider / payer", icon: BadgeCheck, onSelect: () => void action(record, "pay") }, { key: "cancel", label: "Annuler et restaurer le stock", icon: Trash2, destructive: true, onSelect: () => void action(record, "cancel") });
  if (record.moduleCode === "STOCK_RECEIPTS") items.push({ key: "receive", label: "Valider la réception", icon: BadgeCheck, onSelect: () => void action(record, "receive") });
  if (record.moduleCode === "BATCH_EXPIRY") items.push({ key: "quarantine", label: "Mettre en quarantaine", icon: AlertTriangle, onSelect: () => void action(record, "quarantine") }, { key: "recall", label: "Rappeler le lot", icon: AlertTriangle, destructive: true, onSelect: () => void action(record, "recall") });
  if (record.moduleCode === "RETURNS_ADJUSTMENTS_LOSSES") items.push({ key: "validate", label: "Valider l'ajustement", icon: BadgeCheck, onSelect: () => void action(record, "validate") });
  if (["ALERTS_EXPIRY_LOW_STOCK", "QUALITY_PHARMACOVIGILANCE"].includes(record.moduleCode)) items.push({ key: "resolve", label: "Marquer résolu", icon: BadgeCheck, onSelect: () => void action(record, "resolve") });
  items.push({ key: "archive", label: "Archiver", icon: Trash2, destructive: true, onSelect: () => void archive(record) });
  return items;
}

function Details({ record }: { record: EnterpriseSectorRecordItem }) { const rows = Object.entries(record.payloadJson || {}).filter(([, value]) => value !== null && value !== "" && value !== false); return <div className="grid gap-3 md:grid-cols-2">{rows.map(([key, value]) => <div key={key} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{key}</p><p className="mt-1 whitespace-pre-wrap text-sm font-bold text-dtsc-ink">{String(value)}</p></div>)}</div>; }
function Tag({ value }: { value: string }) { return value ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{value}</span> : null; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-black text-dtsc-ink"><span className="text-xs uppercase tracking-[0.14em] text-dtsc-muted">{label}</span>{children}</label>; }
function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-600">{title}</h3>{children}</section>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>; }
function RecordSelect({ label, value, records, onChange }: { label: string; value: string; records: EnterpriseSectorRecordItem[]; onChange: (value: string) => void }) { return <Select label={label} value={value} onChange={onChange} options={records.map((record) => [record.id, `${record.title} · ${record.status}`])} />; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
