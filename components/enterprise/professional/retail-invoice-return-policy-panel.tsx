"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Policy = {
  version: 2;
  mode: "STANDARD" | "SIMPLIFIED";
  allowRequesterInspection: boolean;
  allowDelegatedSelfApproval: boolean;
  autoPostCreditNote: boolean;
  promptImmediateRefund: boolean;
  scope: "ALL_SITES";
  expressRefundLimitAmount: string;
  expressRefundLimitCurrency: string;
};
type LegacyPolicy = Omit<Policy, "version" | "expressRefundLimitAmount" | "expressRefundLimitCurrency"> & { version: 1; expressRefundLimitAmount: number; expressRefundLimitCurrency: "USD" };
type ResponseData = { revision: number; policy: Policy | LegacyPolicy; canManage: boolean; functionalCurrencyCode: string };
const copy = {
  fr: {
    heading: "Annulations, avoirs et remboursements",
    lead: "Configurez les délégations applicables à toutes les boutiques. Un gérant conserve ses permissions propres à sa boutique ; aucun réglage ne donne accès aux autres boutiques.",
    standard: "Standard — contrôles séparés",
    simplified: "Simplifié — délégations contrôlées",
    mode: "Circuit d'annulation",
    inspect: "Autoriser le contrôle de la marchandise par le demandeur habilité",
    approve: "Autoriser l'auto-approbation par le validateur désigné et délégué",
    credit: "Comptabiliser l'avoir à la finalisation du retour",
    prompt: "Proposer le remboursement immédiat, lorsque le montant remboursable est positif",
    limit: "Plafond express cumulé par facture",
    help: "Choisissez librement le montant maximal dans la devise fonctionnelle de l'entreprise, sans plafond fixe en USD. Les retours fractionnés d'une même facture sont cumulés et les paiements en devise étrangère sont convertis au taux Finance valide.",
    legacy: "L'ancienne politique applique toujours son plafond historique aux retours déjà créés. Choisissez maintenant un montant dans la devise de l'entreprise pour les nouvelles demandes.",
    invalidAmount: "Saisissez un montant positif comportant au maximum deux décimales, dans la devise de l'entreprise.",
    password: "Mot de passe (confirmation d'identité)",
    totp: "Code MFA si nécessaire",
    save: "Enregistrer les autorisations", saving: "Enregistrement…",
    saved: "Politique de retour enregistrée.",
    error: "Impossible d'enregistrer les autorisations. Vérifiez vos droits, la confirmation d'identité et la version des paramètres.",
    loading: "Chargement des autorisations…",
    readOnly: "Seuls le propriétaire et les administrateurs habilités peuvent modifier cette politique.",
    security: "Les vérifications serveur, la traçabilité Finance et Stock, les droits par boutique et les périodes comptables restent obligatoires.",
  },
  en: {
    heading: "Returns, credit notes and refunds",
    lead: "Configure delegations for all stores. A manager retains permissions only for their assigned store; these settings never grant cross-store access.",
    standard: "Standard — separate controls",
    simplified: "Simplified — controlled delegation",
    mode: "Return workflow",
    inspect: "Allow an authorized requester to inspect the returned merchandise",
    approve: "Allow the designated and delegated approver to approve their own request",
    credit: "Post the credit note when the return is finalized",
    prompt: "Offer immediate refund when there is a positive refundable amount",
    limit: "Cumulative express limit per invoice",
    help: "Set any positive amount in your company's functional currency: no fixed USD cap. Splitting one invoice into multiple returns cannot bypass this limit. Foreign-currency refunds use a valid Finance exchange rate.",
    legacy: "The previous policy remains binding for returns already submitted. Configure a new amount in your company's currency for future requests.",
    invalidAmount: "Enter a positive amount with at most two decimal places in your company's currency.",
    password: "Password (identity confirmation)",
    totp: "MFA code if required",
    save: "Save return policy", saving: "Saving…",
    saved: "Return policy saved.",
    error: "Unable to save the policy. Check your permissions, identity confirmation and configuration revision.",
    loading: "Loading return settings…",
    readOnly: "Only an authorized owner or company administrator can change this policy.",
    security: "Server checks, Finance and Inventory traceability, store permissions and accounting periods remain mandatory.",
  },
};

