"use client";

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, BadgeCheck, Boxes, ClipboardList, FileText, PackageCheck, Pill, Plus, ReceiptText, Settings2, Trash2 } from "lucide-react";
import { PharmacyAlertsWorkspace } from "@/components/enterprise/pharmacy-alerts-workspace";
import { PharmacyBatchesWorkspace } from "@/components/enterprise/pharmacy-batches-workspace";
import { PharmacyCashWorkspace } from "@/components/enterprise/pharmacy-cash-workspace";
import { PharmacyDocumentsWorkspace } from "@/components/enterprise/pharmacy-documents-workspace";
import { PharmacyProductsWorkspace } from "@/components/enterprise/pharmacy-products-workspace";
import { PharmacyPrescriptionsWorkspace } from "@/components/enterprise/pharmacy-prescriptions-workspace";
import { PharmacyPurchasesWorkspace } from "@/components/enterprise/pharmacy-purchases-workspace";
import { PharmacyQualityWorkspace } from "@/components/enterprise/pharmacy-quality-workspace";
import { PharmacyReceiptsWorkspace } from "@/components/enterprise/pharmacy-receipts-workspace";
import { PharmacyReportsWorkspace } from "@/components/enterprise/pharmacy-reports-workspace";
import { PharmacyReturnLossWorkspace } from "@/components/enterprise/pharmacy-return-loss-workspace";
import { PharmacySalesWorkspace } from "@/components/enterprise/pharmacy-sales-workspace";
import { PharmacySettingsWorkspace } from "@/components/enterprise/pharmacy-settings-workspace";
import { PharmacyStockWorkspace } from "@/components/enterprise/pharmacy-stock-workspace";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import type { EnterpriseDepartmentItem, EnterpriseMemberItem, EnterpriseSectorRecordItem } from "@/lib/enterprise/enterprise-admin-types";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type ModuleCode = "PHARMACY_DASHBOARD" | "MEDICINES_PRODUCTS" | "BATCH_EXPIRY" | "STOCK_INVENTORY" | "STOCK_RECEIPTS" | "SALES_DISPENSATION" | "PRESCRIPTIONS" | "SUPPLIERS_ORDERS" | "CASH_INVOICES_PAYMENTS" | "RETURNS_ADJUSTMENTS_LOSSES" | "ALERTS_EXPIRY_LOW_STOCK" | "QUALITY_PHARMACOVIGILANCE" | "PHARMACY_DOCUMENTS" | "PHARMACY_REPORTS" | "PHARMACY_SETTINGS";
type RecordModuleCode = Exclude<ModuleCode, "PHARMACY_DASHBOARD">;

