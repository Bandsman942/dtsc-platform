"use client";

import { useState } from "react";
import { ClipboardCopy, Share2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastMessage } from "@/components/ui/use-toast-message";

/** Organization.slug is an invitation locator, NOT an authorization token. */
export function EnterpriseRelationshipCodePanel({
  code, locale,
}: { code: string | null; locale?: string | null }) {
  const english = locale === "en";
  const [feedback, setFeedback] = useState("");
  useToastMessage(feedback, feedback.startsWith("Impossible") || feedback.startsWith("Unable") ? "error" : "success");

  async function copy(value: string) {
    setFeedback("");
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(english ? "Copied to clipboard." : "Copié dans le presse-papiers.");
    } catch {
      setFeedback(english ? "Unable to copy automatically. Select the code above to copy it." : "Impossible de copier automatiquement. Sélectionnez le code ci-dessus pour le copier.");
    }
  }

  return (
    <section className="mt-4 min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5" aria-label={english ? "Company relationship code" : "Code de relation de l’entreprise"}>
      <h3 className="flex items-center gap-2 font-black text-dtsc-ink"><Share2 className="h-5 w-5 text-dtsc-blue" aria-hidden="true" />{english ? "Company relationship code" : "Code de relation de l’entreprise"}</h3>
      <p className="mt-2 text-sm leading-6 text-dtsc-muted">{english
        ? "Share this code with people who want to request a business relationship with your company."
        : "Communiquez ce code aux personnes qui souhaitent demander une relation avec votre entreprise."}</p>
      {code ? <>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <code className="min-w-0 flex-1 select-all break-all text-base font-bold text-dtsc-ink" aria-label={english ? "Company code" : "Code entreprise"}>{code}</code>
          <Button type="button" variant="outline" onClick={() => void copy(code)}><ClipboardCopy className="h-4 w-4" aria-hidden="true" />{english ? "Copy code" : "Copier le code"}</Button>
        </div>
        <Button className="mt-3 min-h-11" type="button" variant="outline" onClick={() => void copy(`${window.location.origin}/enterprise-links?view=requests&code=${encodeURIComponent(code)}`)}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {english ? "Copy relationship request link" : "Copier le lien de demande de relation"}
        </Button>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-dtsc-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{english
          ? "The link identifies the company only. Users must sign in, request a specific relationship and wait for approval. It does not give access to your ERP."
          : "Ce lien identifie uniquement l’entreprise. La personne doit se connecter, demander une relation précise et attendre votre approbation. Aucun accès ERP n’est accordé automatiquement."}</p>
      </> : <p className="mt-3 text-sm font-semibold text-dtsc-muted">{english ? "No company code has been configured. Contact DTSC support." : "Aucun code d’entreprise configuré. Contactez le support DTSC."}</p>}
      {feedback ? <p role="status" className="mt-2 text-sm text-dtsc-muted">{feedback}</p> : null}
    </section>
  );
}
