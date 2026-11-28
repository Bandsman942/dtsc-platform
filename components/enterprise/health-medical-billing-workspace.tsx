"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect,useState,type FormEvent,type ReactNode } from "react";import { CircleHelp,Eye,FileCheck,Plus,ReceiptText,WalletCards,XCircle } from "lucide-react";import { ActionMenu,type ActionMenuItem } from "@/components/ui/action-menu";import { Button } from "@/components/ui/button";import { Dialog } from "@/components/ui/dialog";import { Input } from "@/components/ui/input";import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { FinanceAmountScopes, FinanceDateFilter, FinanceExportControls, formatAnalyticsAmount } from "@/components/enterprise/professional/finance-design2-controls";
import { healthClinicalStatusLabel, healthClinicalT, useHealthClinicalLocale, type HealthClinicalKey, type HealthClinicalLocale } from "@/components/enterprise/health-clinical-i18n";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import type { MonetaryScopes } from "@/lib/enterprise/common/analytics";
import { inventoryQuantityExportValue } from "@/lib/enterprise/inventory/quantity-display";
import { medicalInvoiceStatuses } from "@/lib/health-billing-validators";

type Ref={id:string;patientId?:string;patientNumber?:string;fullName?:string;phonePrimary?:string;consultationNumber?:string;appointmentNumber?:string;labRequestNumber?:string;testLabel?:string;labelFr?:string;label?:string;defaultPrice?:number;category?:string;product?:{name:string;sellingPrice:number|null;unit:string};quantity?:number};type TaxChoice={id:string;code:string;nameFr:string;nameEn:string};type Item={taxCodeId:string;additionalTaxCodeIds:string[];taxCalculationMode:"NET"|"SEQUENTIAL";taxEvidenceReference:string;itemType:string;description:string;quantity:string;unitPrice:string;discountAmount:string;serviceCatalogId:string;linkedConsultationId:string;linkedLabRequestId:string;linkedPharmacyDispensationId:string};type Invoice={id:string;invoiceNumber:string;invoiceType:string;invoiceDate:string;dueDate:string|null;currency:string;status:string;subtotalAmount:number;discountAmount:number;taxAmount:number;insuranceAmount:number;patientAmount:number;totalAmount:number;paidAmount:number;balanceAmount:number;patient:{patientNumber:string;fullName:string};consultation?:{consultationNumber:string}|null;createdBy:{name:string};items:Array<Item&{id:string;totalAmount:number}>;payments:Array<{id:string;amount:number;paymentMethod:string;paymentDate:string;receiptNumber:string}>;events:Array<{id:string;summary:string;createdAt:string;actor:{name:string}}>};type Permissions=Record<string,boolean>;
const STATUS:Record<string,string>={DRAFT:"Brouillon",ISSUED:"Émise",PENDING_PAYMENT:"En attente de paiement",PARTIAL_PAID:"Partiellement payée",PAID:"Payée",PENDING_INSURANCE:"En attente assurance",CANCELLED:"Annulée",REFUNDED:"Remboursée",ARCHIVED:"Archivée"},TYPES:Record<string,string>={CONSULTATION:"Consultation",LABORATORY:"Laboratoire",PHARMACY:"Pharmacie",HOSPITALIZATION:"Hospitalisation",NURSING:"Soins infirmiers",MEDICAL_ACTS:"Actes médicaux",EMERGENCY:"Urgence",INSURANCE:"Assurance",MIXED:"Mixte",OTHER:"Autre"},ITEMS:Record<string,string>={CONSULTATION:"Consultation",MEDICAL_ACT:"Acte médical",LABORATORY:"Examen laboratoire",PHARMACY:"Produit pharmacie",NURSING:"Soin infirmier",ADMINISTRATIVE:"Frais administratifs",HOSPITALIZATION:"Hospitalisation",OTHER:"Autre"},PAYMENTS:Record<string,string>={CASH:"Espèces",MOBILE_MONEY:"Mobile Money",CARD:"Carte bancaire",BANK_TRANSFER:"Virement",INSURANCE:"Assurance",PATIENT_CREDIT:"Crédit patient",EXEMPTION:"Exonération",OTHER:"Autre"};const newItem=():Item=>({itemType:"CONSULTATION",description:"",quantity:"1",unitPrice:"0",discountAmount:"0",taxCodeId:"",additionalTaxCodeIds:[],taxCalculationMode:"NET",taxEvidenceReference:"",serviceCatalogId:"",linkedConsultationId:"",linkedLabRequestId:"",linkedPharmacyDispensationId:""});const empty=()=>({patientId:"",consultationId:"",appointmentId:"",labRequestId:"",pharmacyDispensationId:"",departmentId:"",invoiceType:"CONSULTATION",invoiceDate:"",dueDate:"",currency:"CDF",status:"DRAFT",discountAmount:"0",discountReason:"",taxAmount:"0",insuranceAmount:"0",notesInternal:"",notesVisible:"",items:[newItem()]});
type BillingPage = MonetaryScopes & {
  items: Invoice[];
  authorizedCount: number;
  metrics: Record<"today" | "pending" | "partial" | "paid", number>;
  pagination: { page: number; total: number; pageCount: number };
};