const recordTypeByModule: Record<RecordModuleCode, string> = {
  MEDICINES_PRODUCTS: "PHARMACY_PRODUCT", BATCH_EXPIRY: "PHARMACY_BATCH", STOCK_INVENTORY: "PHARMACY_INVENTORY", STOCK_RECEIPTS: "PHARMACY_RECEIPT", SALES_DISPENSATION: "PHARMACY_SALE", PRESCRIPTIONS: "PHARMACY_PRESCRIPTION", SUPPLIERS_ORDERS: "PHARMACY_SUPPLIER_ORDER", CASH_INVOICES_PAYMENTS: "PHARMACY_CASH", RETURNS_ADJUSTMENTS_LOSSES: "PHARMACY_ADJUSTMENT", ALERTS_EXPIRY_LOW_STOCK: "PHARMACY_ALERT", QUALITY_PHARMACOVIGILANCE: "PHARMACY_QUALITY_INCIDENT", PHARMACY_DOCUMENTS: "PHARMACY_DOCUMENT", PHARMACY_REPORTS: "PHARMACY_REPORT", PHARMACY_SETTINGS: "PHARMACY_SETTING",
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

function text(record: EnterpriseSectorRecordItem, key: string) { const value = record.payloadJson?.[key]; return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""; }
function bool(record: EnterpriseSectorRecordItem, key: string) { return record.payloadJson?.[key] === true; }
function defaultForm(moduleCode: RecordModuleCode): FormState { return { moduleCode, recordType: recordTypeByModule[moduleCode], title: "", summary: "", status: moduleCode === "MEDICINES_PRODUCTS" || moduleCode === "BATCH_EXPIRY" ? "ACTIVE" : "DRAFT", priority: "NORMAL", assignedToUserId: "", productId: "", batchId: "", supplierId: "", purchaseOrderId: "", prescriptionId: "", departmentId: "", responsibleUserId: "", recordKind: "", internalCode: "", genericName: "", barcode: "", category: "", pharmaceuticalForm: "", dosage: "", unit: "unité", batchNumber: "", expiryDate: "", transactionDate: new Date().toISOString().slice(0, 10), quantity: "0", availableQuantity: "0", minStock: "0", maxStock: "", unitPrice: "0", totalAmount: "0", currency: "USD", location: "", paymentMethod: "", customerName: "", reason: "", notes: "", documentUrl: "", prescriptionRequired: false, controlledProduct: false, pharmacistValidationRequired: false }; }
function formFromRecord(record: EnterpriseSectorRecordItem): FormState { const base = defaultForm(record.moduleCode as RecordModuleCode); const next = { ...base, title: record.title, summary: record.summary || "", status: record.status, priority: record.priority, assignedToUserId: record.assignedTo?.id || "" }; for (const key of Object.keys(base) as Array<keyof FormState>) { if (typeof base[key] === "string" && record.payloadJson?.[key] !== undefined && record.payloadJson?.[key] !== null) Object.assign(next, { [key]: text(record, key) }); } next.prescriptionRequired = bool(record, "prescriptionRequired"); next.controlledProduct = bool(record, "controlledProduct"); next.pharmacistValidationRequired = bool(record, "pharmacistValidationRequired"); return next; }

export function PharmacyAdminWorkspace({ organizationId, records, members, departments, activeModuleCodes }: { organizationId: string; records: EnterpriseSectorRecordItem[]; members: EnterpriseMemberItem[]; departments: EnterpriseDepartmentItem[]; activeModuleCodes: Set<string> }) {
  const router = useRouter();
  const [activeCode, setActiveCode] = useState<ModuleCode>("PHARMACY_DASHBOARD");
  const [formOpen, setFormOpen] = useState(false);
  const [details, setDetails] = useState<EnterpriseSectorRecordItem | null>(null);
  const [editing, setEditing] = useState<EnterpriseSectorRecordItem | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultForm("MEDICINES_PRODUCTS"));
  const [message, setMessage] = useState("");
  useToastMessage(message);
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
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const response = await fetch(editing ? `/api/enterprise/${organizationId}/pharmacy/${editing.id}` : `/api/enterprise/${organizationId}/pharmacy`, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const body = (await response.json().catch(() => null)) as { message?: string } | null; setMessage(response.ok ? "Élément pharmacie enregistré." : body?.message || "Enregistrement impossible."); if (response.ok) { setFormOpen(false); router.refresh(); } }
  async function action(record: EnterpriseSectorRecordItem, actionName: string) { const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) }); const body = (await response.json().catch(() => null)) as { message?: string } | null; setMessage(response.ok ? "Action pharmacie enregistrée." : body?.message || "Action impossible."); if (response.ok) router.refresh(); }
  async function archive(record: EnterpriseSectorRecordItem) { const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/${record.id}`, { method: "DELETE" }); setMessage(response.ok ? "Élément archivé." : "Archivage impossible."); if (response.ok) router.refresh(); }

  const canGenericCreate = activeCode !== "PHARMACY_DASHBOARD" && !["MEDICINES_PRODUCTS", "BATCH_EXPIRY", "STOCK_INVENTORY", "STOCK_RECEIPTS", "SALES_DISPENSATION", "PRESCRIPTIONS", "SUPPLIERS_ORDERS", "CASH_INVOICES_PAYMENTS", "RETURNS_ADJUSTMENTS_LOSSES", "ALERTS_EXPIRY_LOW_STOCK", "QUALITY_PHARMACOVIGILANCE", "PHARMACY_DOCUMENTS", "PHARMACY_REPORTS", "PHARMACY_SETTINGS"].includes(activeCode);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Secteur pharmacie"
        title="Pilotage pharmacie"
        count={`${records.length} élément${records.length > 1 ? "s" : ""}`}
        description="Accédez aux produits, lots, stocks, réceptions, ventes, prescriptions, achats, caisse, qualité, documents et paramètres sans empiler des cartes de navigation."
        primaryAction={canGenericCreate ? <Button type="button" onClick={() => openCreate(activeCode)} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{active?.createLabel || "Nouveau"}</Button> : undefined}
      />

      <ModuleSection title="Sous-modules" description={active?.description} count={`${enabled.length}`}>
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto border-y border-dtsc-border px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Sous-modules pharmacie">
          {enabled.map((item) => {
            const Icon = item.icon;
            const count = item.code === "PHARMACY_DASHBOARD" ? records.length : records.filter((record) => record.moduleCode === item.code).length;
            const selected = activeCode === item.code;
            return (
              <button key={item.code} type="button" role="tab" aria-selected={selected} onClick={() => setActiveCode(item.code)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${selected ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink"}`}>
                <Icon className="h-4 w-4" /><span>{item.label}</span><span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </ModuleSection>

      <ModuleContent>
        {activeCode === "PHARMACY_DASHBOARD" ? <Dashboard records={records} /> : activeCode === "MEDICINES_PRODUCTS" ? <PharmacyProductsWorkspace organizationId={organizationId} /> : activeCode === "BATCH_EXPIRY" ? <PharmacyBatchesWorkspace organizationId={organizationId} /> : activeCode === "STOCK_INVENTORY" ? <PharmacyStockWorkspace organizationId={organizationId} /> : activeCode === "STOCK_RECEIPTS" ? <PharmacyReceiptsWorkspace organizationId={organizationId} /> : activeCode === "SALES_DISPENSATION" ? <PharmacySalesWorkspace organizationId={organizationId} /> : activeCode === "PRESCRIPTIONS" ? <PharmacyPrescriptionsWorkspace organizationId={organizationId} /> : activeCode === "SUPPLIERS_ORDERS" ? <PharmacyPurchasesWorkspace organizationId={organizationId} /> : activeCode === "CASH_INVOICES_PAYMENTS" ? <PharmacyCashWorkspace organizationId={organizationId} /> : activeCode === "RETURNS_ADJUSTMENTS_LOSSES" ? <PharmacyReturnLossWorkspace organizationId={organizationId} /> : activeCode === "ALERTS_EXPIRY_LOW_STOCK" ? <PharmacyAlertsWorkspace organizationId={organizationId} /> : activeCode === "QUALITY_PHARMACOVIGILANCE" ? <PharmacyQualityWorkspace organizationId={organizationId} /> : activeCode === "PHARMACY_DOCUMENTS" ? <PharmacyDocumentsWorkspace organizationId={organizationId} /> : activeCode === "PHARMACY_REPORTS" ? <PharmacyReportsWorkspace organizationId={organizationId} /> : activeCode === "PHARMACY_SETTINGS" ? <PharmacySettingsWorkspace organizationId={organizationId} /> : (
          <ModuleSection title={active?.label || "Sous-module"} description={active?.description} count={`${list.filteredCount}/${visible.length}`} action={<Button type="button" onClick={() => openCreate(activeCode)} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{active?.createLabel}</Button>}>
            <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} placeholder="Rechercher..." onPageChange={list.setPage} />
            {list.paginatedItems.length ? (
              <BusinessList ariaLabel={active?.label || "Éléments pharmacie"}>
                {list.paginatedItems.map((record) => (
                  <BusinessListItem
                    key={record.id}
                    title={record.title}
                    status={<StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge>}
                    meta={[record.priority, text(record, "internalCode"), text(record, "batchNumber"), text(record, "availableQuantity") ? `${text(record, "availableQuantity")} ${text(record, "unit")}` : "", text(record, "expiryDate")].filter(Boolean).join(" · ")}
                    description={record.summary || text(record, "notes") || "Aucun résumé."}
                    onOpen={() => setDetails(record)}
                    openLabel={`Ouvrir ${record.title}`}
                    actions={<ContextActions label={`Actions pour ${record.title}`} actions={recordActions(record, setDetails, openEdit, action, archive)} />}
                  />
                ))}
              </BusinessList>
            ) : <EmptyState compact title={visible.length ? "Aucun résultat" : "Aucun contenu"} description={visible.length ? "Aucun élément ne correspond à cette recherche." : "Aucun élément enregistré dans ce sous-module."} />}
          </ModuleSection>
        )}
      </ModuleContent>

      <Dialog open={formOpen} title={editing ? "Modifier l'élément pharmacie" : active?.createLabel || "Nouvel élément"} description="Formulaire métier persistant, isolé dans la pharmacie active." onClose={() => setFormOpen(false)} className="h-[94dvh] max-w-6xl">
        <form onSubmit={save} className="grid gap-4">
          <FormSection title="Identification"><div className="grid gap-3 md:grid-cols-2"><Field label="Titre"><Input value={form.title} onChange={(event) => change("title", event.target.value)} required /></Field><Field label="Statut"><Input value={form.status} onChange={(event) => change("status", event.target.value)} required /></Field><Field label="Résumé"><Input value={form.summary} onChange={(event) => change("summary", event.target.value)} /></Field><Select label="Responsable" value={form.assignedToUserId} onChange={(value) => change("assignedToUserId", value)} options={members.map((member) => [member.user.id, member.user.name])} /></div></FormSection>
          <SpecificFields form={form} change={change} products={products} batches={batches} suppliers={suppliers} orders={orders} prescriptions={prescriptions} departments={departments} members={members} />
          <FormSection title="Notes et suivi"><div className="grid gap-3 md:grid-cols-2"><Field label="Motif / justification"><textarea value={form.reason} onChange={(event) => change("reason", event.target.value)} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><Field label="Notes internes"><textarea value={form.notes} onChange={(event) => change("notes", event.target.value)} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field></div></FormSection>
          <Button className="w-fit rounded-xl bg-dtsc-blue text-white">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog open={Boolean(details)} title={details?.title || "Détail"} description="Données pharmacie confinées à l'entreprise active." onClose={() => setDetails(null)} className="max-w-4xl">{details && <Details record={details} />}</Dialog>
    </ModuleWorkspace>
  );
}

