"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Archive, Ban, CircleHelp, Eye, LockKeyhole, Pencil, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { PHARMACY_BATCH_LABELS, PHARMACY_BATCH_MANUAL_STATUSES, PHARMACY_BATCH_STATUSES, PHARMACY_BATCH_STORAGE_CONDITIONS } from "@/lib/pharmacy-batch-options";
import { PHARMACY_CURRENCIES, PHARMACY_PRODUCT_LABELS, PHARMACY_PRODUCT_UNITS } from "@/lib/pharmacy-products";

type Product = { id: string; name: string; genericName: string | null; internalCode: string; category: string; pharmaceuticalForm: string; dosage: string | null; stockUnit: string; defaultLocation: string | null; shelf: string | null; storageType: string | null; tempMin: string | null; tempMax: string | null; refrigerated: boolean; currency: string };
type Member = { id: string; name: string; email: string };
type Supplier = { id: string; title: string };
type Movement = { id: string; movementType: string; quantity: string; quantityBefore: string | null; quantityAfter: string | null; reason: string; createdAt: string };
type Batch = Record<string, unknown> & { id: string; productId: string; batchNumber: string; expiryDate: string; manufacturingDate: string | null; receivedQuantity: string; availableQuantity: string; reservedQuantity: string; damagedQuantity: string; unit: string; location: string | null; supplierId: string | null; effectiveStatus: string; status: string; notes: string | null; createdAt: string; updatedAt: string; product: Product; stockMovements: Movement[]; createdBy?: { name: string; email: string } };
type ActionName = "quarantine" | "release-quarantine" | "recall" | "block" | "cancel";

const textFields = ["batchNumber", "serialNumber", "barcode", "internalReference", "manufacturerReference", "location", "shelf", "zone", "storageNotes", "supplierInvoiceRef", "deliveryNoteRef", "statusReason", "notes"] as const;
const numberFields = ["receivedQuantity", "availableQuantity", "reservedQuantity", "damagedQuantity", "minQuantityAlert", "expiryAlertDays", "tempMin", "tempMax", "purchasePrice", "salePrice"] as const;
const FIELD_HELP: Record<string, string> = {
  productId: "Produit actif du référentiel Produits & médicaments de cette pharmacie.",
  batchNumber: "Numéro attribué par le fabricant pour tracer cette entrée physique.",
  expiryDate: "Après cette date, le lot est automatiquement non vendable.",
  receivedQuantity: "Quantité totale entrée lors de la réception initiale.",
  availableQuantity: "Quantité réellement disponible pour une future sortie ou vente.",
  reservedQuantity: "Quantité déjà réservée, non disponible pour une autre sortie.",
  damagedQuantity: "Quantité isolée en raison d'une détérioration.",
  expiryAlertDays: "Nombre de jours avant péremption déclenchant l'alerte pour ce lot.",
  purchasePrice: "Coût d'achat d'une unité de stock de ce lot.",
  status: "Un statut de sécurité manuel reste prioritaire sur les statuts automatiques.",
};
const emptyForm = {
  productId: "", supplierId: "", purchaseOrderId: "", receiptId: "", batchNumber: "", serialNumber: "", barcode: "", internalReference: "", manufacturerReference: "",
  manufacturingDate: "", expiryDate: "", receivedAt: "", stockEntryDate: "", receivedById: "", receivedQuantity: "1", availableQuantity: "1", reservedQuantity: "0", damagedQuantity: "0",
  unit: "UNIT", minQuantityAlert: "", expiryAlertDays: "90", location: "", shelf: "", zone: "", storageConditions: "AMBIENT", tempMin: "", tempMax: "", storageNotes: "",
  purchasePrice: "", salePrice: "", currency: "USD", status: "ACTIVE", quarantine: false, recall: false, quarantineReason: "", recallReason: "", recallDate: "", statusReason: "",
  decisionResponsibleId: "", supplierInvoiceRef: "", deliveryNoteRef: "", qualityDocumentUrl: "", supplierInvoiceUrl: "", deliveryNoteUrl: "", certificateUrl: "", notes: "",
};
type BatchForm = typeof emptyForm;