export function HealthMedicalBillingWorkspace({ organizationId }: { organizationId: string }) {
  return <MedicalBillingRegister key={organizationId} organizationId={organizationId} />;
}

function MedicalBillingRegister({ organizationId }: { organizationId: string }) {
  const locale = useHealthClinicalLocale();
  const t = (key: HealthClinicalKey) => healthClinicalT(locale, key);
  const statusLabel = (value: string) => medicalInvoiceStatuses.some(status => status === value)
    ? healthClinicalStatusLabel(locale, value) : t("billing.unknownStatus");
  const endpoint = `/api/enterprise/${organizationId}/healthcare/medical-billing`;
  const [refs, setRefs] = useState<{
    patients: Ref[]; consultations: Ref[]; appointments: Ref[]; labs: Ref[];
    dispensations: Ref[]; departments: Ref[]; catalog: Ref[]; taxCodes: TaxChoice[];
    businessDate: string; organizationName: string; permissions: Permissions;
  } | null>(null);
  const [referencesError, setReferencesError] = useState(false);
  const [result, setResult] = useState<{ key: string; data: BillingPage } | null>(null);
  const [error, setError] = useState<{ key: string; invalidFilters: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [action, setAction] = useState<{ invoice: Invoice; kind: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useToastMessage(message);

  useEffect(() => {
    const controller = new AbortController();
    setReferencesError(false);
    fetch(`${endpoint}?mode=references`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (!controller.signal.aborted) setRefs(payload);
      })
      .catch(() => { if (!controller.signal.aborted) setReferencesError(true); });
    return () => controller.abort();
  }, [endpoint, refresh]);

  const filters = { search: query.trim(), status, dateFrom, dateTo };
  const params = new URLSearchParams({ ...filters, mode: "register", page: String(page) });
  const registerUrl = `${endpoint}?${params}`;
  const key = `${registerUrl}#${refresh}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(registerUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setError({ key, invalidFilters: response.status === 400 });
          return;
        }
        const data = await response.json() as BillingPage;
        if (controller.signal.aborted) return;
        if (page > data.pagination.pageCount) {
          setPage(data.pagination.pageCount);
          return;
        }
        setResult({ key, data });
        setError(null);
      } catch {
        if (!controller.signal.aborted) setError({ key, invalidFilters: false });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, page, registerUrl]);

  const data = result?.key === key ? result.data : null;
  const registerError = error?.key === key ? error : null;
  const permissions = refs?.permissions || {};
  const businessDate = refs?.businessDate || "";
  const reload = () => setRefresh(previous => previous + 1);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json().catch(() => null);
      setMessage(body?.message || t("billing.saveFailed"));
      if (response.ok) {
        setFormOpen(false);
        setForm({ ...empty(), invoiceDate: businessDate });
        reload();
      }
    } catch {
      setMessage(t("billing.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function run() {
    if (!action || saving) return;
    setSaving(true);
    try {
      const payload = action.kind === "payment" ? { action: "payment", amount, paymentMethod: method } : { action: action.kind, reason };
      const response = await fetch(`${endpoint}/${action.invoice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      setMessage(body?.message || t("billing.saveFailed"));
      if (response.ok) {
        setAction(null);
        setDetail(null);
        reload();
      }
    } catch {
      setMessage(t("billing.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const exportColumns = [
    { key: "invoiceNumber", copy: "invoiceNumber", get: (row: Record<string, unknown>) => String(row.invoiceNumber) },
    { key: "invoiceDate", copy: "invoiceDate", get: (row: Record<string, unknown>) => String(row.invoiceDate).slice(0, 10) },
    { key: "status", copy: "status", get: (row: Record<string, unknown>) => statusLabel(String(row.status)) },
    { key: "currency", copy: "currency", get: (row: Record<string, unknown>) => String(row.currency) },
    { key: "totalAmount", copy: "total", get: (row: Record<string, unknown>) => inventoryQuantityExportValue(String(row.totalAmount)) },
    { key: "paidAmount", copy: "paid", get: (row: Record<string, unknown>) => inventoryQuantityExportValue(String(row.paidAmount)) },
    { key: "balanceAmount", copy: "balance", get: (row: Record<string, unknown>) => inventoryQuantityExportValue(String(row.balanceAmount)) },
  ] as const;

  return <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-xl font-semibold">{t("billing.title")}</h3>
      {permissions.canCreate && <Button onClick={() => { setForm({ ...empty(), invoiceDate: businessDate }); setFormOpen(true); }}>
        <Plus />{t("billing.newInvoice")}
      </Button>}
    </div>
    {referencesError && <p role="status" className="text-sm text-dtsc-muted">{t("billing.referencesUnavailable")} <Button type="button" variant="outline" onClick={reload}>{t("billing.retry")}</Button></p>}
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-bold text-dtsc-muted">
        {t("billing.status")}
        <Choice label={t("billing.status")} value={status} set={value => { setStatus(value); setPage(1); }} options={Object.fromEntries(medicalInvoiceStatuses.map(value => [value, statusLabel(value)]))} all={t("billing.allStatuses")} />
      </label>
      <FinanceDateFilter locale={locale} businessDate={businessDate} from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }} />
    </div>
    <ListControls query={query} onQueryChange={value => { setQuery(value.slice(0, 160)); setPage(1); }}
      page={page} pageCount={data?.pagination.pageCount ?? page} totalCount={data?.authorizedCount ?? 0}
      filteredCount={data?.pagination.total ?? 0} onPageChange={setPage} placeholder={t("billing.search")} />
    {data && <>
      <ModuleMetrics label={t("billing.counts")}>
        <ModuleMetric label={t("billing.today")} value={data.metrics.today} />
        <ModuleMetric label={t("billing.pending")} value={data.metrics.pending} />
        <ModuleMetric label={t("billing.partial")} value={data.metrics.partial} />
        <ModuleMetric label={t("billing.paidCount")} value={data.metrics.paid} />
      </ModuleMetrics>
      <FinanceAmountScopes totals={data} locale={locale} statusLabel={statusLabel} />
    </>}
    {data && refs?.permissions.canExport && <FinanceExportControls
      endpoint={`${endpoint}?mode=export`} organizationName={refs.organizationName} title={t("billing.title")} locale={locale}
      subtitleFr="DTSC Platform · Facturation médicale" subtitleEn="DTSC Platform · Medical billing"
      filters={filters} reportFilters={[
        ...(status ? [{ label: t("billing.status"), value: statusLabel(status) }] : []),
        ...(dateFrom ? [{ label: t("billing.dateFrom"), value: dateFrom }] : []),
        ...(dateTo ? [{ label: t("billing.dateTo"), value: dateTo }] : []),
        ...(query.trim() ? [{ label: t("billing.searchApplied"), value: t("billing.searchAppliedValue") }] : []),
      ]}
      columns={exportColumns.map(({ key, copy, get }) => ({
        key, get, labelFr: healthClinicalT("fr", `billing.${copy}`), labelEn: healthClinicalT("en", `billing.${copy}`),
      }))}
      statusLabel={statusLabel} />}
    {registerError ? <div role="status" className="space-y-2">
      <p>{t(registerError.invalidFilters ? "billing.invalidFilters" : "billing.registerUnavailable")}</p>
      {!registerError.invalidFilters && <Button type="button" variant="outline" onClick={reload}>{t("billing.retry")}</Button>}
    </div> : !data ? <div role="status" className="rounded-2xl bg-dtsc-page p-4 text-sm text-dtsc-muted">{t("billing.loading")}</div>
      : data.items.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map(invoice => <Card key={invoice.id} invoice={invoice} permissions={permissions} detail={setDetail}
          action={kind => setAction({ invoice, kind })} locale={locale} statusLabel={statusLabel} />)}
      </div> : <Empty text={t("billing.noInvoices")} />}
    <Dialog open={formOpen} onClose={() => { if (!saving) setFormOpen(false); }} title={t("billing.newInvoice")} className="h-[94dvh] max-w-7xl">
      {refs && <InvoiceForm {...refs} form={form} set={setForm} save={save} saving={saving} />}
    </Dialog>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.invoiceNumber || t("billing.viewDetails")} className="h-[94dvh] max-w-7xl">
      {detail && <Detail invoice={detail} permissions={permissions} action={kind => setAction({ invoice: detail, kind })} />}
    </Dialog>
    <Dialog open={Boolean(action)} onClose={() => { if (!saving) setAction(null); }} title={t(action?.kind === "payment" ? "billing.recordPayment" : action?.kind === "cancel" ? "billing.cancel" : "billing.issue")}>
      {action?.kind === "payment" ? <Grid>
        <F label="Montant" help="Le montant ne peut pas dépasser le solde restant."><Input required type="number" min="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></F>
        <F label="Mode de paiement" help="Mode réellement utilisé pour l’encaissement."><Choice value={method} set={setMethod} options={PAYMENTS} /></F>
      </Grid> : <F label="Motif" help="Motif historisé pour cette action sensible."><textarea required={action?.kind === "cancel"} value={reason} onChange={event => setReason(event.target.value)} className={area} /></F>}
      <Button className="mt-4" disabled={saving} onClick={() => void run()}>Confirmer</Button>
    </Dialog>
  </section>;
}

