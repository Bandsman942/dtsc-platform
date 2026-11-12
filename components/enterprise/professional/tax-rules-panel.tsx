"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TaxCode = { id: string; code: string; nameFr: string; nameEn: string;
  category: string; taxTreatment: string; jurisdiction: string | null };
type Rule = { id: string; sourceType: string; priority: number; isActive: boolean;
  updatedAt: string; taxCode: { code: string; nameFr: string; nameEn: string };
  criteriaJson: Record<string, unknown> | null };
type Props = { organizationId: string; locale: "fr" | "en"; canCreate: boolean;
  canManage: boolean; onChanged: () => void };
export function TaxRulesPanel({ organizationId, locale, canCreate, canManage, onChanged }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [codes, setCodes] = useState<TaxCode[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const root = `/api/enterprise/${organizationId}/taxes`;
  const load = useCallback(async () => {
    try {
      const [taxResponse, rulesResponse] = await Promise.all([
        fetch(`${root}?pageSize=100`, { cache: "no-store" }),
        fetch(`${root}/rules`, { cache: "no-store" }),
      ]);
      if (!rulesResponse.ok || !taxResponse.ok) throw new Error("TAX_RULE_PERMISSION_REQUIRED");
      const [taxData, ruleData] = await Promise.all([taxResponse.json(), rulesResponse.json()]);
      setCodes((taxData.items || []).filter((tax: TaxCode) =>
        ["VAT", "GST", "SALES_TAX"].includes(tax.category) && tax.taxTreatment === "STANDARD" && Boolean(tax.jurisdiction)));
      setRules(ruleData.items || []);
    } catch { setError(locale === "en" ? "Cannot read the fiscal rules; check your tax permissions." : "Lecture des règles fiscales impossible : vérifiez vos permissions."); }
  }, [root, locale]);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (path: string, method: "POST" | "PATCH", body: object) => {
    const result = await fetch(path, {
      method, credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await result.json().catch(() => null);
    if (!result.ok) throw new Error(data?.message || data?.error || "TAX_RULE_ACTION_FAILED");
    return data;
  };
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await mutate(`${root}/rules`, "POST", {
        taxCodeId: String(form.get("taxCodeId") || ""),
        sourceType: String(form.get("sourceType") || ""),
        calculationMode: "SEQUENTIAL",
        legalReference: String(form.get("legalReference") || ""),
        evidenceReference: String(form.get("evidenceReference") || ""),
        priority: Number(form.get("priority") || 10),
      });
      setOpen(false); setMessage(locale === "en" ? "Draft rule saved; independent review is required." : "Règle enregistrée en brouillon ; revue indépendante obligatoire.");
      await load(); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "TAX_RULE_ACTION_FAILED"); }
    finally { setBusy(false); }
  }
  async function review(action: "APPROVE" | "REJECT") {
    if (!selectedRule || reviewReason.trim().length < 6) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await mutate(`${root}/rules/${selectedRule.id}`, "PATCH", {
        action, revision: new Date(selectedRule.updatedAt).toISOString(), reason: reviewReason.trim(),
      });
      setSelectedRule(null); setReviewReason("");
      setMessage(action === "APPROVE" ? (locale === "en" ? "Tax rule approved." : "Règle fiscale approuvée.") : (locale === "en" ? "Tax rule rejected." : "Règle fiscale rejetée."));
      await load(); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "TAX_RULE_REVIEW_FAILED"); }
    finally { setBusy(false); }
  }
  return <section className="mb-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label={locale === "en" ? "Tax rule governance" : "Gouvernance des règles fiscales"}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-black text-dtsc-ink">{locale === "en" ? "Fiscal calculation rules" : "Règles de calcul fiscal"}</h3>
        <p className="mt-1 text-xs leading-5 text-dtsc-muted">{locale === "en" ? "Sequential compound taxes require a legal basis and approval by another finance manager. No self-approval." : "Les cumuls séquentiels exigent une base légale et l'approbation d'un autre responsable Finance. Auto-approbation interdite."}</p>
      </div>
      {canCreate ? <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen((value) => !value)}>{open ? (locale === "en" ? "Close" : "Fermer") : (locale === "en" ? "Propose a rule" : "Proposer une règle")}</Button> : null}
    </header>
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p> : null}
    {open && canCreate ? <form onSubmit={create} className="mt-4 grid gap-3 rounded-xl border border-dtsc-border p-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">{locale === "en" ? "Tax code" : "Code fiscal"} *<select name="taxCodeId" required disabled={busy} className="h-10 rounded-lg border border-dtsc-border bg-dtsc-surface px-2"><option value="">{locale === "en" ? "Choose a code" : "Choisir un code"}</option>{codes.map((tax) => <option key={tax.id} value={tax.id}>{tax.code} · {locale === "en" ? tax.nameEn : tax.nameFr}</option>)}</select></label>
      <label className="grid gap-1 text-sm">{locale === "en" ? "Source" : "Source"} *<select name="sourceType" className="h-10 rounded-lg border border-dtsc-border bg-dtsc-surface px-2"><option value="SALES_INVOICE">{locale === "en" ? "Customer invoices" : "Factures clients"}</option><option value="SUPPLIER_INVOICE">{locale === "en" ? "Supplier invoices" : "Factures fournisseurs"}</option></select></label>
      <label className="grid gap-1 text-sm">{locale === "en" ? "Legal basis" : "Fondement légal"} *<Input name="legalReference" minLength={6} maxLength={220} required disabled={busy} /></label>
      <label className="grid gap-1 text-sm">{locale === "en" ? "Evidence reference" : "Référence justificative"} *<Input name="evidenceReference" minLength={6} maxLength={180} required disabled={busy} /></label>
      <label className="grid gap-1 text-sm">{locale === "en" ? "Priority" : "Priorité"} *<Input name="priority" type="number" min="0" max="1000" defaultValue="10" required disabled={busy} /></label>
      <p className="self-center text-xs text-dtsc-muted">{locale === "en" ? "Draft is inactive until independently approved." : "Le brouillon reste inactif sans approbation indépendante."}</p>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={busy}>{locale === "en" ? "Save proposal" : "Enregistrer la proposition"}</Button></div>
    </form> : null}
    <div className="mt-4 grid gap-2">
      {rules.length ? rules.slice(0,25).map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border p-3 text-sm">
        <div className="min-w-0"><strong className="text-dtsc-ink">{rule.taxCode.code}</strong> · {rule.sourceType}
          <p className="mt-1 text-xs text-dtsc-muted">{String(rule.criteriaJson?.legalReference || "")} · {rule.isActive ? (locale === "en" ? "Active (approved)" : "Active (approuvée)") : String(rule.criteriaJson?.approvalStatus || "DRAFT")}</p>
        </div>
        {canManage && !rule.isActive && rule.criteriaJson?.approvalStatus === "DRAFT" ?
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setSelectedRule(rule); setReviewReason(""); }}>{locale === "en" ? "Review" : "Examiner"}</Button> : null}
      </div>) : <p className="text-sm text-dtsc-muted">{locale === "en" ? "No rules proposed." : "Aucune règle proposée."}</p>}
    </div>
    {selectedRule ? <div className="mt-4 grid gap-3 rounded-xl border border-dtsc-border p-3">
      <p className="text-sm font-semibold">{locale === "en" ? "Independent review" : "Revue indépendante"} — {selectedRule.taxCode.code}</p>
      <label className="grid gap-1 text-sm">{locale === "en" ? "Reason / legal validation" : "Motif / validation légale"}<textarea className="min-h-20 rounded-lg border border-dtsc-border bg-dtsc-surface px-3 py-2" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} disabled={busy} minLength={6} required /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || reviewReason.trim().length < 6} onClick={() => { void review("APPROVE"); }}>{locale === "en" ? "Approve" : "Approuver"}</Button>
      <Button type="button" variant="outline" disabled={busy || reviewReason.trim().length < 6} onClick={() => { void review("REJECT"); }}>{locale === "en" ? "Reject" : "Refuser"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setSelectedRule(null)}>{locale === "en" ? "Cancel" : "Annuler"}</Button></div>
    </div> : null}
  </section>;
}
