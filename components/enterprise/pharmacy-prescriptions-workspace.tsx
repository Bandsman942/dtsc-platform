"use client";

import type * as React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  BadgeCheck,
  CircleHelp,
  Eye,
  FileText,
  Link2,
  Plus,
  Send,
  ShieldAlert,
} from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

import { useToastMessage } from "@/components/ui/use-toast-message";
type Product = {
  id: string;
  name: string;
  genericName: string | null;
  dosage: string | null;
  pharmaceuticalForm: string;
  stockUnit: string;
  genericSubstitutionAllowed: boolean;
};
type Batch = { id: string; productId: string; batchNumber: string; availableQuantity: string; expiryDate: string };
type Member = { id: string; name: string };
type Sale = { id: string; saleNumber: string; prescriptionId: string | null; status: string };
type PrescriptionLine = {
  id: string;
  prescribedProductText: string;
  prescribedGenericName: string | null;
  productId: string | null;
  matchedProductId: string | null;
  substituteProductId: string | null;
  substitutionApplied: boolean;
  dosage: string | null;
  pharmaceuticalForm: string | null;
  prescribedQuantity: string | null;
  prescribedUnit: string | null;
  dispensedQuantity: string;
  frequency: string | null;
  duration: string | null;
  administrationRoute: string | null;
  posology: string | null;
  substitutionAllowed: boolean;
  matchingStatus: string;
  dispensingStatus: string;
  notes: string | null;
};
type PrescriptionDocument = {
  id: string;
  documentType: string;
  title: string;
  fileUrl: string;
  confidentialityLevel: string;
  createdAt: string;
};
type AuditEvent = { id: string; action: string; notes: string | null; actorId: string; createdAt: string };
type Prescription = {
  id: string;
  prescriptionNumber: string;
  prescriptionType: string;
  prescriptionDate: string;
  receivedAt: string;
  priority: string;
  patientName: string;
  patientAge: number | null;
  patientSex: string | null;
  patientPhone: string | null;
  patientAddress: string | null;
  patientType: string | null;
  patientNotes: string | null;
  prescriberName: string;
  prescriberType: string | null;
  prescriberIdentifier: string | null;
  prescriberPhone: string | null;
  prescriberFacility: string | null;
  prescriberSpeciality: string | null;
  prescriberAddress: string | null;
  pharmacistId: string | null;
  validationStatus: string;
  pharmacistComment: string | null;
  pharmacistValidatedAt: string | null;
  rejectionReason: string | null;
  status: string;
  linkedSaleId: string | null;
  mainDocumentUrl: string | null;
  notes: string | null;
  createdAt: string;
  lines: PrescriptionLine[];
  documents: PrescriptionDocument[];
  auditEvents: AuditEvent[];
};
type Dataset = {
  metrics: Record<string, number>;
  prescriptions: Prescription[];
  products: Product[];
  batches: Batch[];
  members: Member[];
  sales: Sale[];
};
type FormLine = {
  prescribedProductText: string;
  prescribedGenericName: string;
  productId: string;
  dosage: string;
  pharmaceuticalForm: string;
  prescribedQuantity: string;
  prescribedUnit: string;
  frequency: string;
  duration: string;
  administrationRoute: string;
  posology: string;
  substitutionAllowed: boolean;
  notes: string;
};
type FormState = {
  prescriptionNumber: string;
  prescriptionType: string;
  prescriptionDate: string;
  receivedAt: string;
  priority: string;
  patientName: string;
  patientAge: string;
  patientSex: string;
  patientPhone: string;
  patientAddress: string;
  patientType: string;
  patientNotes: string;
  prescriberName: string;
  prescriberType: string;
  prescriberIdentifier: string;
  prescriberPhone: string;
  prescriberFacility: string;
  prescriberSpeciality: string;
  prescriberAddress: string;
  pharmacistId: string;
  notes: string;
  lines: FormLine[];
};
type Tab =
  | "dashboard"
  | "new"
  | "received"
  | "validation"
  | "validated"
  | "partial"
  | "dispensed"
  | "rejected"
  | "lines"
  | "documents"
  | "audit";

