"use client";

import type { ReactNode } from "react";

export type EnterpriseIdentityLinkChoiceValue =
  | "MANUAL_ONLY"
  | "INVITE_EXISTING_ACCOUNT"
  | "INVITE_ACCOUNT_CREATION"
  | "LINK_LATER";

const OPTIONS: Array<{
  value: EnterpriseIdentityLinkChoiceValue;
  title: string;
  description: string;
}> = [
  {
    value: "MANUAL_ONLY",
    title: "Créer une fiche manuellement",
    description: "La personne existe dans votre entreprise sans devoir posséder un compte DTSC.",
  },
  {
    value: "INVITE_EXISTING_ACCOUNT",
    title: "Inviter à lier un compte DTSC",
    description: "Une invitation privée sera envoyée. La relation restera inactive sans consentement explicite.",
  },
  {
    value: "INVITE_ACCOUNT_CREATION",
    title: "Inviter à créer un compte DTSC",
    description: "La personne pourra créer son compte, puis décider séparément d’accepter la relation.",
  },
  {
    value: "LINK_LATER",
    title: "Associer plus tard",
    description: "Enregistrez d’abord la fiche métier. La liaison pourra être proposée ultérieurement.",
  },
];

export function EnterpriseIdentityLinkChoice({
  value,
  onChange,
  name = "identityLinkChoice",
  disabled = false,
  status,
  helper,
}: {
  value: EnterpriseIdentityLinkChoiceValue;
  onChange: (value: EnterpriseIdentityLinkChoiceValue) => void;
  name?: string;
  disabled?: boolean;
  status?: "LINKED" | "PENDING" | "REFUSED" | "REVOKED" | null;
  helper?: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 max-w-full space-y-3" disabled={disabled}>
      <legend className="text-sm font-black text-dtsc-ink">Lien avec un compte DTSC</legend>
      <p className="break-words text-sm leading-6 text-dtsc-muted">
        La fiche métier reste l’autorité de l’entreprise. Le compte DTSC reste l’identité de connexion de la personne.
      </p>
      <input type="hidden" name={name} value={value} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-w-0 max-w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                selected
                  ? "border-cyan-400 bg-cyan-400/10"
                  : "border-dtsc-border bg-dtsc-surface hover:border-cyan-300"
              }`}
            >
              <span className="block break-words text-sm font-black text-dtsc-ink">{option.title}</span>
              <span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{option.description}</span>
            </button>
          );
        })}
      </div>
      {status ? (
        <div className="rounded-xl border border-dtsc-border bg-dtsc-soft px-3 py-2 text-sm text-dtsc-ink">
          {status === "LINKED" && "Relation déjà liée avec consentement actif."}
          {status === "PENDING" && "Consentement ou approbation en attente."}
          {status === "REFUSED" && "La liaison a été refusée. La fiche métier reste disponible."}
          {status === "REVOKED" && "L’autorisation a été retirée. Aucune synchronisation future n’est permise."}
        </div>
      ) : null}
      {helper ? <div className="text-xs leading-5 text-dtsc-muted">{helper}</div> : null}
    </fieldset>
  );
}
