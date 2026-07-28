"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, FileText, Send, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatEnumLabel } from "@/lib/labels";
import type { ActivityAttachment, ActivityItem, CollaboratorOption } from "./activity-types";

type DoneHandler = (message: string) => void;

export function RequestDialog({
  open,
  onClose,
  collaborators,
  relatedItem,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  collaborators: CollaboratorOption[];
  relatedItem?: ActivityItem | null;
  onDone: DoneHandler;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    try {
      const attachments = await uploadRequestAttachments(formData.getAll("attachments__file"));
      const payload = Object.fromEntries(Array.from(formData.entries()).filter(([key]) => key !== "attachments__file"));
      const response = await fetch("/api/activities/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, attachments }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onDone(body?.message || "Impossible d’envoyer la demande.");
        return;
      }
      form.reset();
      onDone("Demande envoyée au collaborateur.");
      onClose();
    } catch (error) {
      onDone(error instanceof Error ? error.message : "Import des pièces jointes impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Formuler une demande" description="Envoyez une demande métier à un collaborateur DTSC. La discussion reste liée à cette demande." onClose={onClose} className="h-[92dvh] max-w-4xl">
      <form onSubmit={submit} className="min-w-0 space-y-4">
        <input type="hidden" name="relatedEntityType" value={relatedItem?.entityType || ""} />
        <input type="hidden" name="relatedEntityId" value={relatedItem?.id || ""} />
        {relatedItem ? (
          <div className="border-l-2 border-cyan-400 pl-3 text-sm text-dtsc-muted">
            Demande liée à <strong className="text-dtsc-ink">{relatedItem.title}</strong>
          </div>
        ) : null}
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <FormField label="Objet de la demande" hint="Indiquez clairement ce que vous attendez du collaborateur.">
            <Input name="title" placeholder={relatedItem ? `Demande liée à : ${relatedItem.title}` : "Titre de la demande"} required className="rounded-xl bg-dtsc-page" />
          </FormField>
          <FormField label="Collaborateur destinataire" hint="Sélectionnez la personne qui devra traiter ou répondre.">
            <select name="targetEmployeeId" required className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">
              <option value="">Choisir un collaborateur</option>
              {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}
            </select>
          </FormField>
          <FormField label="Type de demande" hint="Classez la demande pour faciliter son suivi.">
            <select name="requestType" defaultValue="INFORMATION" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">
              {REQUEST_TYPES.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}
            </select>
          </FormField>
          <FormField label="Priorité" hint="Définissez l’urgence métier.">
            <select name="priority" defaultValue="NORMAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">
              {PRIORITIES.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}
            </select>
          </FormField>
          <FormField label="Échéance souhaitée" hint="Ajoutez une date limite uniquement si elle est utile.">
            <Input name="dueDate" type="date" className="rounded-xl bg-dtsc-page" />
          </FormField>
          <FormField label="Pièces jointes" hint="Maximum 8 fichiers, contrôlés par la route privée Activités.">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-bold text-dtsc-blue">
              <UploadCloud className="h-4 w-4" />
              Ajouter des fichiers
              <input name="attachments__file" type="file" multiple className="sr-only" />
            </label>
          </FormField>
        </div>
        <FormField label="Message détaillé" hint="Décrivez le contexte, le résultat attendu et les informations utiles.">
          <textarea name="message" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" placeholder="Expliquez clairement votre demande..." />
        </FormField>
        <div className="flex justify-end">
          <Button disabled={submitting} className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" />{submitting ? "Envoi..." : "Envoyer la demande"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function BlockerDialog({ open, onClose, operations, onDone }: { open: boolean; onClose: () => void; operations: CollaboratorOption[]; onDone: DoneHandler }) {
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    const response = await fetch("/api/activities/blockers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setSubmitting(false);
    if (!response.ok) {
      onDone(body?.message || "Impossible de transmettre le blocage.");
      return;
    }
    form.reset();
    onDone("Blocage transmis au COO.");
    onClose();
  }
  return (
    <Dialog open={open} onClose={onClose} title="Déclarer un blocage" description="Signalez un obstacle opérationnel avec son impact et sa criticité." className="h-[92dvh] max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Titre du blocage"><Input name="title" required className="rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Criticité">
            <select name="severity" defaultValue="MEDIUM" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}
            </select>
          </FormField>
          <FormField label="Origine du blocage">
            <select name="sourceType" defaultValue="TASK" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">
              {["TASK", "OPERATION", "DEPARTMENT_REQUEST", "HR", "FINANCE", "TECHNICAL", "INFORMATION", "VALIDATION_DELAY", "OTHER"].map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}
            </select>
          </FormField>
          <FormField label="Opération liée">
            <select name="operationId" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink"><option value="">Aucune</option>{operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}</select>
          </FormField>
        </div>
        <FormField label="Description du blocage"><textarea name="description" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
        <FormField label="Impact observé"><textarea name="impact" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
        <FormField label="Action attendue"><textarea name="correctiveAction" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
        <div className="flex justify-end"><Button disabled={submitting} className="rounded-xl bg-[#002b5b] text-white"><CircleAlert className="h-4 w-4" />{submitting ? "Transmission..." : "Déclarer"}</Button></div>
      </form>
    </Dialog>
  );
}

export function ReportDialog({ open, onClose, collaborators, operations, onDone }: { open: boolean; onClose: () => void; collaborators: CollaboratorOption[]; operations: CollaboratorOption[]; onDone: DoneHandler }) {
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    const response = await fetch("/api/activities/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setSubmitting(false);
    if (!response.ok) {
      onDone(body?.message || "Impossible de transmettre le rapport.");
      return;
    }
    form.reset();
    onDone("Rapport opérationnel transmis.");
    onClose();
  }
  return (
    <Dialog open={open} onClose={onClose} title="Nouveau rapport opérationnel" description="Transmettez un rapport réel à un collaborateur DTSC." className="h-[92dvh] max-w-4xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Titre"><Input name="title" required className="rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Destinataire">
            <select name="recipientEmployeeId" required className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink"><option value="">Choisir</option>{collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}</select>
          </FormField>
          <FormField label="Type de rapport"><select name="reportType" defaultValue="DAILY" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{["DAILY", "WEEKLY", "MONTHLY", "ACTIVITY", "INCIDENT", "BLOCKER", "MEETING", "MISSION", "OTHER"].map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField>
          <FormField label="Priorité"><select name="priority" defaultValue="NORMAL" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{PRIORITIES.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField>
          <FormField label="Début de période"><Input name="periodStart" type="date" className="rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Fin de période"><Input name="periodEnd" type="date" className="rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Opération liée"><select name="operationId" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink"><option value="">Aucune</option>{operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}</select></FormField>
        </div>
        <FormField label="Contenu"><textarea name="content" required className="min-h-40 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
        <div className="flex justify-end"><Button disabled={submitting} className="rounded-xl bg-[#002b5b] text-white"><FileText className="h-4 w-4" />{submitting ? "Transmission..." : "Transmettre"}</Button></div>
      </form>
    </Dialog>
  );
}

export function WorkflowDialog({ open, onClose, collaborators, operations, onDone }: { open: boolean; onClose: () => void; collaborators: CollaboratorOption[]; operations: CollaboratorOption[]; onDone: DoneHandler }) {
  const [workflowType, setWorkflowType] = useState("COO_MEETING");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    try {
      const payload = await buildWorkflowPayload(new FormData(form), workflowType);
      const response = await fetch("/api/activities/collaborator-workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        onDone(body?.message || "Transmission impossible.");
        return;
      }
      form.reset();
      onDone(body?.message || "Formulaire transmis.");
      onClose();
    } catch (error) {
      onDone(error instanceof Error ? error.message : "Import du document impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Formulaire métier" description="Créez une réunion COO ou transmettez un dossier juridique via les workflows existants." className="h-[94dvh] max-w-5xl">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Formulaire">
          <select value={workflowType} onChange={(event) => setWorkflowType(event.target.value)} className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">
            <option value="COO_MEETING">Mes réunions & comptes rendus</option>
            <option value="LEGAL_CASE">Soumettre un dossier juridique</option>
            <option value="LEGAL_CONTRACT">Soumettre un contrat ou une convention</option>
            <option value="LEGAL_RISK">Signaler un risque juridique</option>
            <option value="LEGAL_DISPUTE">Soumettre un litige ou une réclamation</option>
            <option value="LEGAL_REQUEST">Faire une demande juridique</option>
          </select>
        </FormField>
        {workflowType === "COO_MEETING" ? <MeetingFields collaborators={collaborators} operations={operations} /> : <LegalFields workflowType={workflowType} />}
        <div className="flex justify-end"><Button disabled={submitting} className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" />{submitting ? "Transmission..." : "Transmettre"}</Button></div>
      </form>
    </Dialog>
  );
}

function MeetingFields({ collaborators, operations }: { collaborators: CollaboratorOption[]; operations: CollaboratorOption[] }) {
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2">
      <FormField label="Titre de la réunion"><Input name="title" required className="rounded-xl bg-dtsc-page" /></FormField>
      <FormField label="Type de réunion"><select name="meetingType" defaultValue="COORDINATION" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{["COORDINATION", "STRATEGIC", "OPERATIONAL", "FOLLOW_UP", "TECHNICAL", "FINANCIAL", "HR", "CLIENT", "OTHER"].map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField>
      <FormField label="Date"><Input name="meetingDate" type="date" className="rounded-xl bg-dtsc-page" /></FormField>
      <FormField label="Heure"><Input name="meetingTime" className="rounded-xl bg-dtsc-page" /></FormField>
      <FormField label="Durée prévue"><Input name="duration" className="rounded-xl bg-dtsc-page" /></FormField>
      <FormField label="Confidentialité"><select name="confidentialityLevel" defaultValue="INTERNAL" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{["INTERNAL", "CONFIDENTIAL", "STRATEGIC"].map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField>
      <FormField label="Opération liée"><select name="operationId" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink"><option value="">Aucune</option>{operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}</select></FormField>
      <FormField label="Participants" className="md:col-span-2"><div className="max-h-48 overflow-y-auto border-y border-dtsc-border py-2">{collaborators.length ? <div className="grid gap-2 sm:grid-cols-2">{collaborators.map((collaborator) => <label key={collaborator.id} className="flex min-w-0 items-start gap-2 px-2 py-1 text-sm font-semibold text-dtsc-ink"><input name="participantIds" value={collaborator.id} type="checkbox" className="mt-1 h-4 w-4" /><span className="min-w-0 break-words">{collaborator.label}</span></label>)}</div> : <p className="text-sm text-dtsc-muted">Aucun collaborateur disponible.</p>}</div></FormField>
    </div>
    <FormField label="Ordre du jour"><textarea name="agenda" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
    <FormField label="Compte rendu"><textarea name="minutes" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
    <FormField label="Décisions prises"><textarea name="decisions" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
    <FormField label="Actions à suivre"><textarea name="generatedTasks" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
    <FormField label="Commentaire initial"><textarea name="comments" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
  </div>;
}

function LegalFields({ workflowType }: { workflowType: string }) {
  const titleName = workflowType === "LEGAL_REQUEST" ? "subject" : "title";
  const typeConfig = LEGAL_TYPES[workflowType] || { name: "type", values: ["OTHER"] };
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2">
      <FormField label={workflowType === "LEGAL_REQUEST" ? "Objet de la demande" : "Titre"}><Input name={titleName} required className="rounded-xl bg-dtsc-page" /></FormField>
      <FormField label="Catégorie juridique"><select name={typeConfig.name} className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{typeConfig.values.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField>
      {(workflowType === "LEGAL_CONTRACT" || workflowType === "LEGAL_DISPUTE") ? <FormField label="Partie concernée"><Input name="counterparty" className="rounded-xl bg-dtsc-page" /></FormField> : null}
      {workflowType === "LEGAL_CONTRACT" ? <FormField label="Date souhaitée de validation"><Input name="desiredValidationDate" type="date" className="rounded-xl bg-dtsc-page" /></FormField> : null}
      {workflowType === "LEGAL_REQUEST" ? <FormField label="Date limite souhaitée"><Input name="desiredDueDate" type="date" className="rounded-xl bg-dtsc-page" /></FormField> : null}
      {workflowType === "LEGAL_DISPUTE" ? <FormField label="Date de survenue"><Input name="occurredAt" type="date" className="rounded-xl bg-dtsc-page" /></FormField> : null}
      {(workflowType === "LEGAL_CASE" || workflowType === "LEGAL_REQUEST") ? <FormField label="Priorité"><select name="priority" defaultValue="NORMAL" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{PRIORITIES.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField> : null}
      {workflowType === "LEGAL_RISK" ? <FormField label="Urgence"><select name="urgency" defaultValue="NORMAL" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink">{PRIORITIES.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></FormField> : null}
      <FormField label="Document joint"><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-bold text-dtsc-blue"><UploadCloud className="h-4 w-4" />Ajouter un fichier<input name={`${fileTargetName(workflowType)}__file`} type="file" className="sr-only" /></label></FormField>
      <FormField label="Élément lié"><Input name="linkedEntityType" placeholder="Projet, fournisseur, client..." className="rounded-xl bg-dtsc-page" /></FormField>
      <FormField label="Référence liée"><Input name="linkedEntityId" className="rounded-xl bg-dtsc-page" /></FormField>
    </div>
    {workflowType === "LEGAL_CONTRACT" ? <FormField label="Objet du contrat"><textarea name="subject" required className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField> : <FormField label="Description"><textarea name="description" required className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>}
    {workflowType === "LEGAL_CASE" ? <FormField label="Raison de la demande"><textarea name="reason" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField> : null}
    {(workflowType === "LEGAL_RISK" || workflowType === "LEGAL_DISPUTE") ? <FormField label="Impact perçu ou estimé"><textarea name="potentialImpact" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField> : null}
    {workflowType === "LEGAL_CONTRACT" ? <label className="flex items-center gap-2 text-sm font-bold text-dtsc-muted"><input name="strategic" type="checkbox" className="h-4 w-4" />Contrat stratégique ou nécessitant signature CEO</label> : null}
    <FormField label="Commentaire initial"><textarea name="comments" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-dtsc-ink" /></FormField>
  </div>;
}

async function uploadRequestAttachments(values: FormDataEntryValue[]): Promise<ActivityAttachment[]> {
  const files = values.filter((value): value is File => value instanceof File && value.size > 0).slice(0, 8);
  const attachments: ActivityAttachment[] = [];
  for (const file of files) {
    const url = await uploadActivityFile(file);
    attachments.push({ name: file.name, url, type: file.type, size: file.size, uploadedAt: new Date().toISOString() });
  }
  return attachments;
}

async function buildWorkflowPayload(formData: FormData, workflowType: string) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.endsWith("__file") || key === "participantIds") continue;
    payload[key] = String(value);
  }
  payload.workflowType = workflowType;
  payload.participantIds = formData.getAll("participantIds").map(String);
  payload.strategic = formData.get("strategic") === "on";
  for (const [key, value] of formData.entries()) {
    if (!key.endsWith("__file") || !(value instanceof File) || value.size === 0) continue;
    payload[key.replace(/__file$/, "")] = await uploadActivityFile(value);
  }
  return payload;
}

async function uploadActivityFile(file: File) {
  const data = new FormData();
  data.set("file", file);
  const response = await fetch("/api/activities/files", { method: "POST", body: data });
  const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !body?.url) throw new Error(body?.error || `Import impossible pour ${file.name}.`);
  return body.url;
}

function fileTargetName(workflowType: string) {
  return ["LEGAL_CONTRACT", "LEGAL_DISPUTE", "LEGAL_REQUEST"].includes(workflowType) ? "documentUrl" : "attachmentUrl";
}

const REQUEST_TYPES = ["INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const LEGAL_TYPES: Record<string, { name: string; values: string[] }> = {
  LEGAL_CASE: { name: "caseType", values: ["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "ADMINISTRATIVE_DOCUMENT", "DISPUTE", "COMPLIANCE", "SENSITIVE_DATA", "PARTNERSHIP", "EMPLOYMENT_CONTRACT", "OTHER"] },
  LEGAL_CONTRACT: { name: "contractType", values: ["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "CONSULTING_CONTRACT", "SERVICE_CONTRACT", "PARTNERSHIP_AGREEMENT", "NDA", "MOU", "TECHNICAL_CONTRACT", "OTHER"] },
  LEGAL_RISK: { name: "source", values: ["CONTRACT", "CLIENT", "SUPPLIER", "EMPLOYEE", "PROJECT", "SENSITIVE_DATA", "MEDICAL_DATA", "FINANCE", "OPERATION", "TECHNICAL", "OTHER"] },
  LEGAL_DISPUTE: { name: "disputeType", values: ["CLIENT", "SUPPLIER", "EMPLOYEE", "PARTNER", "ADMINISTRATION", "TECHNICAL", "FINANCIAL", "OPERATIONAL", "PROJECT", "OTHER"] },
  LEGAL_REQUEST: { name: "requestType", values: ["HR_CONTRACT", "PROJECT_CONTRACT", "SUPPLIER_CONTRACT", "CLIENT_CONTRACT", "OFFICIAL_NOTE", "NDA", "IP_DATA", "DISPUTE", "CONFIDENTIALITY", "SENSITIVE_DATA", "OTHER"] },
};