function Dashboard({ records }: { records: EnterpriseSectorRecordItem[] }) {
  const batches = records.filter((record) => record.moduleCode === "BATCH_EXPIRY");
  const today = new Date().toISOString().slice(0, 10);
  const near = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const metrics = [
    ["Produits actifs", records.filter((record) => record.moduleCode === "MEDICINES_PRODUCTS" && record.status === "ACTIVE").length, "Référentiel disponible"],
    ["Lots actifs", batches.filter((record) => record.status === "ACTIVE").length, "Lots utilisables"],
    ["Stock faible", records.filter((record) => record.status === "LOW_STOCK").length, "À surveiller"],
    ["Ruptures", records.filter((record) => record.status === "OUT_OF_STOCK" || record.status === "DEPLETED").length, "Action requise"],
    ["Lots expirés", batches.filter((record) => text(record, "expiryDate") && text(record, "expiryDate") < today).length, "Hors utilisation"],
    ["Péremptions proches", batches.filter((record) => text(record, "expiryDate") >= today && text(record, "expiryDate") <= near).length, "Sous 90 jours"],
    ["Ventes du jour", records.filter((record) => record.moduleCode === "SALES_DISPENSATION" && text(record, "transactionDate") === today).length, "Transactions"],
    ["Incidents ouverts", records.filter((record) => record.moduleCode === "QUALITY_PHARMACOVIGILANCE" && !["RESOLVED", "CLOSED", "ARCHIVED"].includes(record.status)).length, "Qualité / vigilance"],
  ] as const;
  return <ModuleSection title="Tableau de bord pharmacie" description="Lecture compacte des signaux opérationnels prioritaires."><ModuleMetrics label="Indicateurs pharmacie">{metrics.map(([label, value, hint]) => <ModuleMetric key={label} label={label} value={value} hint={hint} />)}</ModuleMetrics></ModuleSection>;
}