export function RetailInvoiceReturnPolicyPanel({ organizationId, locale }: {
  organizationId: string; locale: "fr" | "en";
}) {
  const t = copy[locale];
  const [data, setData] = useState<ResponseData | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [legacyPolicy, setLegacyPolicy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/return-policy`, { cache: "no-store" });
      const payload = await response.json() as ResponseData & { message?: string };
      if (!response.ok || !payload.policy) throw new Error(payload.message || t.error);
      if (!/^[A-Z]{3}$/.test(payload.functionalCurrencyCode)) throw new Error(t.error);
      const isLegacy = payload.policy.version === 1;
      const prepared: Policy = {
        ...payload.policy, version: 2,
        expressRefundLimitAmount: isLegacy ? "" : String(payload.policy.expressRefundLimitAmount),
        expressRefundLimitCurrency: payload.functionalCurrencyCode,
      };
      setLegacyPolicy(isLegacy);
      setData(payload); setPolicy(prepared); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setLoading(false); }
  }, [organizationId, t.error]);
  useEffect(() => { void load(); }, [load]);

  const change = <K extends keyof Policy>(name: K, value: Policy[K]) =>
    setPolicy((previous) => previous ? { ...previous, [name]: value } : previous);

  async function save() {
    if (!data?.canManage || !policy || !password || saving) return;
    if (!/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,2})?$/.test(policy.expressRefundLimitAmount) ||
        !Number.isFinite(Number(policy.expressRefundLimitAmount)) || Number(policy.expressRefundLimitAmount) <= 0) {
      setError(t.invalidAmount); return;
    }
    setSaving(true); setError("");
    try {
      const confirm = await fetch("/api/auth/step-up", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, ...(totp.trim() ? { code: totp.trim() } : {}) }),
      });
      if (!confirm.ok) throw new Error(t.error);
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/return-policy`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: data.revision, policy }),
      });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message || t.error);
      setPassword(""); setTotp(""); await load(); toastSuccess(t.saved);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t.error;
      setError(message); toastError(message);
    } finally { setSaving(false); }
  }

  const disabled = !data?.canManage || saving;
  return <section id="retail-return-policy" className="mt-4 min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
    <header>
      <h3 className="text-lg font-black text-dtsc-ink">{t.heading}</h3>
      <p className="mt-1 text-sm text-dtsc-muted">{t.lead}</p>
    </header>
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{t.loading}</p> : null}
    {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    {policy && !loading ? <>
      <label className="grid max-w-xl gap-1 text-sm font-bold text-dtsc-ink">{t.mode}
        <select value={policy.mode} disabled={disabled} onChange={(event) => change("mode", event.target.value as Policy["mode"])}
          className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2">
          <option value="STANDARD">{t.standard}</option>
          <option value="SIMPLIFIED">{t.simplified}</option>
        </select>
      </label>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {([
          ["allowRequesterInspection", t.inspect],
          ["allowDelegatedSelfApproval", t.approve],
          ["autoPostCreditNote", t.credit],
          ["promptImmediateRefund", t.prompt],
        ] as const).map(([key, label]) => <label key={key}
          className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-ink">
          <input className="mt-0.5 h-5 w-5 shrink-0 accent-cyan-600" type="checkbox"
            checked={policy[key]} disabled={disabled || policy.mode === "STANDARD"}
            onChange={(event) => change(key, event.target.checked)} />
          <span className="min-w-0 break-words">{label}</span>
        </label>)}
      </div>
      <label className="grid max-w-xs gap-1 text-sm font-bold text-dtsc-ink">{t.limit} <strong className="text-cyan-700 dark:text-cyan-300">({data?.functionalCurrencyCode})</strong>
        <input data-testid="retail-return-express-limit" className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page p-2"
          type="text" inputMode="decimal" autoComplete="off" placeholder="250000"
          value={policy.expressRefundLimitAmount} disabled={disabled}
          onChange={(event) => change("expressRefundLimitAmount", event.target.value.replace(",", "."))} />
      </label>
      {legacyPolicy ? <p role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-dtsc-ink">{t.legacy}</p> : null}
      <p className="text-xs leading-5 text-dtsc-muted">{t.help}</p>
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-dtsc-ink">{t.security}</p>
      {!data?.canManage ? <p className="text-sm text-dtsc-muted">{t.readOnly}</p> : <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t.password}
          <input type="password" autoComplete="current-password" className="min-h-11 rounded-lg border border-dtsc-border bg-dtsc-page p-2" value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving} />
        </label>
        <label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t.totp}
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={12} className="min-h-11 rounded-lg border border-dtsc-border bg-dtsc-page p-2" value={totp} onChange={(event) => setTotp(event.target.value)} disabled={saving} />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="button" disabled={saving || !password || !policy.expressRefundLimitAmount || Number(policy.expressRefundLimitAmount) <= 0} onClick={() => void save()}>{saving ? t.saving : t.save}</Button>
        </div>
      </div>}
    </> : null}
  </section>;
}