const LABELS: Record<string, string> = {
  SIMPLE: "Ordonnance simple", CHRONIC: "Ordonnance chronique", RENEWABLE: "Ordonnance renouvelable",
  HOSPITAL: "Ordonnance hospitalière", PEDIATRIC: "Ordonnance pédiatrique", EMERGENCY: "Ordonnance urgente",
  INSURANCE: "Ordonnance assurance", OTHER: "Autre", NORMAL: "Normale", HIGH: "Élevée", URGENT: "Urgente",
  DRAFT: "Brouillon", RECEIVED: "Reçue", IN_VALIDATION: "En validation", VALIDATED: "Validée",
  PARTIALLY_DISPENSED: "Partiellement servie", DISPENSED: "Servie", REJECTED: "Rejetée",
  CANCELLED: "Annulée", ARCHIVED: "Archivée", NOT_SUBMITTED: "Non soumise", PENDING: "En attente",
  MISSING_INFORMATION: "Information manquante", MATCHED: "Rapproché", UNMATCHED: "Produit non référencé",
  UNAVAILABLE: "Indisponible", SUBSTITUTION_ACCEPTED: "Substitution appliquée", NOT_DISPENSED: "Non servie",
  COUNTER_CUSTOMER: "Client comptoir", PATIENT: "Patient", INTERNAL_PATIENT: "Patient clinique interne",
  EMPLOYEE: "Employé interne", INSURED_CUSTOMER: "Client assurance", DOCTOR: "Médecin",
  AUTHORIZED_NURSE: "Infirmier autorisé", DENTIST: "Dentiste", MIDWIFE: "Sage-femme",
  CLINIC: "Clinique", MEDICAL_CENTER: "Centre médical",
};
const HELP: Record<string, string> = {
  prescriptionNumber: "Numéro unique dans cette pharmacie. Laissez vide pour une génération automatique.",
  prescriptionType: "Nature commerciale et opérationnelle de l'ordonnance.",
  prescriptionDate: "Date inscrite par le prescripteur sur l'ordonnance.",
  receivedAt: "Date de présentation de l'ordonnance à la pharmacie.",
  priority: "Niveau de priorité utilisé pour organiser la validation.",
  patientName: "Nom du patient ou du client concerné par la dispensation.",
  patientType: "Catégorie utile au suivi commercial, interne ou assurance.",
  prescriberName: "Nom complet du professionnel ou de l'établissement prescripteur.",
  prescriberType: "Qualité du prescripteur, présentée avec un libellé français.",
  pharmacistId: "Collaborateur chargé du contrôle pharmaceutique.",
  productId: "Produit du référentiel pharmacie correspondant à la ligne prescrite.",
  prescribedProductText: "Nom du médicament exactement tel qu'il apparaît sur l'ordonnance.",
  prescribedQuantity: "Quantité demandée par le prescripteur.",
  substitutionAllowed: "Autorise une substitution générique traçable après contrôle.",
};
const TABS: Array<[Tab, string]> = [
  ["dashboard", "Tableau de bord ordonnances"], ["new", "Nouvelle ordonnance"], ["received", "Ordonnances reçues"],
  ["validation", "Ordonnances en validation"], ["validated", "Ordonnances validées"],
  ["partial", "Ordonnances partiellement servies"], ["dispensed", "Ordonnances servies"],
  ["rejected", "Ordonnances rejetées"], ["lines", "Lignes de prescription"],
  ["documents", "Documents d'ordonnance"], ["audit", "Historique & audit"],
];

function emptyLine(product?: Product): FormLine {
  return {
    prescribedProductText: product?.name || "",
    prescribedGenericName: product?.genericName || "",
    productId: product?.id || "",
    dosage: product?.dosage || "",
    pharmaceuticalForm: product?.pharmaceuticalForm || "",
    prescribedQuantity: "1",
    prescribedUnit: product?.stockUnit || "unité",
    frequency: "",
    duration: "",
    administrationRoute: "",
    posology: "",
    substitutionAllowed: false,
    notes: "",
  };
}
function emptyForm(dataset: Dataset | null): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    prescriptionNumber: "", prescriptionType: "SIMPLE", prescriptionDate: today, receivedAt: today, priority: "NORMAL",
    patientName: "", patientAge: "", patientSex: "", patientPhone: "", patientAddress: "", patientType: "PATIENT",
    patientNotes: "", prescriberName: "", prescriberType: "DOCTOR", prescriberIdentifier: "", prescriberPhone: "",
    prescriberFacility: "", prescriberSpeciality: "", prescriberAddress: "", pharmacistId: dataset?.members[0]?.id || "",
    notes: "", lines: [emptyLine()],
  };
}