function Card({ invoice, permissions, detail, action, locale, statusLabel }: {
  invoice: Invoice;
  permissions: Permissions;
  detail: (invoice: Invoice) => void;
  action: (kind: string) => void;
  locale: HealthClinicalLocale;
  statusLabel: (value: string) => string;
}) {
  const t = (key: HealthClinicalKey) => healthClinicalT(locale, key);
  const items: ActionMenuItem[] = [{ key: "detail", label: t("billing.viewDetails"), icon: Eye, onSelect: () => detail(invoice) }];
  if (permissions.canIssue && invoice.status === "DRAFT") items.push({ key: "issue", label: t("billing.issue"), icon: FileCheck, onSelect: () => action("issue") });
  if (permissions.canRecordPayment && invoice.balanceAmount > 0 && !["DRAFT", "CANCELLED"].includes(invoice.status)) items.push({ key: "pay", label: t("billing.recordPayment"), icon: WalletCards, onSelect: () => action("payment") });
  if (permissions.canCancel && !["PAID", "CANCELLED"].includes(invoice.status)) items.push({ key: "cancel", label: t("billing.cancel"), icon: XCircle, destructive: true, onSelect: () => action("cancel") });
  const money = (amount: number) => formatAnalyticsAmount({ amount: String(amount), currencyCode: invoice.currency }, locale);

  return <article className="relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 pr-14">
    <div className="absolute right-3 top-3"><ActionMenu items={items} /></div>
    <button type="button" onClick={() => detail(invoice)} className="max-w-full text-left [overflow-wrap:anywhere]">
      <p className="text-xs font-semibold text-dtsc-blue">{invoice.invoiceNumber}</p>
      <h4 className="font-semibold">{invoice.patient.fullName}</h4>
      <p className="text-sm text-dtsc-muted">{invoice.patient.patientNumber} · {statusLabel(invoice.status)}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{money(invoice.totalAmount)}</p>
      <p className="text-xs text-dtsc-muted">{t("billing.paid")} {money(invoice.paidAmount)} · {t("billing.balance")} {money(invoice.balanceAmount)}</p>
    </button>
  </article>;
}

