"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type Balance = { id: string; revision: number; stockLotId: string | null; quantityOnHand: string | number; quantityReserved: string | number; warehouse: { code: string; name: string }; storageLocation: { code: string; name: string } | null };
export type HistoricalInventoryItem = { id: string; revision: number; catalogItem: { code: string; name: string }; expiryTracking: boolean; balances?: Balance[] };
type Row = { lotNumber: string; quantity: string; productionDate: string; expiryDate: string };
const blank = (): Row => ({ lotNumber: "", quantity: "", productionDate: "", expiryDate: "" });
const copy = {
  fr: { title: "Régulariser le stock historique", help: "Répartissez uniquement les unités déjà présentes, d’après les numéros de lots réellement observés. Aucun achat, entrée supplémentaire ou coût nouveau ne sera créé.", source: "Stock à répartir", choose: "Sélectionner un dépôt et emplacement", units: "Unités en stock", assigned: "Répartition", outstanding: "Reste à répartir", lot: "Numéro réel du lot", qty: "Quantité", manufactured: "Fabrication", expires: "Péremption", add: "Ajouter un lot", remove: "Enlever ce lot", reason: "Motif et preuve d’identification", approver: "Validateur indépendant", submit: "Soumettre pour validation", cancel: "Annuler", pending: "Soumission…", invalid: "La somme des quantités doit couvrir exactement le stock, sans doublon. Renseignez le validateur distinct.", success: "Régularisation soumise", failure: "Régularisation non soumise", completed: "Une fois approuvée, la répartition ne changera ni les quantités globales ni la valorisation. Activez les règles de traçabilité après régularisation de tous les dépôts." },
  en: { title: "Allocate historical stock", help: "Allocate only existing units using actual physically verified batch numbers. No purchase, extra stock entry or new cost will be created.", source: "Balance to allocate", choose: "Choose a warehouse and location", units: "Units on hand", assigned: "Allocated", outstanding: "Remaining", lot: "Actual batch number", qty: "Quantity", manufactured: "Manufactured", expires: "Expiry", add: "Add batch", remove: "Remove batch", reason: "Reason and evidence of identification", approver: "Independent approver", submit: "Submit for approval", cancel: "Cancel", pending: "Submitting…", invalid: "Batch quantities must exactly match the balance without duplicates. Select an independent approver.", success: "Allocation submitted", failure: "Allocation not submitted", completed: "Once approved, total quantity and valuation remain unchanged. Enable traceability after allocating all warehouse balances." },
} as const;