export function PharmacyPrescriptionsWorkspace({ organizationId }: { organizationId: string }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Prescription | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(null));
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/prescriptions`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as Dataset | null;
    if (response.ok && body) setDataset(body);
    else setMessage("Chargement des ordonnances impossible.");
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);
  const list = useSmartList({
    items: dataset?.prescriptions || [],
    pageSize: 12,
    getSearchText: useCallback((item: Prescription) => `${item.prescriptionNumber} ${item.patientName} ${item.prescriberName} ${item.prescriberFacility || ""} ${item.status}`, []),
  });
  const productMap = useMemo(() => new Map((dataset?.products || []).map((product) => [product.id, product])), [dataset]);
  const memberMap = useMemo(() => new Map((dataset?.members || []).map((member) => [member.id, member.name])), [dataset]);
  const saleMap = useMemo(() => new Map((dataset?.sales || []).map((sale) => [sale.id, sale.saleNumber])), [dataset]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/prescriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setSaving(false);
    setMessage(response.ok ? "Ordonnance enregistrée en brouillon." : body?.message || "Enregistrement impossible.");
    if (response.ok) {
      setFormOpen(false);
      await load();
    }
  }
  async function action(item: Prescription, actionName: string, extra: Record<string, unknown> = {}) {
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/prescriptions/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName, ...extra }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setMessage(response.ok ? "Action sur l'ordonnance enregistrée." : body?.message || "Action impossible.");
    if (response.ok) {
      setDetail(null);
      await load();
    }
  }
  const prescriptions = dataset?.prescriptions || [];
  const filtered = filterTab(prescriptions, tab);
  return (
    <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0"><h3 className="text-lg font-black text-dtsc-ink">Ordonnances / prescriptions</h3><p className="text-sm text-dtsc-muted">Réception, rapprochement produit, contrôle pharmacien et liaison avec les ventes.</p></div>
        <Button onClick={() => { setForm(emptyForm(dataset)); setFormOpen(true); }} className="w-full bg-[#002b5b] text-white sm:w-auto"><Plus />Nouvelle ordonnance</Button>
      </div>
      <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2">
        {TABS.map(([code, title]) => <button key={code} type="button" onClick={() => code === "new" ? setFormOpen(true) : setTab(code)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${tab === code ? "border-emerald-400 text-emerald-700" : "border-dtsc-border text-dtsc-muted"}`}>{title}</button>)}
      </div>
      {tab === "dashboard" ? <Metrics metrics={dataset?.metrics || {}} /> : tab === "lines" ? (
        <Grid>{prescriptions.flatMap((item) => item.lines.map((line) => <Card key={line.id} title={line.prescribedProductText} text={`${item.prescriptionNumber} · ${label(line.matchingStatus)} · ${label(line.dispensingStatus)}`} />))}</Grid>
      ) : tab === "documents" ? (
        <Grid>{prescriptions.flatMap((item) => item.documents.map((document) => <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="rounded-2xl border bg-dtsc-surface p-4"><FileText className="h-5 w-5 text-emerald-600" /><p className="mt-2 font-black">{document.title}</p><p className="text-xs text-dtsc-muted">{item.prescriptionNumber} · {label(document.documentType)} · {label(document.confidentialityLevel)}</p></a>))}</Grid>
      ) : tab === "audit" ? (
        <Grid>{prescriptions.flatMap((item) => item.auditEvents.map((event) => <Card key={event.id} title={label(event.action)} text={`${item.prescriptionNumber} · ${date(event.createdAt)}${event.notes ? ` · ${event.notes}` : ""}`} />))}</Grid>
      ) : (
        <>
          <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder="Numéro, patient, prescripteur ou établissement..." />
          <Grid>{(tab === "received" ? list.paginatedItems : filtered).map((item) => <PrescriptionCard key={item.id} item={item} pharmacist={memberMap.get(item.pharmacistId || "")} linkedSale={saleMap.get(item.linkedSaleId || "")} actions={prescriptionActions(item, setDetail, action)} />)}</Grid>
          {!filtered.length && tab !== "received" && <Empty />}
          {!list.filteredCount && tab === "received" && <Empty />}
        </>
      )}

      <PrescriptionForm open={formOpen} close={() => setFormOpen(false)} form={form} setForm={setForm} dataset={dataset} save={save} saving={saving} />
      <Dialog open={Boolean(detail)} title={detail?.prescriptionNumber || "Détail ordonnance"} description="Contrôle pharmaceutique, rapprochement, dispensation et traçabilité." onClose={() => setDetail(null)} className="h-[96dvh] max-w-6xl">
        {detail && <PrescriptionDetail item={detail} products={dataset?.products || []} productMap={productMap} memberMap={memberMap} saleMap={saleMap} action={action} />}
      </Dialog>
    </section>
  );
}

