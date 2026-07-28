"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { CircleAlert, Download, Eye, FileText, Send, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { formatEnumLabel } from "@/lib/labels";
import type { ActivityAttachment, ActivityItem, CollaboratorOption } from "./activity-types";

export function CollaboratorWorkflowComposer({
  collaborators,
  operations,
  onCreated,
}: {
  collaborators: CollaboratorOption[];
  operations: CollaboratorOption[];
  onCreated?: () => void;
}) {
  const [statusMessage, setStatusMessage] = useState("");
  const [workflowType, setWorkflowType] = useState("COO_MEETING");
  const [formVersion, setFormVersion] = useState(0);
  useToastMessage(statusMessage);

  async function submitWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const formData = new FormData(form);
      const payload = await buildActivityWorkflowPayload(formData, workflowType);
      const response = await fetch("/api/activities/collaborator-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatusMessage(response.ok ? "Formulaire transmis. L'élément apparaît dans votre suivi." : body?.message || "Transmission impossible.");
      if (response.ok) {
        form.reset();
        setFormVersion((current) => current + 1);
        onCreated?.();
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Import du fichier impossible.");
    }
  }

  return (
    <form onSubmit={submitWorkflow} className="min-w-0 space-y-5 overflow-visible">
      <FormField label="Formulaire" hint="Choisissez le type de formulaire à transmettre. Les champs s'adaptent au processus sélectionné.">
        <select value={workflowType} onChange={(event) => setWorkflowType(event.target.value)} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm normal-case tracking-normal text-dtsc-ink">
          <option value="COO_MEETING">Mes réunions & comptes rendus</option>
          <option value="LEGAL_CASE">Soumettre un dossier juridique</option>
          <option value="LEGAL_CONTRACT">Soumettre un contrat ou une convention</option>
          <option value="LEGAL_RISK">Signaler un risque juridique</option>
          <option value="LEGAL_DISPUTE">Soumettre un litige ou une réclamation</option>
          <option value="LEGAL_REQUEST">Faire une demande juridique</option>
        </select>
      </FormField>

      {workflowType === "COO_MEETING" ? (
        <div className="border-t border-dtsc-border pt-4">
          <h4 className="font-black text-dtsc-ink">Mes réunions & comptes rendus</h4>
          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            <FormField label="Titre de la réunion" hint="Nommez la réunion pour la retrouver dans le suivi COO.">
              <Input name="title" placeholder="Titre de la réunion" required className="rounded-xl bg-dtsc-page" />
            </FormField>
            <FormField label="Type de réunion" hint="Classez la réunion selon son objectif principal.">
              <select name="meetingType" defaultValue="COORDINATION" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
                {["COORDINATION", "STRATEGIC", "OPERATIONAL", "FOLLOW_UP", "TECHNICAL", "FINANCIAL", "HR", "CLIENT", "OTHER"].map((type) => <option key={type} value={type}>{formatEnumLabel(type)}</option>)}
              </select>
            </FormField>
            <FormField label="Date" hint="Indiquez la date prévue ou tenue de la réunion.">
              <Input name="meetingDate" type="date" className="rounded-xl bg-dtsc-page" />
            </FormField>
            <FormField label="Heure" hint="Précisez l'heure de démarrage si elle est connue.">
              <Input name="meetingTime" placeholder="Heure" className="rounded-xl bg-dtsc-page" />
            </FormField>
            <FormField label="Durée prévue" hint="Exemple: 30 min, 1 h, 2 h.">
              <Input name="duration" placeholder="Durée prévue" className="rounded-xl bg-dtsc-page" />
            </FormField>
            <FormField label="Confidentialité" hint="Définissez qui peut consulter le compte rendu et les décisions.">
              <select name="confidentialityLevel" defaultValue="INTERNAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
                {["INTERNAL", "CONFIDENTIAL", "STRATEGIC"].map((level) => <option key={level} value={level}>{formatEnumLabel(level)}</option>)}
              </select>
            </FormField>
            <FormField label="Participants" hint="Sélectionnez un ou plusieurs collaborateurs concernés." className="md:col-span-2">
              <CollaboratorCheckboxList name="participantIds" collaborators={collaborators} emptyLabel="Aucun collaborateur disponible pour cette réunion." />
            </FormField>
            <FormField label="Opération liée" hint="Associez la réunion à une opération existante si nécessaire.">
              <select name="operationId" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
                <option value="">Opération liée</option>
                {operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Ordre du jour" hint="Listez les points à traiter pendant la réunion." className="mt-3">
            <textarea name="agenda" placeholder="Ordre du jour" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          </FormField>
          <FormField label="Compte rendu" hint="Résumez les échanges importants et le contexte utile." className="mt-3">
            <textarea name="minutes" placeholder="Compte rendu" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          </FormField>
          <FormField label="Décisions prises" hint="Notez les décisions validées pendant la réunion." className="mt-3">
            <textarea name="decisions" placeholder="Décisions prises" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          </FormField>
          <FormField label="Actions à suivre" hint="Indiquez les tâches ou suites opérationnelles attendues." className="mt-3">
            <textarea name="generatedTasks" placeholder="Actions à suivre" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          </FormField>
          <FormField label="Commentaire initial" hint="Ajoutez une précision visible dans le fil de suivi." className="mt-3">
            <textarea name="comments" placeholder="Commentaire initial" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          </FormField>
        </div>
      ) : (
        <LegalWorkflowFields key={`${workflowType}-${formVersion}`} workflowType={workflowType} />
      )}

      <Button className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> Transmettre</Button>
    </form>
  );
}

function LegalWorkflowFields({ workflowType }: { workflowType: string }) {
  const titlePlaceholder = workflowType === "LEGAL_REQUEST" ? "Objet de la demande" : workflowType === "LEGAL_RISK" ? "Titre du risque" : workflowType === "LEGAL_DISPUTE" ? "Titre du litige ou de la réclamation" : workflowType === "LEGAL_CONTRACT" ? "Titre du contrat" : "Titre du dossier";
  return (
    <div className="border-t border-dtsc-border pt-4">
      <h4 className="font-black text-dtsc-ink">{legalWorkflowTitle(workflowType)}</h4>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <FormField label={titlePlaceholder} hint="Saisissez un intitulé court et précis pour la demande juridique.">
          <Input name={workflowType === "LEGAL_REQUEST" ? "subject" : "title"} placeholder={titlePlaceholder} required className="rounded-xl bg-dtsc-page" />
        </FormField>
        <FormField label="Catégorie juridique" hint="Choisissez la catégorie qui oriente le traitement par le Legal Advisor.">
          <LegalTypeSelect workflowType={workflowType} />
        </FormField>
        {(workflowType === "LEGAL_CONTRACT" || workflowType === "LEGAL_DISPUTE") && (
          <FormField label="Partie concernée" hint="Indiquez la partie externe ou interne concernée.">
            <Input name="counterparty" placeholder="Partie concernée" className="rounded-xl bg-dtsc-page" />
          </FormField>
        )}
        {workflowType === "LEGAL_CONTRACT" && (
          <FormField label="Date souhaitée de validation" hint="Ajoutez la date cible pour la relecture ou validation.">
            <Input name="desiredValidationDate" type="date" className="rounded-xl bg-dtsc-page" />
          </FormField>
        )}
        {workflowType === "LEGAL_REQUEST" && (
          <FormField label="Date limite souhaitée" hint="Précisez la date attendue pour la réponse juridique.">
            <Input name="desiredDueDate" type="date" className="rounded-xl bg-dtsc-page" />
          </FormField>
        )}
        {workflowType === "LEGAL_DISPUTE" && (
          <FormField label="Date de survenue" hint="Indiquez la date de l'événement ou du litige.">
            <Input name="occurredAt" type="date" className="rounded-xl bg-dtsc-page" />
          </FormField>
        )}
        {(workflowType === "LEGAL_CASE" || workflowType === "LEGAL_REQUEST") && (
          <FormField label="Priorité" hint="Définissez l'urgence de traitement juridique.">
            <select name="priority" defaultValue="NORMAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
              {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
            </select>
          </FormField>
        )}
        {workflowType === "LEGAL_RISK" && (
          <FormField label="Urgence" hint="Évaluez la vitesse de traitement nécessaire pour limiter le risque.">
            <select name="urgency" defaultValue="NORMAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
              {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((urgency) => <option key={urgency} value={urgency}>{formatEnumLabel(urgency)}</option>)}
            </select>
          </FormField>
        )}
        <ActivityFileField name={workflowType === "LEGAL_CONTRACT" || workflowType === "LEGAL_DISPUTE" || workflowType === "LEGAL_REQUEST" ? "documentUrl" : "attachmentUrl"} label="Document joint" />
        <FormField label="Élément lié" hint="Précisez le type d'objet lié si la demande concerne un projet, fournisseur ou client.">
          <Input name="linkedEntityType" placeholder="Élément lié: projet, fournisseur, client..." className="rounded-xl bg-dtsc-page" />
        </FormField>
        <FormField label="Référence liée" hint="Ajoutez l'identifiant ou la référence interne de l'élément concerné.">
          <Input name="linkedEntityId" placeholder="Référence de l'élément lié" className="rounded-xl bg-dtsc-page" />
        </FormField>
      </div>
      {workflowType === "LEGAL_CONTRACT" ? (
        <FormField label="Objet du contrat" hint="Décrivez le contrat et les instructions attendues pour la relecture." className="mt-3">
          <textarea name="subject" required placeholder="Objet du contrat et instruction de relecture" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
      ) : (
        <FormField label="Description" hint="Expliquez le besoin, le contexte et le résultat attendu." className="mt-3">
          <textarea name="description" required placeholder="Description" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
      )}
      {workflowType === "LEGAL_CASE" && (
        <FormField label="Raison de la demande" hint="Indiquez pourquoi ce dossier doit être analysé par l'équipe juridique." className="mt-3">
          <textarea name="reason" placeholder="Raison de la demande" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
      )}
      {(workflowType === "LEGAL_RISK" || workflowType === "LEGAL_DISPUTE") && (
        <FormField label="Impact perçu ou estimé" hint="Décrivez les conséquences possibles sur DTSC, le client ou le projet." className="mt-3">
          <textarea name="potentialImpact" placeholder="Impact perçu ou estimé" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
      )}
      {workflowType === "LEGAL_CONTRACT" && (
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-dtsc-muted">
          <input name="strategic" type="checkbox" className="h-4 w-4 rounded border-dtsc-border" />
          Contrat stratégique ou nécessitant signature CEO
        </label>
      )}
      <FormField label="Commentaire initial" hint="Ajoutez une précision utile au premier échange." className="mt-3">
        <textarea name="comments" placeholder="Commentaire initial" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      </FormField>
    </div>
  );
}

function ActivityFileField({ name, label }: { name: string; label: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setObjectUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const lowerName = file?.name.toLowerCase() || "";
  const canPreviewImage = Boolean(file?.type.startsWith("image/"));
  const canPreviewPdf = file?.type === "application/pdf" || lowerName.endsWith(".pdf");
  const readableSize = file ? `${(file.size / 1024 / 1024).toFixed(2)} Mo` : "";

  return (
    <div className="grid min-w-0 gap-2 md:col-span-2">
      <label className="grid min-w-0 gap-1">
        <span className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</span>
        <input type="hidden" name={name} value="" />
        <input
          name={`${name}__file`}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv"
          onChange={(event) => setFile(event.currentTarget.files?.[0] || null)}
          className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink file:mr-3 file:rounded-lg file:border-0 file:bg-dtsc-blue file:px-3 file:py-1 file:text-xs file:font-black file:text-white"
        />
        <span className="text-xs leading-5 text-dtsc-muted">Importez un fichier depuis votre appareil. PDF, Word, Excel, PowerPoint, image, CSV ou texte.</span>
      </label>
      {file && (
        <div className="border-l-2 border-dtsc-border pl-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-dtsc-ink">
              <FileText className="h-4 w-4 shrink-0 text-cyan-500" />
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-dtsc-muted">{readableSize}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {(canPreviewImage || canPreviewPdf) && <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Eye className="h-4 w-4" /> Aperçu</Button>}
              {objectUrl && <a href={objectUrl} download={file.name} className="inline-flex items-center gap-2 rounded-xl bg-dtsc-blue px-3 py-2 text-xs font-black text-white"><Download className="h-4 w-4" /> Télécharger</a>}
            </div>
          </div>
          <Dialog open={previewOpen} title={`Aperçu: ${file.name}`} onClose={() => setPreviewOpen(false)} className="max-w-5xl">
            {canPreviewImage && objectUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={objectUrl} alt={file.name} className="mx-auto max-h-[70vh] max-w-full rounded-2xl border border-dtsc-border object-contain" />
            ) : canPreviewPdf && objectUrl ? (
              <iframe src={objectUrl} title={file.name} className="h-[70vh] w-full rounded-2xl border border-dtsc-border bg-white" />
            ) : <p className="text-sm text-dtsc-muted">Aperçu non disponible pour ce type de fichier. Utilisez le téléchargement.</p>}
          </Dialog>
        </div>
      )}
    </div>
  );
}

function CollaboratorCheckboxList({ name, collaborators, emptyLabel }: { name: string; collaborators: CollaboratorOption[]; emptyLabel: string }) {
  return (
    <div className="max-h-48 min-h-32 overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-page p-2">
      {collaborators.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {collaborators.map((collaborator) => (
            <label key={collaborator.id} className="flex min-w-0 items-start gap-2 rounded-xl bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-ink">
              <input name={name} value={collaborator.id} type="checkbox" className="mt-1 h-4 w-4 rounded border-dtsc-border text-cyan-500" />
              <span className="min-w-0"><span className="block truncate">{collaborator.label}</span>{collaborator.userId && <span className="block truncate text-xs text-dtsc-muted">Compte lié</span>}</span>
            </label>
          ))}
        </div>
      ) : <p className="rounded-xl bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-muted">{emptyLabel}</p>}
    </div>
  );
}

async function buildActivityWorkflowPayload(formData: FormData, workflowType: string) {
  const payload: Record<string, unknown> = {};
  const fileEntries = Array.from(formData.entries()).filter(([key, value]) => key.endsWith("__file") && value instanceof File && value.size > 0);
  for (const [key, value] of formData.entries()) {
    if (key.endsWith("__file") || key === "participantIds") continue;
    payload[key] = String(value);
  }
  payload.workflowType = workflowType;
  payload.participantIds = formData.getAll("participantIds").map(String);
  payload.strategic = formData.get("strategic") === "on";
  for (const [key, value] of fileEntries) {
    const targetName = key.replace(/__file$/, "");
    const uploadData = new FormData();
    uploadData.set("file", value);
    const response = await fetch("/api/activities/files", { method: "POST", body: uploadData });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !body?.url) throw new Error(body?.error || "Import du document joint impossible.");
    payload[targetName] = body.url;
  }
  return payload;
}

