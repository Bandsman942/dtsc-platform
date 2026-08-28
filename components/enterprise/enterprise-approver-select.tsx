"use client";

import { useEffect, useId, useMemo, useState } from "react";

type Candidate = {
  userId: string;
  name: string;
  email: string;
  positionTitle: string | null;
  role: string;
  isRequester: boolean;
  selfApprovalOverride: boolean;
};

type Props = {
  organizationId: string;
  moduleCode: string;
  locale?: string | null;
  name?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  defaultValue?: string;
  className?: string;
};

function tx(locale: string | null | undefined, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

export function EnterpriseApproverSelect({
  organizationId,
  moduleCode,
  locale,
  name = "approverUserId",
  label,
  required = true,
  disabled = false,
  defaultValue = "",
  className = "min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink",
}: Props) {
  const selectId = useId();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setValue(defaultValue);
    fetch(`/api/enterprise/${organizationId}/approval-candidates?moduleCode=${encodeURIComponent(moduleCode)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { candidates?: Candidate[]; message?: string } | null;
        if (!response.ok) throw new Error(body?.message || tx(locale, "Impossible de charger les validateurs.", "Unable to load approvers."));
        if (!active) return;
        const items = Array.isArray(body?.candidates) ? body.candidates : [];
        setCandidates(items);
        if (defaultValue && items.some((item) => item.userId === defaultValue)) setValue(defaultValue);
        else setValue("");
      })
      .catch((loadError) => {
        if (!active) return;
        setCandidates([]);
        setValue("");
        setError(loadError instanceof Error ? loadError.message : tx(locale, "Impossible de charger les validateurs.", "Unable to load approvers."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [defaultValue, locale, moduleCode, organizationId]);

  const optionLabel = useMemo(() => (candidate: Candidate) => {
    const suffix = candidate.selfApprovalOverride
      ? tx(locale, " · vous-même (dérogation administrateur)", " · you (administrator override)")
      : "";
    return `${candidate.name}${candidate.positionTitle ? ` · ${candidate.positionTitle}` : ""}${suffix}`;
  }, [locale]);

  return <div className="grid min-w-0 gap-1.5">
    {label ? <label htmlFor={selectId} className="text-sm font-semibold text-dtsc-ink">{label}</label> : null}
    <select id={selectId} aria-label={label || tx(locale, "Validateur", "Approver")} name={name} value={value} onChange={(event) => setValue(event.target.value)} required={required} disabled={disabled || loading || !candidates.length} className={className}>
      <option value="">{loading ? tx(locale, "Recherche des validateurs autorisés…", "Looking for authorized approvers…") : tx(locale, "Sélectionner un validateur", "Select an approver")}</option>
      {candidates.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{optionLabel(candidate)}</option>)}
    </select>
    {!loading && !candidates.length ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{error || tx(locale, "Aucun autre validateur autorisé n’est disponible. Un administrateur peut habiliter un collaborateur ou activer la dérogation d’auto-validation pour ce service.", "No authorized approver is available. A company administrator can grant access to another collaborator or enable the self-approval override for this service.")}</p> : null}
  </div>;
}