function InvoiceForm({form,set,save,saving,patients,consultations,appointments,labs,dispensations,departments,catalog,taxCodes}:{form:ReturnType<typeof empty>;set:(v:any)=>void;save:(e:FormEvent)=>Promise<void>;saving:boolean;patients:Ref[];consultations:Ref[];appointments:Ref[];labs:Ref[];dispensations:Ref[];departments:Ref[];catalog:Ref[];taxCodes:TaxChoice[]}){const patient=form.patientId,change=(k:string,v:any)=>set((c:any)=>({...c,[k]:v})),item=(n:number,k:keyof Item,v:string|string[])=>set((c:any)=>({...c,items:c.items.map((x:Item,i:number)=>i===n?{...x,[k]:v}:x)}));return <form onSubmit={save} className="grid min-w-0 gap-4"><Section title="Patient et contexte médical"><Grid><F label="Patient" help="Patient actif de cette entreprise."><Select required value={patient} set={v=>change("patientId",v)} rows={patients} label={r=>`${r.patientNumber} · ${r.fullName}`}/></F><F label="Consultation" help="Consultation du patient, optionnelle."><Select value={form.consultationId} set={v=>change("consultationId",v)} rows={consultations.filter(r=>!patient||r.patientId===patient)} label={r=>r.consultationNumber||""}/></F><F label="Rendez-vous" help="Rendez-vous du patient, optionnel."><Select value={form.appointmentId} set={v=>change("appointmentId",v)} rows={appointments.filter(r=>!patient||r.patientId===patient)} label={r=>r.appointmentNumber||""}/></F><F label="Demande laboratoire" help="Demande du même patient à facturer."><Select value={form.labRequestId} set={v=>change("labRequestId",v)} rows={labs.filter(r=>!patient||r.patientId===patient)} label={r=>`${r.labRequestNumber} · ${r.testLabel}`}/></F><F label="Délivrance pharmacie" help="Délivrance facturable non encore facturée."><Select value={form.pharmacyDispensationId} set={v=>change("pharmacyDispensationId",v)} rows={dispensations.filter(r=>!patient||r.patientId===patient)} label={r=>`${r.product?.name} · ${r.quantity} ${r.product?.unit}`}/></F><F label="Service" help="Service interne concerné."><Select value={form.departmentId} set={v=>change("departmentId",v)} rows={departments} label={r=>r.labelFr||""}/></F></Grid></Section><Section title="Informations de facture"><Grid><F label="Type de facture" help="Nature principale de la facture."><Choice value={form.invoiceType} set={v=>change("invoiceType",v)} options={TYPES}/></F><F label="Date de facture" help="Date d’établissement."><Input type="date" value={form.invoiceDate} onChange={e=>change("invoiceDate",e.target.value)}/></F><F label="Échéance" help="Date limite optionnelle."><Input type="date" value={form.dueDate} onChange={e=>change("dueDate",e.target.value)}/></F><F label="Devise" help="Devise appliquée à toutes les lignes."><Input value={form.currency} onChange={e=>change("currency",e.target.value)}/></F></Grid></Section><Section title="Lignes de facturation">{form.items.map((x,n)=><div key={n} className="grid gap-2 rounded-xl border border-dtsc-border p-3 md:grid-cols-2"><F label="Prestation du catalogue" help="Tarif métier enregistré, optionnel."><select className={select} value={x.serviceCatalogId} onChange={e=>{const c=catalog.find(y=>y.id===e.target.value);item(n,"serviceCatalogId",e.target.value);if(c){item(n,"description",c.labelFr||"");item(n,"unitPrice",String(c.defaultPrice||0))}}}><option value="">Saisie personnalisée</option>{catalog.map(c=><option key={c.id} value={c.id}>{c.labelFr} · {c.defaultPrice}</option>)}</select></F><F label="Type de ligne" help="Catégorie financière de la ligne."><Choice value={x.itemType} set={v=>item(n,"itemType",v)} options={ITEMS}/></F><F label="Description" help="Libellé visible de la prestation."><Input required value={x.description} onChange={e=>item(n,"description",e.target.value)}/></F><F label="Quantité" help="Quantité strictement positive."><Input required type="number" min=".001" step=".001" value={x.quantity} onChange={e=>item(n,"quantity",e.target.value)}/></F><F label="Prix unitaire" help="Prix validé et recalculé côté serveur."><Input required type="number" min="0" value={x.unitPrice} onChange={e=>item(n,"unitPrice",e.target.value)}/></F><F label="Remise ligne" help="Ne peut pas dépasser le montant de la ligne."><Input type="number" min="0" value={x.discountAmount} onChange={e=>item(n,"discountAmount",e.target.value)}/></F><F label="Code fiscal de la prestation" help="Taux de cette juridiction, calculé côté serveur. Sans code, aucune taxe implicite."><select className={select} value={x.taxCodeId} onChange={e=>item(n,"taxCodeId",e.target.value)}><option value="">Sans taxe explicite</option>{taxCodes.map(t=><option key={t.id} value={t.id}>{t.code} · {t.nameFr}</option>)}</select></F><F label="Taxe complémentaire" help="Cumul explicitement configuré, sans retenue à la source."><select className={select} value={x.additionalTaxCodeIds[0]||""} onChange={e=>item(n,"additionalTaxCodeIds",e.target.value?[e.target.value]:[])}><option value="">Aucune</option>{taxCodes.filter(t=>t.id!==x.taxCodeId).map(t=><option key={t.id} value={t.id}>{t.code} · {t.nameFr}</option>)}</select></F><F label="Assiette des taxes" help="Le cumul séquentiel exige une règle fiscale approuvée."><select className={select} value={x.taxCalculationMode} onChange={e=>item(n,"taxCalculationMode",e.target.value)}><option value="NET">Même assiette nette</option><option value="SEQUENTIAL">Cumul séquentiel autorisé</option></select></F><F label="Justificatif fiscal" help="Référence légale pour exonération, taux zéro ou cumul séquentiel."><Input value={x.taxEvidenceReference} onChange={e=>item(n,"taxEvidenceReference",e.target.value)} placeholder="Décision / document fiscal" /></F></div>)}<Button type="button" variant="outline" onClick={()=>change("items",[...form.items,newItem()])}><Plus/>Ajouter une ligne</Button></Section><Section title="Remise et total"><Grid><F label="Remise globale" help="Montant déduit du sous-total."><Input type="number" min="0" value={form.discountAmount} onChange={e=>change("discountAmount",e.target.value)}/></F><F label="Motif de remise" help="Obligatoire lorsqu’une remise est accordée."><Input value={form.discountReason} onChange={e=>change("discountReason",e.target.value)}/></F><F label="Taxe" help="Montant calculé par les codes fiscaux des lignes. Laissez 0 pour le calcul automatique."><Input type="number" min="0" value={form.taxAmount} onChange={e=>change("taxAmount",e.target.value)}/></F><F label="Part assurance" help="Montant couvert, sans créer de fausse prise en charge."><Input type="number" min="0" value={form.insuranceAmount} onChange={e=>change("insuranceAmount",e.target.value)}/></F></Grid></Section><Button disabled={saving} className="bg-[#002b5b] text-white"><ReceiptText/>Créer la facture</Button></form>}
function Detail({invoice,permissions,action}:{invoice:Invoice;permissions:Permissions;action:(k:string)=>void}){return <div className="grid gap-4"><div className="flex flex-wrap gap-2">{permissions.canIssue&&invoice.status==="DRAFT"&&<Button onClick={()=>action("issue")}>Émettre</Button>}{permissions.canRecordPayment&&invoice.balanceAmount>0&&!["DRAFT","CANCELLED"].includes(invoice.status)&&<Button onClick={()=>action("payment")}>Enregistrer paiement</Button>}{permissions.canCancel&&!["PAID","CANCELLED"].includes(invoice.status)&&<Button variant="outline" onClick={()=>action("cancel")}>Annuler</Button>}</div><Section title="Résumé"><Grid>{[["Patient",`${invoice.patient.patientNumber} · ${invoice.patient.fullName}`],["Statut",STATUS[invoice.status]],["Type",TYPES[invoice.invoiceType]],["Total",`${invoice.totalAmount} ${invoice.currency}`],["Payé",`${invoice.paidAmount} ${invoice.currency}`],["Solde",`${invoice.balanceAmount} ${invoice.currency}`],["Créé par",invoice.createdBy.name]].map(([l,v])=><Info key={l} label={l} value={v||"Non renseigné"}/>)}</Grid></Section><Section title="Lignes">{invoice.items.map(i=><Info key={i.id} label={i.description} value={`${i.quantity} × ${i.unitPrice} - ${i.discountAmount} = ${i.totalAmount} ${invoice.currency}`}/>)}</Section><Section title="Paiements">{invoice.payments.map(p=><Info key={p.id} label={p.receiptNumber} value={`${p.amount} ${invoice.currency} · ${PAYMENTS[p.paymentMethod]||p.paymentMethod}`}/>) }{!invoice.payments.length&&<Empty text="Aucun paiement enregistré."/ >}</Section><Section title="Historique">{invoice.events.map(e=><Info key={e.id} label={e.actor.name} value={`${e.summary} · ${new Date(e.createdAt).toLocaleString("fr-FR")}`}/>)}</Section></div>}
function F({label,help,children}:{label:string;help:string;children:ReactNode}){return <label className="grid min-w-0 gap-1"><span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{label}<span title={help} aria-label={`${label} : ${help}`}><CircleHelp className="h-3.5 w-3.5"/></span></span>{children}</label>}function Choice({value,set,options,all,label}:{value:string;set:(v:string)=>void;options:Record<string,string>;all?:string;label?:string}){return <select aria-label={label} className={select} value={value} onChange={e=>set(e.target.value)}>{all&&<option value="">{all}</option>}{Object.entries(options).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}function Select({value,set,rows,label,required}:{value:string;set:(v:string)=>void;rows:Ref[];label:(r:Ref)=>string;required?:boolean}){return <select required={required} className={select} value={value} onChange={e=>set(e.target.value)}><option value="">Sélectionner...</option>{rows.map(r=><option key={r.id} value={r.id}>{label(r)}</option>)}</select>}function Section({title,children}:{title:string;children:ReactNode}){return <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><h4 className="font-black text-cyan-600">{title}</h4>{children}</section>}function Grid({children}:{children:ReactNode}){return <div className="grid min-w-0 gap-3 md:grid-cols-2">{children}</div>}function Info({label,value}:{label:string;value:string}){return <article className="rounded-xl bg-dtsc-surface p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{label}</p><p className="break-words text-sm font-bold">{value}</p></article>}function Empty({text}:{text:string}){return <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{text}</p>}const select="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm",area="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm";