function filterTab(items: Prescription[], tab: Tab) {
  if (tab === "validation") return items.filter((item) => item.validationStatus === "PENDING" || item.validationStatus === "MISSING_INFORMATION");
  if (tab === "validated") return items.filter((item) => item.status === "VALIDATED");
  if (tab === "partial") return items.filter((item) => item.status === "PARTIALLY_DISPENSED");
  if (tab === "dispensed") return items.filter((item) => item.status === "DISPENSED");
  if (tab === "rejected") return items.filter((item) => item.status === "REJECTED");
  return items;
}
function Metrics({ metrics }: { metrics: Record<string, number> }) {
  const rows = [["Reçues aujourd'hui", metrics.receivedToday], ["Reçues ce mois", metrics.receivedMonth], ["En validation", metrics.pendingValidation], ["Validées", metrics.validated], ["Partiellement servies", metrics.partial], ["Servies", metrics.dispensed], ["Rejetées", metrics.rejected], ["Avec document joint", metrics.withDocument], ["Sans document joint", metrics.withoutDocument], ["Liées à une vente", metrics.linkedSale], ["Lignes non rapprochées", metrics.unmatchedLines], ["Lignes non servies", metrics.undispensedLines]];
  return <Grid>{rows.map(([title, value]) => <Card key={String(title)} title={String(title)} text={String(value ?? 0)} />)}</Grid>;
}
function PrescriptionCard({ item, pharmacist, linkedSale, actions }: { item: Prescription; pharmacist?: string; linkedSale?: string; actions: ActionMenuItem[] }) {
  return <article className="dtsc-glass-list-item min-w-0 rounded-2xl p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><Badge value={item.status} /><h4 className="mt-2 truncate font-black">{item.prescriptionNumber}</h4><p className="truncate text-xs text-dtsc-muted">{item.patientName} · {item.prescriberName}</p></div><ActionMenu items={actions} /></div><p className="mt-2 text-xs text-dtsc-muted">{date(item.prescriptionDate)} · {item.lines.length} ligne(s) · {label(item.validationStatus)}</p><p className="mt-1 truncate text-xs text-dtsc-muted">{pharmacist || "Pharmacien non assigné"} · {linkedSale ? `Vente ${linkedSale}` : "Aucune vente liée"} · {item.documents.length ? "Document joint" : "Sans document"}</p></article>;
}
function prescriptionActions(item: Prescription, detail: (item: Prescription) => void, action: (item: Prescription, actionName: string, extra?: Record<string, unknown>) => Promise<void>): ActionMenuItem[] {
  const actions: ActionMenuItem[] = [{ key: "view", label: "Voir le détail", icon: Eye, onSelect: () => detail(item) }];
  if (item.status === "DRAFT") actions.push({ key: "submit", label: "Soumettre à validation", icon: Send, onSelect: () => void action(item, "submit") });
  if (item.validationStatus === "PENDING" || item.validationStatus === "MISSING_INFORMATION") actions.push({ key: "validate", label: "Valider l'ordonnance", icon: BadgeCheck, onSelect: () => void action(item, "validate") });
  if (item.validationStatus === "VALIDATED" && !item.linkedSaleId) actions.push({ key: "sale", label: "Générer une vente brouillon", icon: Link2, onSelect: () => void action(item, "create-sale") });
  if (!["ARCHIVED", "DISPENSED"].includes(item.status)) actions.push({ key: "archive", label: "Archiver", icon: Archive, onSelect: () => void action(item, "archive"), destructive: true });
  return actions;
}