function LegalTypeSelect({ workflowType }: { workflowType: string }) {
  const config = {
    LEGAL_CASE: { name: "caseType", values: ["CLIENT_CONTRACT", "ADMINISTRATIVE_DOCUMENT", "DISPUTE", "COMPLIANCE", "SENSITIVE_DATA", "PARTNERSHIP", "SUPPLIER_CONTRACT", "EMPLOYMENT_CONTRACT", "OTHER"] },
    LEGAL_CONTRACT: { name: "contractType", values: ["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "CONSULTING_CONTRACT", "SERVICE_CONTRACT", "PARTNERSHIP_AGREEMENT", "NDA", "MOU", "TECHNICAL_CONTRACT", "OTHER"] },
    LEGAL_RISK: { name: "source", values: ["CONTRACT", "CLIENT", "SUPPLIER", "EMPLOYEE", "PROJECT", "SENSITIVE_DATA", "MEDICAL_DATA", "FINANCE", "OPERATION", "TECHNICAL", "OTHER"] },
    LEGAL_DISPUTE: { name: "disputeType", values: ["CLIENT", "SUPPLIER", "EMPLOYEE", "PARTNER", "ADMINISTRATION", "TECHNICAL", "FINANCIAL", "OPERATIONAL", "PROJECT", "OTHER"] },
    LEGAL_REQUEST: { name: "requestType", values: ["HR_CONTRACT", "PROJECT_CONTRACT", "SUPPLIER_CONTRACT", "CLIENT_CONTRACT", "OFFICIAL_NOTE", "NDA", "IP_DATA", "DISPUTE", "CONFIDENTIALITY", "SENSITIVE_DATA", "OTHER"] },
  }[workflowType] || { name: "type", values: ["OTHER"] };
  return <select name={config.name} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">{config.values.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select>;
}

function legalWorkflowTitle(workflowType: string) {
  if (workflowType === "LEGAL_CONTRACT") return "Soumettre un contrat ou une convention";
  if (workflowType === "LEGAL_RISK") return "Signaler un risque juridique";
  if (workflowType === "LEGAL_DISPUTE") return "Soumettre un litige ou une réclamation";
  if (workflowType === "LEGAL_REQUEST") return "Faire une demande juridique";
  return "Soumettre un dossier juridique";
}

export function RequestComposer({ collaborators, selected, compact = false, onCreated }: { collaborators: CollaboratorOption[]; selected: ActivityItem | null; compact?: boolean; onCreated?: () => void }) {
  const [statusMessage, setStatusMessage] = useState("");
  const [open, setOpen] = useState(!compact);
  const [formVersion, setFormVersion] = useState(0);
  useToastMessage(statusMessage);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== "attachments__file") payload[key] = String(value);
    }
    try {
      payload.attachments = await uploadRequestAttachments(formData.getAll("attachments__file"));
      const response = await fetch("/api/activities/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatusMessage(response.ok ? "Demande envoyée au collaborateur." : body?.message || "Impossible d'envoyer la demande.");
      if (response.ok) {
        form.reset();
        setFormVersion((current) => current + 1);
        setOpen(false);
        onCreated?.();
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Import des pièces jointes impossible.");
    }
  }

  const form = (
    <form onSubmit={createRequest} className="min-w-0 space-y-3">
      <div>
        <h4 className="font-black text-dtsc-ink">Formuler une demande à un collaborateur</h4>
        <p className="mt-1 text-sm leading-6 text-dtsc-muted">Envoyez une demande d'information, validation, document ou action. La discussion reste attachée à la demande.</p>
      </div>
      <input type="hidden" name="relatedEntityType" value={selected?.entityType || ""} />
      <input type="hidden" name="relatedEntityId" value={selected?.id || ""} />
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <FormField label="Objet de la demande" hint="Indiquez clairement ce que vous attendez du collaborateur."><Input name="title" placeholder={selected ? `Demande liée à: ${selected.title}` : "Titre de la demande"} required className="rounded-xl bg-dtsc-page" /></FormField>
        <FormField label="Collaborateur destinataire" hint="Sélectionnez la personne qui devra traiter ou répondre à cette demande.">
          <select name="targetEmployeeId" required className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"><option value="">Collaborateur destinataire</option>{collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}</select>
        </FormField>
        <FormField label="Type de demande" hint="Classez la demande pour faciliter son suivi dans les activités DTSC.">
          <select name="requestType" className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="INFORMATION">{["INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"].map((type) => <option key={type} value={type}>{formatEnumLabel(type)}</option>)}</select>
        </FormField>
        <FormField label="Priorité" hint="Définissez l'urgence métier pour orienter le traitement.">
          <select name="priority" className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="NORMAL">{["LOW", "NORMAL", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}</select>
        </FormField>
        <FormField label="Échéance souhaitée" hint="Ajoutez une date limite si la demande doit être traitée avant un délai précis."><Input name="dueDate" type="date" className="rounded-xl bg-dtsc-page" /></FormField>
      </div>
      <FormField label="Message détaillé" hint="Décrivez le contexte, les informations attendues et les pièces utiles."><textarea name="message" required placeholder="Expliquez clairement ce que vous attendez du collaborateur..." className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" /></FormField>
      <RequestAttachmentField key={formVersion} />
      <Button className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> Envoyer la demande</Button>
    </form>
  );
  if (!compact) return form;
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Send className="h-4 w-4" /> Formuler une demande</Button><Dialog open={open} title="Formuler une demande" onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">{form}</Dialog></>;
}

function RequestAttachmentField() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  function syncInput(nextFiles: File[]) {
    setFiles(nextFiles);
    const input = inputRef.current;
    if (!input) return;
    const transfer = new DataTransfer();
    nextFiles.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  }
  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter((file) => file.size > 0);
    const existingKeys = new Set(files.map(fileKey));
    const merged = [...files];
    for (const file of incoming) {
      const key = fileKey(file);
      if (!existingKeys.has(key)) {
        merged.push(file);
        existingKeys.add(key);
      }
    }
    syncInput(merged.slice(0, 8));
  }
  function handleChange(event: ChangeEvent<HTMLInputElement>) { addFiles(event.currentTarget.files || []); }
  function handleDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); addFiles(event.dataTransfer.files); }
  function removeFile(file: File) { syncInput(files.filter((item) => fileKey(item) !== fileKey(file))); }
  return (
    <div className="grid gap-2">
      <label onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-300/70 bg-cyan-400/10 px-4 py-5 text-center transition hover:bg-cyan-400/15">
        <UploadCloud className="h-5 w-5 text-cyan-500" /><span className="text-sm font-black text-dtsc-ink">Joindre des fichiers</span><span className="text-xs leading-5 text-dtsc-muted">PDF, images, Office, CSV ou texte. Glissez-déposez ou sélectionnez depuis votre appareil.</span>
        <input ref={inputRef} name="attachments__file" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv" onChange={handleChange} className="sr-only" />
      </label>
      {files.length > 0 && <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{files.map((file) => <div key={fileKey(file)} className="flex min-w-0 items-center justify-between gap-3 py-2"><span className="flex min-w-0 items-center gap-2 text-sm font-bold text-dtsc-ink"><FileText className="h-4 w-4 shrink-0 text-cyan-500" /><span className="truncate">{file.name}</span><span className="shrink-0 text-xs text-dtsc-muted">{formatFileSize(file.size)}</span></span><Button type="button" size="icon" variant="ghost" onClick={() => removeFile(file)} className="h-8 w-8 rounded-xl text-dtsc-muted hover:text-red-500" aria-label={`Retirer ${file.name}`}><X className="h-4 w-4" /></Button></div>)}</div>}
    </div>
  );
}