function statusTone(status: string): StatusBadgeTone { if (/OUT_OF_STOCK|DEPLETED|EXPIRED|REJECTED|CANCELLED|RECALLED/i.test(status)) return "danger"; if (/LOW_STOCK|WAITING|PENDING|DRAFT|QUARANTINED/i.test(status)) return "warning"; if (/ACTIVE|VALIDATED|PAID|RESOLVED|CLOSED|RECEIVED/i.test(status)) return "success"; if (/IN_PROGRESS|PROCESSING/i.test(status)) return "info"; return "neutral"; }

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

function recordActions(record: EnterpriseSectorRecordItem, details: (record: EnterpriseSectorRecordItem) => void, edit: (record: EnterpriseSectorRecordItem) => void, action: (record: EnterpriseSectorRecordItem, actionName: string) => Promise<void>, archive: (record: EnterpriseSectorRecordItem) => Promise<void>): BusinessContextAction[] {
  const items: BusinessContextAction[] = [{ id: "details", label: "Voir détail", icon: Pill, onSelect: () => details(record) }, { id: "edit", label: "Modifier", icon: ClipboardList, onSelect: () => edit(record) }];
  if (record.moduleCode === "SALES_DISPENSATION") items.push({ id: "pay", label: "Valider / payer", icon: BadgeCheck, onSelect: () => void action(record, "pay") }, { id: "cancel", label: "Annuler et restaurer le stock", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => void action(record, "cancel") });
  if (record.moduleCode === "STOCK_RECEIPTS") items.push({ id: "receive", label: "Valider la réception", icon: BadgeCheck, onSelect: () => void action(record, "receive") });
  if (record.moduleCode === "BATCH_EXPIRY") items.push({ id: "quarantine", label: "Mettre en quarantaine", icon: AlertTriangle, onSelect: () => void action(record, "quarantine") }, { id: "recall", label: "Rappeler le lot", icon: AlertTriangle, destructive: true, separatorBefore: true, onSelect: () => void action(record, "recall") });
  if (record.moduleCode === "RETURNS_ADJUSTMENTS_LOSSES") items.push({ id: "validate", label: "Valider l'ajustement", icon: BadgeCheck, onSelect: () => void action(record, "validate") });
  if (["ALERTS_EXPIRY_LOW_STOCK", "QUALITY_PHARMACOVIGILANCE"].includes(record.moduleCode)) items.push({ id: "resolve", label: "Marquer résolu", icon: BadgeCheck, onSelect: () => void action(record, "resolve") });
  items.push({ id: "archive", label: "Archiver", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => void archive(record) });
  return items;
}

function Details({ record }: { record: EnterpriseSectorRecordItem }) { const rows = Object.entries(record.payloadJson || {}).filter(([, value]) => value !== null && value !== "" && value !== false); return <BusinessList ariaLabel="Détails pharmacie">{rows.map(([key, value]) => <BusinessListItem key={key} title={key} description={String(value)} />)}</BusinessList>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-black text-dtsc-ink"><span className="text-xs uppercase tracking-[0.14em] text-dtsc-muted">{label}</span>{children}</label>; }
function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3 border-t border-dtsc-border pt-4 first:border-t-0 first:pt-0"><h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-600">{title}</h3>{children}</section>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>; }
function RecordSelect({ label, value, records, onChange }: { label: string; value: string; records: EnterpriseSectorRecordItem[]; onChange: (value: string) => void }) { return <Select label={label} value={value} onChange={onChange} options={records.map((record) => [record.id, `${record.title} · ${record.status}`])} />; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
