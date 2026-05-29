"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Send, Sparkles } from "lucide-react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type ActivityBlock = {
  id: string;
  blockCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  icon: string | null;
  targetModuleCode: string | null;
};

type ActivityRequest = {
  id: string;
  blockCode: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  targetModuleCode: string | null;
  createdAt: string;
  createdBy: { name: string; email: string };
  block: { labelFr: string; labelEn: string; icon: string | null } | null;
};

type EnterpriseMember = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

type SectorRecord = {
  id: string;
  moduleCode: string;
  title: string;
  status: string;
  payloadJson: Record<string, unknown> | null;
};

type EnterpriseWorkflow = {
  id: string;
  workflowCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  stepsJson: unknown;
  updatedAt?: string;
};

type ActivityField = {
  name: string;
  label: string;
  placeholder: string;
  type?: "textarea" | "text" | "number" | "select";
  source?: "patients" | "labRequests" | "pharmacyItems" | "members";
  options?: string[];
  required?: boolean;
};

const defaultActivityFields: ActivityField[] = [
  { name: "validationType", label: "Type de validation", placeholder: "Validation administrative, médicale, facture...", required: true },
  { name: "relatedItem", label: "Élément lié", placeholder: "Référence ou contexte", required: false },
];

const healthActivityFields: Record<string, ActivityField[]> = {
  REQUEST_VALIDATION: defaultActivityFields,
  REPORT_PATIENT_INCIDENT: [
    { name: "patient", label: "Patient concerné", placeholder: "Sélectionner un patient", source: "patients" },
    { name: "service", label: "Service concerné", placeholder: "Consultation, soins infirmiers, laboratoire...", required: true },
    { name: "severity", label: "Criticité", placeholder: "Criticité", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
  ],
  REQUEST_COVERAGE: [
    { name: "patient", label: "Patient", placeholder: "Sélectionner un patient", source: "patients", required: true },
    { name: "insurer", label: "Assureur", placeholder: "Nom de l'assureur ou organisme", required: true },
    { name: "benefit", label: "Prestation concernée", placeholder: "Consultation, laboratoire, acte médical...", required: true },
    { name: "estimatedAmount", label: "Montant estimé", placeholder: "Montant estimé", type: "number" },
  ],
  SUBMIT_MEDICAL_REPORT: [
    { name: "period", label: "Période", placeholder: "Semaine, mois ou plage concernée", required: true },
    { name: "service", label: "Service", placeholder: "Service médical concerné", required: true },
    { name: "difficulties", label: "Difficultés", placeholder: "Difficultés rencontrées", type: "textarea" },
    { name: "recommendations", label: "Recommandations", placeholder: "Actions recommandées", type: "textarea" },
  ],
  REQUEST_MEDICAL_OPINION: [
    { name: "patient", label: "Patient", placeholder: "Sélectionner un patient", source: "patients", required: true },
    { name: "context", label: "Contexte", placeholder: "Contexte clinique synthétique", type: "textarea", required: true },
    { name: "question", label: "Question médicale", placeholder: "Avis attendu", type: "textarea", required: true },
  ],
  REPORT_LAB_ISSUE: [
    { name: "patient", label: "Patient concerné", placeholder: "Sélectionner un patient", source: "patients" },
    { name: "labRequest", label: "Demande labo", placeholder: "Sélectionner une demande labo", source: "labRequests" },
    { name: "severity", label: "Criticité", placeholder: "Criticité", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    { name: "problem", label: "Problème constaté", placeholder: "Retard, résultat, prélèvement...", type: "textarea", required: true },
  ],
  REPORT_PHARMACY_STOCKOUT: [
    { name: "product", label: "Produit concerné", placeholder: "Sélectionner un produit", source: "pharmacyItems", required: true },
    { name: "quantity", label: "Quantité restante", placeholder: "Quantité disponible" },
    { name: "urgency", label: "Urgence", placeholder: "Urgence", type: "select", options: ["LOW", "NORMAL", "HIGH", "CRITICAL"] },
  ],
  SUBMIT_PATIENT_DOCUMENT: [
    { name: "patient", label: "Patient", placeholder: "Sélectionner un patient", source: "patients", required: true },
    { name: "documentType", label: "Type document", placeholder: "Type document", type: "select", options: ["Ordonnance", "Certificat", "Résultat", "Facture", "Assurance", "Autre"], required: true },
    { name: "reason", label: "Contexte du dépôt", placeholder: "Pourquoi ce document doit être traité", type: "textarea" },
  ],
};

function payloadText(record: SectorRecord, key: string) {
  const value = record.payloadJson?.[key];
  return typeof value === "string" ? value : "";
}

export function EnterpriseActivitiesModule({
  organization,
  blocks,
  requests,
  members,
  sectorRecords,
  workflows,
}: {
  organization: {
    id: string;
    name: string;
    sector: string | null;
    sectorCode?: string | null;
    businessSector: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
  };
  blocks: ActivityBlock[];
  requests: ActivityRequest[];
  members: EnterpriseMember[];
  sectorRecords: SectorRecord[];
  workflows: EnterpriseWorkflow[];
}) {
  const router = useRouter();
  const [selectedBlockCode, setSelectedBlockCode] = useState(blocks[0]?.blockCode || "");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const selectedBlock = useMemo(() => blocks.find((block) => block.blockCode === selectedBlockCode) || null, [blocks, selectedBlockCode]);
  const selectedActivityFields = healthActivityFields[selectedBlockCode] || defaultActivityFields;
  const patients = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "PATIENTS" && record.status !== "ARCHIVED"), [sectorRecords]);
  const labRequests = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "LABORATORY"), [sectorRecords]);
  const pharmacyItems = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "INTERNAL_PHARMACY"), [sectorRecords]);
  const list = useSmartList({
    items: requests,
    pageSize: 8,
    getSearchText: (request) => `${request.title} ${request.description} ${request.status} ${request.priority} ${request.blockCode}`,
  });

  function fieldOptions(field: ActivityField) {
    if (field.source === "patients") {
      return patients.map((record) => ({ value: record.id, label: payloadText(record, "patientName") || record.title }));
    }
    if (field.source === "labRequests") {
      return labRequests.map((record) => ({ value: record.id, label: record.title }));
    }
    if (field.source === "pharmacyItems") {
      return pharmacyItems.map((record) => ({ value: record.id, label: record.title }));
    }
    if (field.source === "members") {
      return members.map((member) => ({ value: member.user.id, label: member.user.name }));
    }
    return (field.options || []).map((option) => ({ value: option, label: option }));
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedBlockCode) {
      setMessage("Choisissez un bloc d'activité.");
      return;
    }
    setMessage("");
    const formData = new FormData(formElement);
    const title = String(formData.get("title") || "");
    const baseDescription = String(formData.get("description") || "");
    const priority = String(formData.get("priority") || "NORMAL");
    const assignedToUserId = String(formData.get("assignedToUserId") || "");
    const metadata: Record<string, string> = {};
    const details = selectedActivityFields
      .map((field) => {
        const value = String(formData.get(field.name) || "").trim();
        if (value) {
          metadata[field.name] = value;
        }
        return value ? `${field.label}: ${value}` : "";
      })
      .filter(Boolean);
    const description = details.length ? `${baseDescription}\n\n${details.join("\n")}` : baseDescription;
    const response = await fetch(`/api/enterprise/${organization.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, assignedToUserId, blockCode: selectedBlockCode, metadata }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Demande envoyée au destinataire sélectionné." : body?.message || "Envoi impossible.");
    if (response.ok) {
      formElement.reset();
      setFormOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Activités entreprise</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">Activités {organization.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-dtsc-muted">
          Soumettez des demandes, rapports ou signalements liés à votre entreprise sans accéder aux sections sensibles d&apos;administration.
        </p>
        <span className="mt-4 inline-flex rounded-full bg-cyan-400/14 px-3 py-1 text-xs font-black text-cyan-600">
          {organization.businessSector?.labelFr || organization.sector || "Socle commun"}
        </span>
      </section>

      <Accordion>
        <AccordionItem title="Actions santé" defaultOpen>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {blocks.map((block) => {
              const active = selectedBlockCode === block.blockCode;
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedBlockCode(block.blockCode)}
                  className={`shrink-0 rounded-2xl border px-4 py-3 text-left transition ${active ? "border-cyan-300 bg-cyan-400/16 text-cyan-600" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink"}`}
                >
                  <span className="block text-sm font-black">{block.labelFr}</span>
                  <span className="mt-1 block max-w-56 truncate text-xs font-semibold text-dtsc-muted">{block.descriptionFr || block.targetModuleCode || "Socle commun"}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex items-start gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-3">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-cyan-600" />
              <div className="min-w-0">
                <p className="font-black text-dtsc-ink">{selectedBlock?.labelFr || "Choisissez une action"}</p>
                <p className="text-xs font-semibold text-dtsc-muted">{selectedBlock?.descriptionFr || "Le formulaire créera une vraie demande liée à votre organisation."}</p>
              </div>
            </div>
            <Button type="button" onClick={() => setFormOpen(true)} className="mt-4 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Send className="h-4 w-4" />
              Ouvrir le formulaire
            </Button>
          </div>
          <Dialog open={formOpen} title={selectedBlock?.labelFr || "Nouvelle demande entreprise"} description={selectedBlock?.descriptionFr || "Cette action crée une vraie demande isolée dans l'entreprise active."} onClose={() => setFormOpen(false)} className="h-[92dvh] max-w-5xl">
            <form onSubmit={createRequest} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Objet de la demande" hint="Résumez précisément ce que vous envoyez au destinataire.">
                  <Input name="title" placeholder="Objet de la demande" required />
                </FormField>
                <FormField label="Destinataire" hint="Choisissez un collaborateur actif de cette entreprise.">
                  <select name="assignedToUserId" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="">{members.length ? "Destinataire" : "Aucun collaborateur actif"}</option>
                    {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name} · {member.role}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Description" hint="Décrivez le contexte, le besoin, le rapport ou le problème à traiter.">
                <textarea name="description" required placeholder="Décrivez précisément la demande, le rapport ou le problème." className="min-h-36 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
              </FormField>
              {!!selectedActivityFields.length && (
                <div className="grid gap-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-3 md:grid-cols-2">
                  {selectedActivityFields.map((field) => (
                    <FormField key={field.name} label={field.label} hint={field.placeholder}>
                      {field.type === "textarea" ? (
                        <textarea name={field.name} required={field.required} placeholder={field.placeholder} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-ink" />
                      ) : field.type === "select" || field.source ? (
                        <select name={field.name} required={field.required} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                          <option value="">{field.placeholder}</option>
                          {fieldOptions(field).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      ) : (
                        <Input name={field.name} type={field.type || "text"} required={field.required} placeholder={field.placeholder} />
                      )}
                    </FormField>
                  ))}
                </div>
              )}
              <FormField label="Priorité" hint="Indiquez l'urgence de traitement attendue.">
                <select name="priority" defaultValue="NORMAL" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                  <option value="LOW">Faible</option>
                  <option value="NORMAL">Normale</option>
                  <option value="HIGH">Élevée</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </FormField>
              <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                <Send className="h-4 w-4" />
                Envoyer la demande
              </Button>
            </form>
          </Dialog>
        </AccordionItem>

        <AccordionItem title="Workflows partagés">
          <div className="grid gap-3 md:grid-cols-2">
            {workflows.map((workflow) => (
              <article key={workflow.id} className="dtsc-glass-list-item rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/14 text-cyan-600">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{workflow.workflowCode}</p>
                    <h3 className="mt-1 font-black text-dtsc-ink">{workflow.labelFr}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-dtsc-muted">{workflow.descriptionFr || "Workflow interne partagé avec votre entreprise."}</p>
                  </div>
                </div>
              </article>
            ))}
            {!workflows.length && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucun workflow partagé pour le moment.</p>}
          </div>
        </AccordionItem>

        <AccordionItem title="Mes demandes et rapports" defaultOpen>
          <ListControls
            query={list.query}
            onQueryChange={list.setQuery}
            page={list.page}
            pageCount={list.pageCount}
            totalCount={list.totalCount}
            filteredCount={list.filteredCount}
            placeholder="Rechercher une activité..."
            onPageChange={list.setPage}
          />
          <div className="mt-3 grid gap-3">
            {list.paginatedItems.map((request) => (
              <article key={request.id} className="dtsc-glass-list-item rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{request.block?.labelFr || request.blockCode}</p>
                    <h3 className="mt-1 font-black text-dtsc-ink">{request.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-dtsc-muted">{request.description}</p>
                  </div>
                  <span className="rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{request.status}</span>
                </div>
              </article>
            ))}
            {!list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucune activité entreprise pour le moment.</p>}
          </div>
        </AccordionItem>
      </Accordion>

      {message && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
    </div>
  );
}