function PrescriptionDetail({ item, products, productMap, memberMap, saleMap, action }: { item: Prescription; products: Product[]; productMap: Map<string, Product>; memberMap: Map<string, string>; saleMap: Map<string, string>; action: (item: Prescription, actionName: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <div className="grid min-w-0 gap-4 overflow-x-hidden">
    <Section title="Informations générales"><Grid><Card title="Patient / client" text={`${item.patientName}${item.patientPhone ? ` · ${item.patientPhone}` : ""}`} /><Card title="Prescripteur" text={`${item.prescriberName}${item.prescriberFacility ? ` · ${item.prescriberFacility}` : ""}`} /><Card title="Contrôle pharmacien" text={`${label(item.validationStatus)} · ${memberMap.get(item.pharmacistId || "") || "Non assigné"}`} /><Card title="Vente liée" text={saleMap.get(item.linkedSaleId || "") || "Aucune vente brouillon liée"} /></Grid></Section>
    <Section title="Lignes prescrites et rapprochement">
      <div className="grid gap-3">{item.lines.map((line) => <LineDetail key={line.id} item={item} line={line} products={products} productMap={productMap} action={action} />)}</div>
    </Section>
    <Section title="Actions contrôlées">
      <Field name="reason" labelText="Motif ou commentaire"><textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-24 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" placeholder="Précisez le motif pour un rejet ou une demande d'information." /></Field>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void action(item, "request-info", { reason })}><ShieldAlert />Demander une information</Button><Button type="button" variant="outline" disabled={!reason} onClick={() => void action(item, "reject", { reason })}><ShieldAlert />Rejeter avec motif</Button>{item.validationStatus === "VALIDATED" && <><Button type="button" variant="outline" onClick={() => void action(item, "mark-partially-dispensed")}><BadgeCheck />Marquer partiellement servie</Button><Button type="button" variant="outline" onClick={() => void action(item, "mark-dispensed")}><BadgeCheck />Marquer servie</Button></>}</div>
    </Section>
  </div>;
}
function LineDetail({ item, line, products, productMap, action }: { item: Prescription; line: PrescriptionLine; products: Product[]; productMap: Map<string, Product>; action: (item: Prescription, actionName: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const [matched, setMatched] = useState(line.matchedProductId || line.productId || "");
  const [substitute, setSubstitute] = useState(line.substituteProductId || "");
  const [reason, setReason] = useState("");
  const stockText = matched ? productMap.get(matched)?.name || "Produit sélectionné" : "Produit non référencé";
  return <article className="min-w-0 rounded-2xl border border-dtsc-border p-3"><div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="font-black">{line.prescribedProductText}</p><p className="text-xs text-dtsc-muted">{line.prescribedQuantity || "Quantité non précisée"} {line.prescribedUnit || ""} · {line.posology || "Posologie non précisée"}</p><p className="text-xs text-dtsc-muted">{stockText} · {label(line.matchingStatus)} · {label(line.dispensingStatus)}</p></div><Badge value={line.substitutionApplied ? "SUBSTITUTION_ACCEPTED" : line.matchingStatus} /></div><div className="mt-3 grid min-w-0 gap-2 md:grid-cols-3"><Choice name="productId" labelText="Produit correspondant" value={matched} setValue={setMatched} options={products.map((product) => [product.id, `${product.name}${product.genericName ? ` · ${product.genericName}` : ""}`])} /><Choice name="substitutionAllowed" labelText="Produit substitut" value={substitute} setValue={setSubstitute} options={products.filter((product) => product.genericSubstitutionAllowed).map((product) => [product.id, product.name])} /><Field name="reason" labelText="Motif / commentaire"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field></div><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!matched} onClick={() => void action(item, "match-line", { lineId: line.id, productId: matched })}>Rapprocher le produit</Button><Button type="button" variant="outline" disabled={!substitute || !line.substitutionAllowed} onClick={() => void action(item, "substitute-line", { lineId: line.id, substituteProductId: substitute, reason })}>Appliquer la substitution</Button><Button type="button" variant="outline" onClick={() => void action(item, "mark-line-unavailable", { lineId: line.id, reason })}>Marquer indisponible</Button></div></article>;
}

function PrescriptionForm({ open, close, form, setForm, dataset, save, saving }: { open: boolean; close: () => void; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; dataset: Dataset | null; save: (event: FormEvent<HTMLFormElement>) => Promise<void>; saving: boolean }) {
  function change<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function changeLine(index: number, key: keyof FormLine, value: string | boolean) { setForm((current) => ({ ...current, lines: current.lines.map((line, position) => position === index ? { ...line, [key]: value } : line) })); }
  return <Dialog open={open} title="Nouvelle ordonnance" description="Formulaire plein écran pour la réception et la préparation du contrôle pharmacien." onClose={close} className="h-[96dvh] max-w-6xl"><form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden">
    <Section title="Informations ordonnance"><Fields><Field name="prescriptionNumber" labelText="Numéro d'ordonnance"><Input value={form.prescriptionNumber} onChange={(event) => change("prescriptionNumber", event.target.value)} /></Field><Choice name="prescriptionType" labelText="Type d'ordonnance" value={form.prescriptionType} setValue={(value) => change("prescriptionType", value)} options={["SIMPLE", "CHRONIC", "RENEWABLE", "HOSPITAL", "PEDIATRIC", "EMERGENCY", "INSURANCE", "OTHER"].map((value) => [value, label(value)])} /><Field name="prescriptionDate" labelText="Date de prescription"><Input required type="date" value={form.prescriptionDate} onChange={(event) => change("prescriptionDate", event.target.value)} /></Field><Field name="receivedAt" labelText="Date de réception"><Input required type="date" value={form.receivedAt} onChange={(event) => change("receivedAt", event.target.value)} /></Field><Choice name="priority" labelText="Priorité" value={form.priority} setValue={(value) => change("priority", value)} options={["NORMAL", "HIGH", "URGENT"].map((value) => [value, label(value)])} /><Choice name="pharmacistId" labelText="Pharmacien responsable" value={form.pharmacistId} setValue={(value) => change("pharmacistId", value)} options={(dataset?.members || []).map((member) => [member.id, member.name])} /></Fields></Section>
    <Section title="Patient / client"><Fields><Field name="patientName" labelText="Nom du patient ou client"><Input required value={form.patientName} onChange={(event) => change("patientName", event.target.value)} /></Field><Field name="patientAge" labelText="Âge"><Input type="number" min="0" value={form.patientAge} onChange={(event) => change("patientAge", event.target.value)} /></Field><Choice name="patientType" labelText="Type de patient ou client" value={form.patientType} setValue={(value) => change("patientType", value)} options={["COUNTER_CUSTOMER", "PATIENT", "INTERNAL_PATIENT", "EMPLOYEE", "INSURED_CUSTOMER", "OTHER"].map((value) => [value, label(value)])} /><Field name="patientPhone" labelText="Téléphone"><Input value={form.patientPhone} onChange={(event) => change("patientPhone", event.target.value)} /></Field><Field name="patientSex" labelText="Sexe"><Input value={form.patientSex} onChange={(event) => change("patientSex", event.target.value)} /></Field><Field name="patientAddress" labelText="Adresse"><Input value={form.patientAddress} onChange={(event) => change("patientAddress", event.target.value)} /></Field></Fields></Section>
    <Section title="Prescripteur"><Fields><Field name="prescriberName" labelText="Nom du prescripteur"><Input required value={form.prescriberName} onChange={(event) => change("prescriberName", event.target.value)} /></Field><Choice name="prescriberType" labelText="Type de prescripteur" value={form.prescriberType} setValue={(value) => change("prescriberType", value)} options={["DOCTOR", "AUTHORIZED_NURSE", "DENTIST", "MIDWIFE", "CLINIC", "HOSPITAL", "MEDICAL_CENTER", "OTHER"].map((value) => [value, label(value)])} /><Field name="prescriberFacility" labelText="Établissement prescripteur"><Input value={form.prescriberFacility} onChange={(event) => change("prescriberFacility", event.target.value)} /></Field><Field name="prescriberIdentifier" labelText="Numéro professionnel"><Input value={form.prescriberIdentifier} onChange={(event) => change("prescriberIdentifier", event.target.value)} /></Field><Field name="prescriberPhone" labelText="Téléphone du prescripteur"><Input value={form.prescriberPhone} onChange={(event) => change("prescriberPhone", event.target.value)} /></Field><Field name="prescriberSpeciality" labelText="Spécialité"><Input value={form.prescriberSpeciality} onChange={(event) => change("prescriberSpeciality", event.target.value)} /></Field></Fields></Section>
    <Section title="Lignes prescrites">{form.lines.map((line, index) => <div key={index} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border p-3"><Fields><Field name="prescribedProductText" labelText="Médicament prescrit"><Input required value={line.prescribedProductText} onChange={(event) => changeLine(index, "prescribedProductText", event.target.value)} /></Field><Choice name="productId" labelText="Produit du référentiel" value={line.productId} setValue={(value) => { const product = dataset?.products.find((item) => item.id === value); changeLine(index, "productId", value); if (product) { changeLine(index, "prescribedProductText", product.name); changeLine(index, "prescribedGenericName", product.genericName || ""); changeLine(index, "dosage", product.dosage || ""); changeLine(index, "pharmaceuticalForm", product.pharmaceuticalForm); changeLine(index, "prescribedUnit", product.stockUnit); } }} options={(dataset?.products || []).map((product) => [product.id, product.name])} /><Field name="prescribedQuantity" labelText="Quantité prescrite"><Input type="number" min="0.001" step="any" value={line.prescribedQuantity} onChange={(event) => changeLine(index, "prescribedQuantity", event.target.value)} /></Field><Field name="genericName" labelText="DCI / nom générique"><Input value={line.prescribedGenericName} onChange={(event) => changeLine(index, "prescribedGenericName", event.target.value)} /></Field><Field name="dosage" labelText="Dosage"><Input value={line.dosage} onChange={(event) => changeLine(index, "dosage", event.target.value)} /></Field><Field name="form" labelText="Forme pharmaceutique"><Input value={line.pharmaceuticalForm} onChange={(event) => changeLine(index, "pharmaceuticalForm", event.target.value)} /></Field><Field name="posology" labelText="Posologie"><Input value={line.posology} onChange={(event) => changeLine(index, "posology", event.target.value)} /></Field><Field name="frequency" labelText="Fréquence"><Input value={line.frequency} onChange={(event) => changeLine(index, "frequency", event.target.value)} /></Field><Field name="duration" labelText="Durée"><Input value={line.duration} onChange={(event) => changeLine(index, "duration", event.target.value)} /></Field></Fields><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={line.substitutionAllowed} onChange={(event) => changeLine(index, "substitutionAllowed", event.target.checked)} /><span>Substitution générique autorisée</span><Help text={HELP.substitutionAllowed} /></label></div>)}<Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}><Plus />Ajouter une ligne prescrite</Button></Section>
    <Section title="Notes et suivi"><Field name="notes" labelText="Commentaire général"><textarea value={form.notes} onChange={(event) => change("notes", event.target.value)} className="min-h-28 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field></Section>
    <div className="grid gap-2 sm:flex"><Button disabled={saving} className="bg-[#002b5b] text-white">{saving ? "Enregistrement..." : "Enregistrer brouillon"}</Button><Button type="button" variant="outline" onClick={close}>Retour</Button></div>
  </form></Dialog>;
}

function Empty() { return <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucune ordonnance n&apos;a encore été enregistrée. Ajoutez une ordonnance pour suivre sa validation, sa dispensation et son lien avec les ventes.</p>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="min-w-0 space-y-3 overflow-hidden rounded-2xl border border-dtsc-border p-3"><h4 className="font-black text-emerald-600">{title}</h4>{children}</section>; }
function Fields({ children }: { children: ReactNode }) { return <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>; }
function Grid({ children }: { children: ReactNode }) { return <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>; }
function Card({ title, text }: { title: string; text: string }) { return <article className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"><p className="truncate font-black text-dtsc-ink">{title}</p><p className="mt-1 break-words text-sm text-dtsc-muted">{text}</p></article>; }
function Help({ text }: { text?: string }) { return text ? <span title={text} aria-label={text} className="inline-flex"><CircleHelp className="h-3.5 w-3.5" /></span> : null; }
function Field({ name, labelText, children }: { name: string; labelText: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1"><span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{labelText}<Help text={HELP[name] || `Renseignez ${labelText.toLocaleLowerCase("fr")} pour compléter le suivi de l'ordonnance.`} /></span>{children}</label>; }
function Choice({ name, labelText, value, setValue, options }: { name: string; labelText: string; value: string; setValue: (value: string) => void; options: string[][] }) { return <Field name={name} labelText={labelText}><select value={value} onChange={(event) => setValue(event.target.value)} className="h-11 w-full min-w-0 truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner...</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></Field>; }
function Badge({ value }: { value: string }) { return <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-1 text-xs font-black text-emerald-700">{label(value)}</span>; }
function label(value: string) { return LABELS[value] || value.replaceAll("_", " ").toLocaleLowerCase("fr"); }
function date(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)); }