async function uploadRequestAttachments(values: FormDataEntryValue[]): Promise<ActivityAttachment[]> {
  const files = values.filter((value): value is File => value instanceof File && value.size > 0).slice(0, 8);
  const attachments: ActivityAttachment[] = [];
  for (const file of files) {
    const uploadData = new FormData();
    uploadData.set("file", file);
    const response = await fetch("/api/activities/files", { method: "POST", body: uploadData });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !body?.url) throw new Error(body?.error || `Import impossible pour ${file.name}.`);
    attachments.push({ name: file.name, url: body.url, type: file.type, size: file.size, uploadedAt: new Date().toISOString() });
  }
  return attachments;
}

function fileKey(file: File) { return `${file.name}-${file.size}-${file.lastModified}`; }
function formatFileSize(size: number) { if (size < 1024) return `${size} o`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`; return `${(size / 1024 / 1024).toFixed(2)} Mo`; }

export function BlockerComposer({ operations, compact = false, onCreated }: { operations: CollaboratorOption[]; compact?: boolean; onCreated?: () => void }) {
  const [statusMessage, setStatusMessage] = useState("");
  const [open, setOpen] = useState(!compact);
  useToastMessage(statusMessage);
  async function createBlocker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/activities/blockers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setStatusMessage(response.ok ? "Blocage transmis au COO." : "Impossible de transmettre le blocage.");
    if (response.ok) { form.reset(); setOpen(false); onCreated?.(); }
  }
  const form = <form onSubmit={createBlocker} className="min-w-0 space-y-3"><div><h4 className="font-black text-dtsc-ink">Déclarer un blocage</h4><p className="mt-1 text-sm leading-6 text-dtsc-muted">Signalez un obstacle opérationnel pour le faire remonter au COO avec contexte et criticité.</p></div><div className="grid gap-3 md:grid-cols-2"><FormField label="Titre du blocage" hint="Résumez l'obstacle en une phrase claire."><Input name="title" placeholder="Titre du blocage" required className="rounded-xl bg-dtsc-page" /></FormField><FormField label="Criticité" hint="Indiquez l'impact du blocage sur les délais, le client ou l'équipe."><select name="severity" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="MEDIUM">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => <option key={severity} value={severity}>{formatEnumLabel(severity)}</option>)}</select></FormField><FormField label="Origine du blocage" hint="Précisez le type d'activité concerné pour orienter le suivi COO."><select name="sourceType" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="TASK">{["TASK", "OPERATION", "DEPARTMENT_REQUEST", "HR", "FINANCE", "TECHNICAL", "INFORMATION", "VALIDATION_DELAY", "OTHER"].map((source) => <option key={source} value={source}>{formatEnumLabel(source)}</option>)}</select></FormField><FormField label="Opération liée" hint="Associez le blocage à une opération si elle existe déjà."><select name="operationId" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"><option value="">Opération liée</option>{operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}</select></FormField></div><FormField label="Description du blocage" hint="Expliquez ce qui empêche l'avancement et les éléments déjà vérifiés."><textarea name="description" required placeholder="Description du blocage..." className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" /></FormField><FormField label="Impact observé" hint="Décrivez les conséquences sur le travail, le client, le budget ou le délai."><textarea name="impact" placeholder="Impact sur le travail, le client ou le délai..." className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" /></FormField><FormField label="Action attendue" hint="Proposez une correction ou indiquez l'aide dont vous avez besoin."><textarea name="correctiveAction" placeholder="Action attendue ou solution proposée..." className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" /></FormField><Button className="rounded-xl bg-dtsc-blue text-white"><CircleAlert className="h-4 w-4" /> Déclarer</Button></form>;
  if (!compact) return form;
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><CircleAlert className="h-4 w-4" /> Signaler un blocage</Button><Dialog open={open} title="Déclarer un blocage" onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">{form}</Dialog></>;
}

export function ReportComposer({ collaborators, operations, compact = false, onCreated }: { collaborators: CollaboratorOption[]; operations: CollaboratorOption[]; compact?: boolean; onCreated?: () => void }) {
  const [statusMessage, setStatusMessage] = useState("");
  const [open, setOpen] = useState(!compact);
  useToastMessage(statusMessage);
  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/activities/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setStatusMessage(response.ok ? "Rapport envoyé au collaborateur sélectionné." : "Impossible d'envoyer le rapport.");
    if (response.ok) { form.reset(); setOpen(false); onCreated?.(); }
  }
  const form = <form onSubmit={createReport} className="min-w-0 space-y-3"><h4 className="font-black text-dtsc-ink">Envoyer un rapport opérationnel</h4><div className="grid gap-3 md:grid-cols-2"><FormField label="Titre du rapport" hint="Donnez un titre exploitable pour retrouver rapidement ce rapport."><Input name="title" placeholder="Titre du rapport" required className="rounded-xl bg-dtsc-page" /></FormField><FormField label="Destinataire" hint="Sélectionnez le collaborateur qui doit recevoir et traiter le rapport."><select name="recipientEmployeeId" required className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"><option value="">Destinataire</option>{collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}</select></FormField><FormField label="Opération liée" hint="Reliez le rapport à une opération DTSC si nécessaire."><select name="operationId" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"><option value="">Opération liée</option>{operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}</select></FormField><FormField label="Priorité" hint="Indiquez l'importance du rapport pour la suite des opérations."><select name="priority" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="NORMAL">{["LOW", "NORMAL", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}</select></FormField></div><FormField label="Contenu du rapport" hint="Présentez les faits, résultats, difficultés et recommandations."><textarea name="content" required placeholder="Contenu du rapport..." className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" /></FormField><Button className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> Envoyer</Button></form>;
  if (!compact) return form;
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Send className="h-4 w-4" /> Nouveau rapport</Button><Dialog open={open} title="Envoyer un rapport" onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">{form}</Dialog></>;
}
