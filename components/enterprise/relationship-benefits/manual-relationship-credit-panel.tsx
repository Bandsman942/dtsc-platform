"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { notifyToast } from "@/lib/client-toast";
import { ModuleSection } from "@/components/workspace/module-workspace";

type Benefit = { id: string; benefitType: string; status: string; nameFr: string; nameEn: string; valueDecimal: number | null; currencyCode: string | null };
type Usage = { id: string; benefitId: string; executionMode: string; status: string; revision: number; personName: string | null; requestedAt: string; effectAmount: number | null; effectCurrencyCode: string | null };
type Customer = { identityLinkId: string; businessPartyId: string; customerName: string };
type Document = { id: string; title: string; currentVersion: number; status: string };

export function ManualRelationshipCreditPanel({ organizationId, english, canManage, benefits, usages, onChanged }: {
  organizationId: string; english: boolean; canManage: boolean; benefits: Benefit[]; usages: Usage[]; onChanged: () => Promise<void>;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingIdempotencyKey = useRef<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const active = benefits.filter((b) => b.benefitType === "CREDIT" && b.status === "ACTIVE");
  const items = usages.filter((usage) => usage.executionMode === "MANUAL_RETAIL_CREDIT");
  useEffect(() => {
    if (!canManage) return;
    let mounted = true;
    void Promise.all([
      fetch(`/api/enterprise/${organizationId}/relationship-benefits/credits`, { cache: "no-store" }),
      fetch(`/api/enterprise/${organizationId}/documents?pageSize=50`, { cache: "no-store" }),
    ]).then(async ([a, b]) => {
      const [c, d] = await Promise.all([a.json(), b.json()]);
      if (!a.ok || !b.ok) throw new Error(c.message || d.message || "Access denied");
      if (mounted) {
        setCustomers(c.items || []);
        setDocuments((d.items || []).filter((item: Document) => item.currentVersion > 0 && item.status === "ACTIVE" && item.id));
      }
    }).catch((e) => { if (mounted) setError(e instanceof Error ? e.message : "Unavailable"); });
    return () => { mounted = false; };
  }, [organizationId, canManage]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const selected = customers[Number(values.get("client"))];
    if (!selected || busy) return;
    pendingIdempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/relationship-benefits/credits`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          benefitId: values.get("benefit"), identityLinkId: selected.identityLinkId,
          businessPartyId: selected.businessPartyId, documentId: values.get("evidence"),
          reason: values.get("reason"), idempotencyKey: pendingIdempotencyKey.current,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Request failed");
      await onChanged();
      pendingIdempotencyKey.current = null;
      form.reset();
      notifyToast(data?.message || "Request recorded", "success");
    } catch (e) {
      notifyToast(e instanceof Error ? e.message : "Request failed", "error");
    } finally { setBusy(false); }
  }

  async function decide(usage: Usage, decision: "APPROVE" | "REJECT" | "REVERSE") {
    const reason = (reasons[usage.id] || "").trim();
    if (reason.length < 10) {
      notifyToast(english ? "Please explain the decision (10 characters minimum)." : "Précisez le motif de la décision (10 caractères minimum).", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/relationship-benefits/credits/${usage.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, revision: usage.revision, reason }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "Decision failed");
      await onChanged();
      setReasons((old) => ({ ...old, [usage.id]: "" }));
      notifyToast(result?.message || "Decision recorded", "success");
    } catch (e) {
      notifyToast(e instanceof Error ? e.message : "Decision failed", "error");
    } finally { setBusy(false); }
  }

  if (!canManage) return null;
  return <ModuleSection title={english ? "Manual store credit" : "Crédit magasin manuel"}
    description={english ? "A documented request must be validated by a different Finance approver before customer credit is issued." : "Une demande documentée est validée par un autre responsable Finance avant tout crédit."}>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    {active.length && customers.length && documents.length ? <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-xl border border-dtsc-border p-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">{english ? "Fixed credit" : "Crédit fixe"}
        <select name="benefit" required className="mt-1 block min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-surface p-2">
          <option value="">{english ? "Select" : "Choisir"}</option>
          {active.map((b) => <option key={b.id} value={b.id}>{english ? b.nameEn : b.nameFr} — {b.valueDecimal} {b.currencyCode}</option>)}
        </select></label>
      <label className="text-sm font-semibold">{english ? "Linked customer" : "Client lié"}
        <select name="client" required className="mt-1 block min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-surface p-2">
          <option value="">{english ? "Select" : "Choisir"}</option>
          {customers.map((c, i) => <option key={c.identityLinkId + c.businessPartyId} value={i}>{c.customerName}</option>)}
        </select></label>
      <label className="text-sm font-semibold">{english ? "Existing supporting document" : "Justificatif enregistré"}
        <select name="evidence" required className="mt-1 block min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-surface p-2">
          <option value="">{english ? "Select" : "Choisir"}</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select></label>
      <label className="text-sm font-semibold">{english ? "Reason" : "Motif"}
        <textarea name="reason" required minLength={10} maxLength={800} rows={2} className="mt-1 block w-full rounded-lg border border-dtsc-border bg-dtsc-surface p-2" />
      </label>
      <Button type="submit" disabled={busy} className="sm:col-span-2">{english ? "Submit for independent approval" : "Soumettre à une validation indépendante"}</Button>
    </form> : <p className="text-sm text-dtsc-muted">{english ? "An active benefit, linked customer and valid document are needed." : "Il faut un avantage actif, un client lié et un justificatif valide."}</p>}
    {items.length ? <div className="mt-4 grid gap-3">{items.map((item) => <div key={item.id} className="rounded-xl border border-dtsc-border p-4">
      <p className="text-sm font-semibold">{item.personName || (english ? "Linked customer" : "Client lié")} · {item.effectAmount ?? active.find((b) => b.id === item.benefitId)?.valueDecimal ?? "—"} {item.effectCurrencyCode || active.find((b) => b.id === item.benefitId)?.currencyCode || ""}</p>
      <p className="text-xs text-dtsc-muted">{item.status === "REQUESTED" ? (english ? "Pending approval" : "Validation attendue") : item.status === "CONSUMED" ? (english ? "Credited" : "Crédité") : item.status === "CANCELLED" ? (english ? "Reversed" : "Repris") : item.status === "REJECTED" ? (english ? "Rejected" : "Refusé") : item.status}</p>
      {["REQUESTED", "CONSUMED"].includes(item.status) ? <>
        <label className="mt-2 block text-sm">{english ? "Decision reason" : "Motif de la décision"}
          <textarea rows={2} minLength={10} maxLength={800} value={reasons[item.id] || ""} onChange={(event) => setReasons((r) => ({ ...r, [item.id]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-dtsc-border bg-dtsc-surface p-2" />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.status === "REQUESTED" ? <>
            <Button type="button" size="sm" disabled={busy} onClick={() => void decide(item, "APPROVE")}>{english ? "Approve and credit" : "Valider et créditer"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void decide(item, "REJECT")}>{english ? "Reject" : "Refuser"}</Button>
          </> : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void decide(item, "REVERSE")}>{english ? "Reverse credit" : "Reprendre le crédit"}</Button>}
        </div>
      </> : null}
    </div>)}</div> : null}
  </ModuleSection>;
}