export function InventoryHistoricalLotDialog({ organizationId, locale, item, onClose, onSubmitted }: { organizationId: string; locale: "fr" | "en"; item: HistoricalInventoryItem; onClose: () => void; onSubmitted: (result: { id: string; reference: string }) => void }) {
  const t = copy[locale];
  const eligible = (item.balances || []).filter((balance) => !balance.stockLotId && Number(balance.quantityOnHand) > 0);
  const [sourceId, setSourceId] = useState(eligible.length === 1 ? eligible[0].id : "");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const source = eligible.find((balance) => balance.id === sourceId);
  const amount = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const remaining = Number(source?.quantityOnHand || 0) - amount;
  const balanced = Boolean(source && Math.abs(remaining) < 0.0000001 && !Number(source.quantityReserved));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !source) return;
    const form = new FormData(event.currentTarget);
    const approverUserId = String(form.get("approverUserId") || "");
    if (!balanced || !approverUserId || rows.some((row) => !row.lotNumber.trim() || !/^\d{1,15}(\.\d{1,3})?$/.test(row.quantity) || Number(row.quantity) <= 0 || (item.expiryTracking && !row.expiryDate)) || new Set(rows.map((row) => row.lotNumber.trim())).size !== rows.length) { setError(t.invalid); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/inventory/item-policy`, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale }, body: JSON.stringify({ sourceBalanceId: source.id, sourceBalanceRevision: source.revision, itemRevision: item.revision, approverUserId, idempotencyKey: key, reason: String(form.get("reason") || "").trim(), allocations: rows.map((row) => ({ lotNumber: row.lotNumber.trim(), quantity: row.quantity, productionDate: row.productionDate || null, expiryDate: row.expiryDate || null })) }) });
      const result = await response.json().catch(() => null) as { approvalId?: string; reference?: string; message?: string } | null;
      if (!response.ok || !result?.approvalId || !result.reference) throw new Error(result?.message || t.failure);
      notifyToast({ title: t.success, description: result.reference, tone: "success" });
      onSubmitted({ id: result.approvalId, reference: result.reference });
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); notifyToast({ title: t.failure, description: message, tone: "error" }); }
    finally { setBusy(false); }
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={t.title} description={item.catalogItem.code + " · " + item.catalogItem.name} presentation="editor" className="max-w-3xl">
    <form onSubmit={submit} className="grid min-w-0 gap-3 p-2">
      <p className="text-sm text-dtsc-muted">{t.help}</p>
      <label className="grid gap-1 text-sm font-semibold">{t.source} *<select value={sourceId} required disabled={busy} onChange={(event) => { setSourceId(event.target.value); setRows([blank()]); setError(""); }} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2"><option value="">{t.choose}</option>{eligible.map((balance) => <option key={balance.id} value={balance.id} disabled={Number(balance.quantityReserved) !== 0}>{balance.warehouse.code} · {balance.warehouse.name}{balance.storageLocation ? " / " + balance.storageLocation.name : ""} · {balance.quantityOnHand}</option>)}</select></label>
      {source ? <div className="grid grid-cols-3 gap-2">{[[t.units, Number(source.quantityOnHand)], [t.assigned, amount], [t.outstanding, remaining]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-2"><p className="break-words text-xs text-dtsc-muted">{label}</p><p className="break-words font-bold">{typeof value === "number" ? value.toLocaleString(locale, { maximumFractionDigits: 3 }) : value}</p></div>)}</div> : null}
      {rows.map((row, index) => <div key={index} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border p-3 sm:grid-cols-2">
        {([["lotNumber", t.lot, "text"], ["quantity", t.qty, "number"], ["productionDate", t.manufactured, "date"], ["expiryDate", t.expires, "date"]] as const).map(([field, label, type]) => <label key={field} className="grid gap-1 text-xs font-semibold text-dtsc-muted">{label}{field === "lotNumber" || field === "quantity" || (field === "expiryDate" && item.expiryTracking) ? " *" : ""}<Input type={type} required={field === "lotNumber" || field === "quantity" || (field === "expiryDate" && item.expiryTracking)} maxLength={field === "lotNumber" ? 120 : undefined} min={type === "number" ? "0.001" : undefined} step={type === "number" ? "0.001" : undefined} value={row[field]} disabled={busy} onChange={(event) => { const value = event.target.value; setRows((old) => old.map((entry, rowIndex) => index === rowIndex ? { ...entry, [field]: value } : entry)); }} /></label>)}
        <Button type="button" variant="outline" disabled={busy || rows.length <= 1} className="sm:col-span-2" onClick={() => setRows((old) => old.filter((_, rowIndex) => rowIndex !== index))}>{t.remove}</Button>
      </div>)}
      <Button type="button" variant="outline" disabled={busy || rows.length >= 100} onClick={() => setRows((old) => [...old, blank()])}>{t.add}</Button>
      <label className="grid gap-1 text-sm font-semibold">{t.reason} *<textarea name="reason" required minLength={5} maxLength={2000} disabled={busy} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm" /></label>
      <EnterpriseApproverSelect organizationId={organizationId} moduleCode="INVENTORY_LOGISTICS" locale={locale} label={t.approver} disabled={busy} />
      <p className="text-xs text-dtsc-muted">{t.completed}</p>
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t.cancel}</Button><Button type="submit" disabled={busy || !balanced}>{busy ? t.pending : t.submit}</Button></div>
    </form>
  </Dialog>;
}