export function PharmacyBatchesWorkspace({ organizationId }: { organizationId: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [detail, setDetail] = useState<Batch | null>(null);
  const [form, setForm] = useState<BatchForm>(emptyForm);
  const [status, setStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [expiry, setExpiry] = useState("");
  const [location, setLocation] = useState("");
  const [actionRequest, setActionRequest] = useState<{ batch: Batch; name: ActionName } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/batches?pageSize=100`);
    const body = (await response.json().catch(() => null)) as { batches?: Batch[]; products?: Product[]; members?: Member[]; suppliers?: Supplier[]; purchaseOrders?: Supplier[]; receipts?: Supplier[]; message?: string } | null;
    setBatches(body?.batches || []); setProducts(body?.products || []); setMembers(body?.members || []); setSuppliers(body?.suppliers || []); setPurchaseOrders(body?.purchaseOrders || []); setReceipts(body?.receipts || []);
    if (!response.ok) setMessage(body?.message || "Chargement des lots impossible.");
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => batches.filter((batch) =>
    (!status || batch.effectiveStatus === status)
    && (!productId || batch.productId === productId)
    && (!location || String(batch.location || "").toLocaleLowerCase("fr").includes(location.toLocaleLowerCase("fr")))
    && (!expiry || (expiry === "expired" ? batch.effectiveStatus === "EXPIRED" : batch.effectiveStatus === "NEAR_EXPIRY"))
  ), [batches, expiry, location, productId, status]);
  const list = useSmartList({ items: filtered, pageSize: 12, getSearchText: useCallback((batch: Batch) => `${batch.product.name} ${batch.product.genericName || ""} ${batch.product.internalCode} ${batch.batchNumber} ${batch.location || ""}`, []) });

  function change(key: keyof BatchForm, value: string | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  function selectProduct(id: string) {
    const product = products.find((item) => item.id === id);
    setForm((current) => ({ ...current, productId: id, unit: product?.stockUnit || current.unit, location: product?.defaultLocation || current.location, shelf: product?.shelf || current.shelf, storageConditions: product?.storageType || current.storageConditions, tempMin: product?.tempMin || current.tempMin, tempMax: product?.tempMax || current.tempMax, currency: product?.currency || current.currency }));
  }
  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setFormOpen(true); setMessage(""); }
  function openEdit(batch: Batch) {
    const next = { ...emptyForm };
    for (const key of Object.keys(next) as Array<keyof BatchForm>) {
      const value = batch[key];
      if (typeof next[key] === "boolean") Object.assign(next, { [key]: value === true });
      else Object.assign(next, { [key]: value === null || value === undefined ? "" : String(value).slice(0, key.toLowerCase().includes("date") || key.endsWith("At") ? 10 : undefined) });
    }
    setEditing(batch); setForm(next); setFormOpen(true); setMessage("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = editing ? `/api/enterprise/${organizationId}/pharmacy/batches/${editing.id}` : `/api/enterprise/${organizationId}/pharmacy/batches`;
    const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Lot enregistré et traçabilité mise à jour." : body?.message || "Enregistrement impossible.");
    if (response.ok) { setFormOpen(false); await load(); }
  }
  async function runAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionRequest) return;
    const response = await fetch(`/api/enterprise/${organizationId}/pharmacy/batches/${actionRequest.batch.id}/${actionRequest.name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: actionReason }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Action de sécurité enregistrée et historisée." : body?.message || "Action impossible.");
    if (response.ok) { setActionRequest(null); setActionReason(""); await load(); }
  }
  return <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black text-dtsc-ink">Lots & péremptions</h3><p className="text-sm text-dtsc-muted">Traçabilité réelle des quantités, péremptions, quarantaines, rappels et mouvements.</p></div><Button type="button" onClick={openCreate} className="rounded-xl bg-[#002b5b] text-white"><Plus className="h-4 w-4" />Nouveau lot</Button></div>
    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><Filter value={productId} onChange={setProductId} label="Tous les produits" options={products.map((product) => [product.id, product.name])} /><Filter value={status} onChange={setStatus} label="Tous les statuts" options={PHARMACY_BATCH_STATUSES.map((item) => [item, label(item)])} /><Filter value={expiry} onChange={setExpiry} label="Toutes les péremptions" options={[["near", "Péremption proche"], ["expired", "Lots expirés"]]} /><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Filtrer par emplacement..." /></div>
    <div className="mt-3"><ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} placeholder="Produit, code, numéro de lot..." onPageChange={list.setPage} /></div>
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.paginatedItems.map((batch) => <BatchCard key={batch.id} batch={batch} actions={batchActions(batch, setDetail, openEdit, setActionRequest)} />)}
      {!loading && !list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun lot n&apos;est encore enregistré. Les lots seront utilisés pour suivre les quantités, les péremptions et la traçabilité des produits.</p>}
      {loading && <p className="text-sm font-bold text-dtsc-muted">Chargement des lots...</p>}
    </div>
    {message && <p className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
    <Dialog open={formOpen} title={editing ? "Modifier lot" : "Nouveau lot"} description="Formulaire plein écran, isolé dans la pharmacie active." onClose={() => setFormOpen(false)} className="h-[94dvh] max-w-6xl"><form onSubmit={save} className="grid gap-4">
      <Section title="Produit concerné"><Grid><Choice field="productId" form={form} labelText="Produit" options={products.map((product) => [product.id, `${product.name} · ${product.internalCode}`])} change={(_, value) => selectProduct(String(value))} required />{form.productId && <ReadOnlyProduct product={products.find((product) => product.id === form.productId)} />}</Grid></Section>
      <Section title="Identification du lot"><Grid>{textFields.slice(0, 5).map((field) => <TextField key={field} field={field} form={form} change={change} required={field === "batchNumber"} />)}</Grid></Section>
      <Section title="Quantités"><Grid>{numberFields.slice(0, 6).map((field) => <NumberField key={field} field={field} form={form} change={change} required={field === "receivedQuantity" || field === "availableQuantity"} />)}<Choice field="unit" form={form} labelText="Unité de stock" options={PHARMACY_PRODUCT_UNITS.map((item) => [item, label(item)])} change={change} required /></Grid></Section>
      <Section title="Fournisseur et origine"><Grid><Choice field="supplierId" form={form} labelText="Fournisseur" options={suppliers.map((supplier) => [supplier.id, supplier.title])} change={change} /><Choice field="purchaseOrderId" form={form} labelText="Commande fournisseur" options={purchaseOrders.map((order) => [order.id, order.title])} change={change} /><Choice field="receiptId" form={form} labelText="Réception liée" options={receipts.map((receipt) => [receipt.id, receipt.title])} change={change} /><Choice field="receivedById" form={form} labelText="Reçu par" options={members.map((member) => [member.id, member.name])} change={change} /><TextField field="supplierInvoiceRef" form={form} change={change} /><TextField field="deliveryNoteRef" form={form} change={change} /></Grid></Section>
      <Section title="Dates et péremption"><Grid><DateField field="manufacturingDate" form={form} change={change} /><DateField field="expiryDate" form={form} change={change} required /><DateField field="receivedAt" form={form} change={change} /><DateField field="stockEntryDate" form={form} change={change} /></Grid></Section>
      <Section title="Stockage"><Grid>{textFields.slice(5, 9).map((field) => <TextField key={field} field={field} form={form} change={change} />)}<Choice field="storageConditions" form={form} labelText="Conditions de conservation" options={PHARMACY_BATCH_STORAGE_CONDITIONS.map((item) => [item, label(item)])} change={change} />{numberFields.slice(6, 8).map((field) => <NumberField key={field} field={field} form={form} change={change} />)}</Grid></Section>
      <Section title="Prix du lot"><Grid>{numberFields.slice(8).map((field) => <NumberField key={field} field={field} form={form} change={change} />)}<Choice field="currency" form={form} labelText="Devise" options={PHARMACY_CURRENCIES.map((item) => [item, item])} change={change} /><ReadOnly value={form.purchasePrice ? `${Number(form.receivedQuantity || 0) * Number(form.purchasePrice || 0)} ${form.currency}` : "Non calculé"} labelText="Coût total calculé" /></Grid></Section>
      <Section title="Statut et sécurité"><Grid><Choice field="status" form={form} labelText="Statut manuel" options={PHARMACY_BATCH_MANUAL_STATUSES.map((item) => [item, label(item)])} change={change} /><Choice field="decisionResponsibleId" form={form} labelText="Responsable de la décision" options={members.map((member) => [member.id, member.name])} change={change} /><TextField field="statusReason" form={form} change={change} /></Grid></Section>
      <Section title="Notes et documents"><p className="text-xs font-semibold text-dtsc-muted">Les documents qualité doivent être téléversés via le stockage privé existant. Aucun champ de faux téléversement n&apos;est proposé ici.</p><TextField field="notes" form={form} change={change} /></Section>
      <div className="flex flex-wrap gap-3"><Button className="rounded-xl bg-[#002b5b] text-white">Enregistrer</Button><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button></div>
    </form></Dialog>
    <Dialog open={Boolean(detail)} title={detail ? `Détail lot ${detail.batchNumber}` : "Détail lot"} description="Quantités, sécurité et historique du lot." onClose={() => setDetail(null)} className="h-[94dvh] max-w-5xl">{detail && <BatchDetail batch={detail} />}</Dialog>
    <Dialog open={Boolean(actionRequest)} title={actionTitle(actionRequest?.name)} description="Cette action sensible sera persistée et historisée." onClose={() => setActionRequest(null)}><form onSubmit={runAction} className="grid gap-4"><Field labelText="Motif obligatoire" hint="Explique la décision afin de préserver la traçabilité qualité."><textarea required minLength={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} className="min-h-32 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><div className="flex gap-3"><Button className="bg-[#002b5b] text-white">Confirmer</Button><Button type="button" variant="outline" onClick={() => setActionRequest(null)}>Annuler</Button></div></form></Dialog>
  </section>;
}

function BatchCard({ batch, actions }: { batch: Batch; actions: ActionMenuItem[] }) { const status = batch.effectiveStatus || batch.status; const lowQuantity = Number(batch.minQuantityAlert || 0) > 0 && Number(batch.availableQuantity) <= Number(batch.minQuantityAlert); return <article className="dtsc-glass-list-item rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><StatusBadge status={status} /><h4 className="mt-2 truncate font-black text-dtsc-ink">{batch.product.name}</h4><p className="mt-1 text-xs text-dtsc-muted">Lot {batch.batchNumber} · {batch.product.genericName || batch.product.internalCode}</p></div><ActionMenu label="Actions du lot" items={actions} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Stat labelText="Péremption" value={formatDate(batch.expiryDate)} /><Stat labelText="Disponible" value={`${batch.availableQuantity} ${label(batch.unit)}`} /><Stat labelText="Reçue" value={String(batch.receivedQuantity)} /><Stat labelText="Emplacement" value={batch.location || "Non défini"} /></div>{(["EXPIRED", "RECALLED", "QUARANTINED", "BLOCKED", "NEAR_EXPIRY"].includes(status) || lowQuantity) && <p className="mt-3 rounded-xl bg-amber-400/15 p-2 text-xs font-black text-amber-700">{status === "NEAR_EXPIRY" ? "Ce lot approche de sa date de péremption." : lowQuantity && status === "ACTIVE" ? "La quantité disponible de ce lot est faible." : "Ce lot n'est pas disponible à la vente."}</p>}</article>; }
function batchActions(batch: Batch, detail: (batch: Batch) => void, edit: (batch: Batch) => void, action: (value: { batch: Batch; name: ActionName }) => void): ActionMenuItem[] { const items: ActionMenuItem[] = [{ key: "view", label: "Voir le détail", icon: Eye, onSelect: () => detail(batch) }, { key: "edit", label: "Modifier le lot", icon: Pencil, onSelect: () => edit(batch) }]; if (batch.effectiveStatus === "QUARANTINED") items.push({ key: "release", label: "Lever la quarantaine", icon: ShieldCheck, onSelect: () => action({ batch, name: "release-quarantine" }) }); else items.push({ key: "quarantine", label: "Mettre en quarantaine", icon: ShieldAlert, onSelect: () => action({ batch, name: "quarantine" }) }); items.push({ key: "recall", label: "Marquer comme rappelé", icon: Ban, onSelect: () => action({ batch, name: "recall" }) }, { key: "block", label: "Bloquer le lot", icon: LockKeyhole, onSelect: () => action({ batch, name: "block" }) }, { key: "cancel", label: "Annuler le lot", icon: Archive, destructive: true, onSelect: () => action({ batch, name: "cancel" }) }); return items; }
function BatchDetail({ batch }: { batch: Batch }) { const [tab, setTab] = useState("Fiche"); const tabs = ["Fiche", "Mouvements stock", "Ventes liées", "Réceptions liées", "Ajustements", "Alertes", "Incidents qualité", "Documents", "Historique"]; return <div className="space-y-4"><div className="flex gap-2 overflow-x-auto pb-2">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${tab === item ? "border-emerald-400 bg-emerald-400/15 text-emerald-700" : "border-dtsc-border text-dtsc-muted"}`}>{item}</button>)}</div>{tab === "Fiche" ? <div className="grid gap-3 md:grid-cols-2"><Stat labelText="Produit" value={batch.product.name} /><Stat labelText="Numéro de lot" value={batch.batchNumber} /><Stat labelText="Statut" value={label(batch.effectiveStatus)} /><Stat labelText="Péremption" value={formatDate(batch.expiryDate)} /><Stat labelText="Quantité reçue" value={batch.receivedQuantity} /><Stat labelText="Quantité disponible" value={batch.availableQuantity} /><Stat labelText="Notes" value={batch.notes || "Aucune note"} /><Stat labelText="Créé par" value={batch.createdBy?.name || "Utilisateur autorisé"} /></div> : tab === "Mouvements stock" || tab === "Historique" ? <div className="grid gap-2">{batch.stockMovements.length ? batch.stockMovements.map((movement) => <div key={movement.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><p className="font-black text-dtsc-ink">{label(movement.movementType)} · {movement.quantity}</p><p className="text-xs text-dtsc-muted">{movement.reason} · {formatDate(movement.createdAt)}</p></div>) : <EmptyTab tab={tab} />}</div> : <EmptyTab tab={tab} />}</div>; }
function EmptyTab({ tab }: { tab: string }) { return <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucune donnée liée dans « {tab} » pour ce lot.</p>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-600">{title}</h3>{children}</section>; }
function Grid({ children }: { children: ReactNode }) { return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>; }
function Field({ labelText, hint, children }: { labelText: string; hint?: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-black text-dtsc-ink"><span className="flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-dtsc-muted">{labelText}{hint && <span tabIndex={0} title={hint}><CircleHelp className="h-3.5 w-3.5" /></span>}</span>{children}</label>; }
function TextField({ field, form, change, required = false, labelText }: { field: keyof BatchForm; form: BatchForm; change: (key: keyof BatchForm, value: string | boolean) => void; required?: boolean; labelText?: string }) { return <Field labelText={labelText || fieldLabel(field)} hint={FIELD_HELP[field]}><Input value={String(form[field])} onChange={(event) => change(field, event.target.value)} required={required} /></Field>; }
function NumberField({ field, form, change, required = false }: { field: keyof BatchForm; form: BatchForm; change: (key: keyof BatchForm, value: string | boolean) => void; required?: boolean }) { return <Field labelText={fieldLabel(field)} hint={FIELD_HELP[field]}><Input type="number" step="any" min="0" value={String(form[field])} onChange={(event) => change(field, event.target.value)} required={required} /></Field>; }
function DateField({ field, form, change, required = false }: { field: keyof BatchForm; form: BatchForm; change: (key: keyof BatchForm, value: string | boolean) => void; required?: boolean }) { return <Field labelText={fieldLabel(field)} hint={FIELD_HELP[field]}><Input type="date" value={String(form[field])} onChange={(event) => change(field, event.target.value)} required={required} /></Field>; }
function Choice({ field, form, labelText, options, change, required = false }: { field: keyof BatchForm; form: BatchForm; labelText: string; options: Array<readonly [string, string]>; change: (key: keyof BatchForm, value: string | boolean) => void; required?: boolean }) { return <Field labelText={labelText} hint={FIELD_HELP[field]}><select value={String(form[field])} onChange={(event) => change(field, event.target.value)} required={required} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="">Sélectionner...</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>; }
function Filter({ value, onChange, label: placeholder, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<readonly [string, string]> }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold"><option value="">{placeholder}</option>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select>; }
function ReadOnlyProduct({ product }: { product?: Product }) { return product ? <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-xs text-dtsc-muted"><p className="font-black text-dtsc-ink">{label(product.category)} · {label(product.pharmaceuticalForm)} {product.dosage || ""}</p><p>Unité de stock : {label(product.stockUnit)}{product.refrigerated ? " · Produit réfrigéré" : ""}</p></div> : null; }
function ReadOnly({ labelText, value }: { labelText: string; value: string }) { return <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="text-xs font-black uppercase text-dtsc-muted">{labelText}</p><p className="mt-1 font-bold text-dtsc-ink">{value}</p></div>; }
function Stat({ labelText, value }: { labelText: string; value: string }) { return <div className="rounded-xl bg-dtsc-page p-2"><p className="text-[0.68rem] font-black uppercase text-dtsc-muted">{labelText}</p><p className="mt-1 break-words font-bold text-dtsc-ink">{value}</p></div>; }
function StatusBadge({ status }: { status: string }) { const alert = ["EXPIRED", "RECALLED", "BLOCKED"].includes(status); return <span className={`inline-flex rounded-full px-2 py-1 text-[0.68rem] font-black uppercase ${alert ? "bg-red-500/15 text-red-600" : status === "QUARANTINED" || status === "NEAR_EXPIRY" ? "bg-amber-400/15 text-amber-700" : "bg-emerald-400/15 text-emerald-700"}`}>{label(status)}</span>; }
function fieldLabel(field: string) { const labels: Record<string, string> = { batchNumber: "Numéro de lot", serialNumber: "Numéro de série", barcode: "Code-barres du lot", internalReference: "Référence interne", manufacturerReference: "Référence fabricant", receivedQuantity: "Quantité reçue", availableQuantity: "Quantité disponible", reservedQuantity: "Quantité réservée", damagedQuantity: "Quantité endommagée", minQuantityAlert: "Seuil d'alerte quantité", expiryAlertDays: "Alerte péremption (jours)", manufacturingDate: "Date de fabrication", expiryDate: "Date de péremption", receivedAt: "Date de réception", stockEntryDate: "Date d'entrée en stock", location: "Emplacement", shelf: "Rayon", zone: "Zone", storageNotes: "Notes de stockage", tempMin: "Température minimale", tempMax: "Température maximale", purchasePrice: "Prix d'achat unitaire", salePrice: "Prix de vente conseillé", supplierInvoiceRef: "Référence facture fournisseur", deliveryNoteRef: "Référence bon de livraison", statusReason: "Motif du statut", notes: "Notes internes" }; return labels[field] || "Information du lot"; }
function label(value: unknown) { return PHARMACY_BATCH_LABELS[String(value)] || PHARMACY_PRODUCT_LABELS[String(value)] || String(value).replaceAll("_", " ").toLocaleLowerCase("fr"); }
function formatDate(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)); }
function actionTitle(action?: ActionName) { return action === "quarantine" ? "Mettre le lot en quarantaine" : action === "release-quarantine" ? "Lever la quarantaine" : action === "recall" ? "Rappeler le lot" : action === "cancel" ? "Annuler le lot" : "Bloquer le lot"; }
