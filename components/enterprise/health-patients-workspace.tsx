"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarPlus, CircleHelp, ClipboardPlus, Eye, FilePenLine, HeartPulse, Plus, ShieldAlert } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

import { useToastMessage } from "@/components/ui/use-toast-message";
type Patient = {
  id: string; legacyRecordId: string | null; patientNumber: string; fullName: string; sex: string; birthDate: string | null;
  phonePrimary: string; phoneSecondary: string | null; email: string | null; address: string; city: string | null; country: string | null;
  emergencyContactName: string; emergencyContactRelationship: string | null; emergencyContactPhone: string; emergencyContactAddress: string | null;
  profession: string | null; maritalStatus: string | null; bloodGroup: string | null; knownAllergies: string | null; importantHistory: string | null;
  chronicTreatments: string | null; medicalNotes: string | null; administrativeNotes: string | null; insuranceKnown: boolean; insuranceReference: string | null;
  registrationSource: string; status: string; archivedAt: string | null; deceasedAt: string | null; createdAt: string; updatedAt: string;
  createdBy: { name: string }; updatedBy: { name: string } | null; lastConsultation?: { id: string; title: string; status: string; updatedAt: string } | null;
  events?: Array<{ id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null; createdAt: string; actor: { name: string } }>;
};
type Permissions = { canCreate: boolean; canUpdate: boolean; canArchive: boolean; canViewSensitive: boolean };
type Related = { id: string; moduleCode: string; title: string; summary: string | null; status: string; updatedAt: string };
type Dispensation = { id: string; quantity: number; dispensedAt: string; billingStatus: string; product: { name: string; productCode: string; unit: string }; consultation: { consultationNumber: string } | null; dispensedBy: { name: string } };
type Form = Record<string, string | boolean>;

const SEX = { FEMALE: "Féminin", MALE: "Masculin", OTHER: "Autre", NOT_SPECIFIED: "Non renseigné" };
const STATUS = { ACTIVE: "Actif", INACTIVE: "Inactif", ARCHIVED: "Archivé", DECEASED: "Décédé" };
const SOURCES = { RECEPTION: "Accueil", CONSULTATION: "Consultation", EMERGENCY: "Urgence", EXTERNAL_REFERRAL: "Référence externe", MEDICAL_CAMPAIGN: "Campagne médicale", OTHER: "Autre" };
const MODULE_LABELS: Record<string, string> = { APPOINTMENTS: "Rendez-vous", CONSULTATIONS: "Consultations", LABORATORY: "Laboratoire", MEDICAL_BILLING: "Factures", MEDICAL_DOCUMENTS: "Documents médicaux", INSURANCE_COVERAGE: "Prises en charge", QUALITY_INCIDENTS: "Incidents qualité", MEDICAL_RECORDS: "Dossier médical" };
const emptyForm = (): Form => ({ fullName: "", sex: "NOT_SPECIFIED", birthDate: "", phonePrimary: "", phoneSecondary: "", email: "", address: "", city: "", country: "RDC", emergencyContactName: "", emergencyContactRelationship: "", emergencyContactPhone: "", emergencyContactAddress: "", profession: "", maritalStatus: "", bloodGroup: "", knownAllergies: "", importantHistory: "", chronicTreatments: "", medicalNotes: "", administrativeNotes: "", insuranceKnown: false, insuranceReference: "", registrationSource: "RECEPTION", status: "ACTIVE", actionReason: "" });
function formFromPatient(patient: Patient, forcedStatus?: string) {
  const form = emptyForm();
  const source = patient as unknown as Record<string, unknown>;
  for (const key of Object.keys(form)) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "boolean") form[key] = value;
    else if (value === null || value === undefined) form[key] = "";
  }
  form.birthDate = patient.birthDate?.slice(0, 10) || "";
  form.status = forcedStatus || patient.status;
  form.actionReason = "";
  return form;
}

export function HealthPatientsWorkspace({ organizationId, activeModuleCodes, onOpenRelated }: { organizationId: string; activeModuleCodes: Set<string>; onOpenRelated: (moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) => void }) {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canCreate: false, canUpdate: false, canArchive: false, canViewSensitive: false });
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [detail, setDetail] = useState<Patient | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [dispensations, setDispensations] = useState<Dispensation[]>([]);
  const [query, setQuery] = useState("");
  const [sex, setSex] = useState("");
  const [status, setStatus] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/patients`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { patients?: Patient[]; permissions?: Permissions; message?: string } | null;
    if (response.ok && body?.patients && body.permissions) { setPatients(body.patients); setPermissions(body.permissions); }
    else setMessage(body?.message || "Chargement des patients impossible.");
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => patients.filter((patient) => {
    const text = `${patient.fullName} ${patient.phonePrimary} ${patient.patientNumber}`.toLocaleLowerCase("fr");
    const created = patient.createdAt.slice(0, 10);
    return (!query || text.includes(query.toLocaleLowerCase("fr"))) && (!sex || patient.sex === sex) && (!status || patient.status === status) && (!createdFrom || created >= createdFrom) && (!createdTo || created <= createdTo);
  }), [patients, query, sex, status, createdFrom, createdTo]);
  const list = useSmartList({ items: filtered, pageSize: 12, getSearchText: useCallback((patient: Patient) => `${patient.fullName} ${patient.phonePrimary} ${patient.patientNumber}`, []) });

  async function openDetail(patient: Patient) {
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/patients/${patient.id}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { patient?: Patient; related?: Related[]; dispensations?: Dispensation[]; message?: string } | null;
    if (response.ok && body?.patient) { setDetail(body.patient); setRelated(body.related || []); setDispensations(body.dispensations || []); } else setMessage(body?.message || "Détail patient indisponible.");
  }
  function openCreate() { setEditing(null); setForm(emptyForm()); setFormOpen(true); }
  function openEdit(patient: Patient, forcedStatus?: string) {
    setEditing(patient); setForm(formFromPatient(patient, forcedStatus)); setFormOpen(true);
  }
  function change(key: string, value: string | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(editing ? `/api/enterprise/${organizationId}/healthcare/patients/${editing.id}` : `/api/enterprise/${organizationId}/healthcare/patients`, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? (editing ? "Patient mis à jour et action historisée." : "Patient enregistré avec succès.") : body?.message || "Enregistrement impossible.");
    if (response.ok) { setFormOpen(false); setDetail(null); await load(); router.refresh(); }
  }
  function openRelated(moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) {
    setDetail(null);
    onOpenRelated(moduleCode, patientRecordId);
  }

  return <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-xl font-black text-dtsc-ink">Patients</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">Centralisez l’identité, les coordonnées, les contacts d’urgence et les informations médicales de base des patients de l’établissement.</p></div>{permissions.canCreate && <Button className="w-full bg-[#002b5b] text-white sm:w-auto" onClick={openCreate}><Plus className="h-4 w-4" />Nouveau patient</Button>}</div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4"><Filter label="Sexe"><Choice value={sex} onChange={setSex} options={SEX} all="Tous les sexes" /></Filter><Filter label="Statut"><Choice value={status} onChange={setStatus} options={STATUS} all="Tous les statuts" /></Filter><Filter label="Créés à partir du"><Input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /></Filter><Filter label="Créés jusqu’au"><Input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></Filter></div>
    <ListControls query={query} onQueryChange={setQuery} page={list.page} pageCount={list.pageCount} totalCount={patients.length} filteredCount={filtered.length} onPageChange={list.setPage} placeholder="Nom, téléphone ou identifiant patient..." />
    {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((id) => <div key={id} className="h-40 animate-pulse rounded-2xl bg-dtsc-page" />)}</div> : <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.paginatedItems.map((patient) => <PatientCard key={patient.id} patient={patient} permissions={permissions} openDetail={openDetail} openEdit={openEdit} activeModuleCodes={activeModuleCodes} onOpenRelated={openRelated} />)}</div>}
    {!loading && !filtered.length && <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center"><p className="font-black text-dtsc-ink">Aucun patient enregistré pour cette entreprise.</p><p className="mt-1 text-sm text-dtsc-muted">Enregistrez le premier patient pour relier ensuite ses rendez-vous, consultations et documents médicaux.</p></div>}

    <PatientForm open={formOpen} close={() => setFormOpen(false)} save={save} form={form} change={change} editing={editing} canViewSensitive={permissions.canViewSensitive} />
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.patientNumber} · ${detail.fullName}` : "Détail patient"} description="Résumé administratif, informations médicales autorisées, activité liée et historique." className="h-[94dvh] max-w-6xl">{detail && <PatientDetail patient={detail} related={related} dispensations={dispensations} permissions={permissions} openEdit={openEdit} activeModuleCodes={activeModuleCodes} onOpenRelated={openRelated} />}</Dialog>
  </section>;
}

function PatientCard({ patient, permissions, openDetail, openEdit, activeModuleCodes, onOpenRelated }: { patient: Patient; permissions: Permissions; openDetail: (patient: Patient) => Promise<void>; openEdit: (patient: Patient, status?: string) => void; activeModuleCodes: Set<string>; onOpenRelated: (moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) => void }) {
  const actions: ActionMenuItem[] = [{ key: "detail", label: "Voir le détail", icon: Eye, onSelect: () => void openDetail(patient) }];
  if (permissions.canUpdate) actions.push({ key: "edit", label: "Modifier", icon: FilePenLine, onSelect: () => openEdit(patient) });
  if (permissions.canUpdate && activeModuleCodes.has("APPOINTMENTS")) actions.push({ key: "appointment", label: "Créer un rendez-vous", icon: CalendarPlus, onSelect: () => onOpenRelated("APPOINTMENTS", patient.legacyRecordId || undefined) });
  if (permissions.canUpdate && activeModuleCodes.has("CONSULTATIONS")) actions.push({ key: "consultation", label: "Créer une consultation", icon: ClipboardPlus, onSelect: () => onOpenRelated("CONSULTATIONS", patient.legacyRecordId || undefined) });
  if (permissions.canArchive && patient.status !== "ARCHIVED") actions.push({ key: "archive", label: "Archiver", icon: Archive, destructive: true, onSelect: () => openEdit(patient, "ARCHIVED") });
  return <article className="relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 pr-14"><div className="absolute right-3 top-3"><ActionMenu items={actions} /></div><div className="flex flex-wrap gap-2"><Badge text={STATUS[patient.status as keyof typeof STATUS] || patient.status} /><Badge text={SEX[patient.sex as keyof typeof SEX] || patient.sex} /></div><button type="button" onClick={() => void openDetail(patient)} className="mt-3 block min-w-0 text-left"><p className="text-xs font-black uppercase text-cyan-600">{patient.patientNumber}</p><h4 className="mt-1 break-words font-black text-dtsc-ink">{patient.fullName}</h4><p className="mt-1 text-sm text-dtsc-muted">{patient.phonePrimary} · {age(patient.birthDate)}</p><p className="mt-2 text-xs font-bold text-dtsc-muted">Créé le {date(patient.createdAt)}{patient.lastConsultation ? ` · Dernière consultation : ${date(patient.lastConsultation.updatedAt)}` : ""}</p></button></article>;
}

function PatientForm({ open, close, save, form, change, editing, canViewSensitive }: { open: boolean; close: () => void; save: (event: FormEvent<HTMLFormElement>) => Promise<void>; form: Form; change: (key: string, value: string | boolean) => void; editing: Patient | null; canViewSensitive: boolean }) {
  const statusNeedsReason = editing && (form.status === "ARCHIVED" || form.status === "DECEASED");
  return <Dialog open={open} onClose={close} title={editing ? `Modifier ${editing.fullName}` : "Nouveau patient"} description="Formulaire patient structuré et isolé dans l’établissement actif." className="h-[94dvh] max-w-6xl"><form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden"><Section title="Identité du patient"><Grid><F n="fullName" l="Nom complet" h="Nom officiel utilisé dans le dossier patient."><Input required value={String(form.fullName)} onChange={e=>change("fullName",e.target.value)} /></F><F n="sex" l="Sexe" h="Information administrative et clinique du patient."><Choice value={String(form.sex)} onChange={v=>change("sex",v)} options={SEX} /></F><F n="birthDate" l="Date de naissance" h="Permet de calculer automatiquement l’âge."><Input type="date" value={String(form.birthDate)} onChange={e=>change("birthDate",e.target.value)} /></F><F n="maritalStatus" l="État civil" h="Information administrative optionnelle."><Input value={String(form.maritalStatus)} onChange={e=>change("maritalStatus",e.target.value)} /></F><F n="profession" l="Profession" h="Profession déclarée par le patient."><Input value={String(form.profession)} onChange={e=>change("profession",e.target.value)} /></F></Grid></Section><Section title="Coordonnées"><Grid><F n="phonePrimary" l="Téléphone principal" h="Numéro prioritaire pour contacter le patient."><Input required value={String(form.phonePrimary)} onChange={e=>change("phonePrimary",e.target.value)} /></F><F n="phoneSecondary" l="Téléphone secondaire" h="Numéro complémentaire optionnel."><Input value={String(form.phoneSecondary)} onChange={e=>change("phoneSecondary",e.target.value)} /></F><F n="email" l="Adresse email" h="Email optionnel du patient."><Input type="email" value={String(form.email)} onChange={e=>change("email",e.target.value)} /></F><F n="address" l="Adresse" h="Adresse principale déclarée."><Input required value={String(form.address)} onChange={e=>change("address",e.target.value)} /></F><F n="city" l="Commune ou ville" h="Commune ou ville de résidence."><Input value={String(form.city)} onChange={e=>change("city",e.target.value)} /></F><F n="country" l="Pays" h="Pays de résidence."><Input value={String(form.country)} onChange={e=>change("country",e.target.value)} /></F></Grid></Section><Section title="Contact d’urgence"><Grid><F n="emergencyContactName" l="Nom du contact" h="Personne à prévenir en cas d’urgence."><Input required value={String(form.emergencyContactName)} onChange={e=>change("emergencyContactName",e.target.value)} /></F><F n="emergencyContactRelationship" l="Lien avec le patient" h="Relation entre le patient et son contact d’urgence."><Input value={String(form.emergencyContactRelationship)} onChange={e=>change("emergencyContactRelationship",e.target.value)} /></F><F n="emergencyContactPhone" l="Téléphone du contact" h="Numéro à utiliser en cas d’urgence."><Input required value={String(form.emergencyContactPhone)} onChange={e=>change("emergencyContactPhone",e.target.value)} /></F><F n="emergencyContactAddress" l="Adresse du contact" h="Adresse optionnelle du contact d’urgence."><Input value={String(form.emergencyContactAddress)} onChange={e=>change("emergencyContactAddress",e.target.value)} /></F></Grid></Section>{canViewSensitive && <Section title="Informations médicales de base"><Grid><F n="bloodGroup" l="Groupe sanguin" h="Groupe sanguin connu et vérifié."><Input value={String(form.bloodGroup)} onChange={e=>change("bloodGroup",e.target.value)} /></F><F n="knownAllergies" l="Allergies connues" h="Allergies importantes déclarées ou confirmées."><Area value={String(form.knownAllergies)} set={v=>change("knownAllergies",v)} /></F><F n="importantHistory" l="Antécédents importants" h="Antécédents utiles à la prise en charge."><Area value={String(form.importantHistory)} set={v=>change("importantHistory",v)} /></F><F n="chronicTreatments" l="Traitements chroniques connus" h="Traitements suivis durablement par le patient."><Area value={String(form.chronicTreatments)} set={v=>change("chronicTreatments",v)} /></F><F n="medicalNotes" l="Notes médicales de base" h="Notes médicales sensibles réservées aux personnes autorisées."><Area value={String(form.medicalNotes)} set={v=>change("medicalNotes",v)} /></F></Grid></Section>}<Section title="Informations administratives"><Grid><F n="status" l="Statut patient" h="État administratif actuel du patient."><Choice value={String(form.status)} onChange={v=>change("status",v)} options={STATUS} /></F><F n="registrationSource" l="Source d’enregistrement" h="Contexte dans lequel le patient a été enregistré."><Choice value={String(form.registrationSource)} onChange={v=>change("registrationSource",v)} options={SOURCES} /></F><label className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={form.insuranceKnown===true} onChange={e=>change("insuranceKnown",e.target.checked)} /><span className="flex items-center gap-1">Assurance connue<span title="Indique si une prise en charge ou une assurance est connue pour ce patient." aria-label="Assurance connue : indique si une prise en charge est connue."><CircleHelp className="h-3.5 w-3.5"/></span></span></label><F n="insuranceReference" l="Référence assurance" h="Numéro de carte ou référence connue."><Input value={String(form.insuranceReference)} onChange={e=>change("insuranceReference",e.target.value)} /></F><F n="administrativeNotes" l="Notes administratives" h="Informations utiles à l’accueil et au suivi administratif."><Area value={String(form.administrativeNotes)} set={v=>change("administrativeNotes",v)} /></F>{statusNeedsReason && <F n="actionReason" l="Motif obligatoire du changement" h="Expliquez l’archivage ou la déclaration de décès."><Area required value={String(form.actionReason)} set={v=>change("actionReason",v)} /></F>}</Grid></Section><div className="grid gap-2 sm:flex"><Button className="w-full bg-[#002b5b] text-white sm:w-auto">Enregistrer</Button><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={close}>Annuler</Button></div></form></Dialog>;
}

function PatientDetail({ patient, related, dispensations, permissions, openEdit, activeModuleCodes, onOpenRelated }: { patient: Patient; related: Related[]; dispensations: Dispensation[]; permissions: Permissions; openEdit: (patient: Patient, status?: string) => void; activeModuleCodes: Set<string>; onOpenRelated: (moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) => void }) {
  return <div className="grid min-w-0 gap-4"><div className="flex flex-wrap gap-2">{permissions.canUpdate && <Button onClick={()=>openEdit(patient)}><FilePenLine />Modifier</Button>}{permissions.canUpdate&&activeModuleCodes.has("APPOINTMENTS")&&<Button variant="outline" onClick={()=>onOpenRelated("APPOINTMENTS",patient.legacyRecordId||undefined)}><CalendarPlus />Créer rendez-vous</Button>}{permissions.canUpdate&&activeModuleCodes.has("CONSULTATIONS")&&<Button variant="outline" onClick={()=>onOpenRelated("CONSULTATIONS",patient.legacyRecordId||undefined)}><ClipboardPlus />Créer consultation</Button>}{permissions.canUpdate&&activeModuleCodes.has("MEDICAL_DOCUMENTS")&&<Button variant="outline" onClick={()=>onOpenRelated("MEDICAL_DOCUMENTS",patient.legacyRecordId||undefined)}><Plus />Ajouter document</Button>}{permissions.canUpdate&&activeModuleCodes.has("MEDICAL_RECORDS")&&<Button variant="outline" onClick={()=>onOpenRelated("MEDICAL_RECORDS",patient.legacyRecordId||undefined)}><HeartPulse />Voir dossier médical</Button>}</div><div className="grid gap-4 lg:grid-cols-2"><Info title="Résumé administratif" rows={[["Identifiant",patient.patientNumber],["Nom complet",patient.fullName],["Sexe",SEX[patient.sex as keyof typeof SEX]||patient.sex],["Âge",age(patient.birthDate)],["Téléphone",patient.phonePrimary],["Adresse",`${patient.address}${patient.city?` · ${patient.city}`:""}`],["Statut",STATUS[patient.status as keyof typeof STATUS]||patient.status]]}/><Info title="Contact d’urgence" rows={[["Nom",patient.emergencyContactName],["Lien",patient.emergencyContactRelationship],["Téléphone",patient.emergencyContactPhone],["Adresse",patient.emergencyContactAddress]]}/>{permissions.canViewSensitive?<Info title="Informations médicales de base" rows={[["Groupe sanguin",patient.bloodGroup],["Allergies",patient.knownAllergies],["Antécédents",patient.importantHistory],["Traitements chroniques",patient.chronicTreatments],["Notes médicales",patient.medicalNotes]]}/>:<section className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4"><div className="flex gap-2"><ShieldAlert className="h-5 w-5 text-amber-600"/><div><h4 className="font-black">Informations médicales protégées</h4><p className="mt-1 text-sm text-dtsc-muted">Votre niveau d’accès permet uniquement de consulter les informations administratives du patient.</p></div></div></section>}<Info title="Historique minimal" rows={[["Créé le",date(patient.createdAt)],["Créé par",patient.createdBy.name],["Dernière modification",date(patient.updatedAt)],["Modifié par",patient.updatedBy?.name||"Non renseigné"],["Source",SOURCES[patient.registrationSource as keyof typeof SOURCES]||patient.registrationSource]]}/></div><section className="rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">Dernières délivrances pharmacie</h4><div className="mt-3 grid gap-2">{dispensations.map(item=><article key={item.id} className="rounded-xl bg-dtsc-page p-3"><p className="font-black">{item.product.productCode} · {item.product.name}</p><p className="text-sm text-dtsc-muted">{item.quantity} {item.product.unit} · {date(item.dispensedAt)} · {item.dispensedBy.name}</p></article>)}{!dispensations.length&&<p className="text-sm text-dtsc-muted">Aucune délivrance pharmacie accessible pour ce patient.</p>}</div></section><section className="rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">Activité liée</h4><div className="mt-3 grid gap-2 sm:grid-cols-2">{related.map(item=><article key={item.id} className="rounded-xl bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-cyan-600">{MODULE_LABELS[item.moduleCode]||item.moduleCode} · {item.status}</p><p className="mt-1 font-bold">{item.title}</p><p className="mt-1 text-xs text-dtsc-muted">{date(item.updatedAt)}</p></article>)}{!related.length&&<p className="text-sm text-dtsc-muted">Aucune activité liée n’est encore disponible pour ce patient.</p>}</div></section><section className="rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">Historique des actions</h4><div className="mt-3 grid gap-2">{patient.events?.map(event=><article key={event.id} className="rounded-xl bg-dtsc-page p-3"><p className="text-xs font-black uppercase text-cyan-600">{event.eventType} · {event.actor.name}</p><p className="mt-1 text-sm">{event.summary}</p><p className="mt-1 text-xs text-dtsc-muted">{date(event.createdAt)}</p></article>)}</div></section></div>;
}

function Filter({label,children}:{label:string;children:ReactNode}){return <label className="grid min-w-0 gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="flex items-center gap-1">{label}<span title={`Filtrer la liste par ${label.toLocaleLowerCase("fr")}.`} aria-label={`Aide filtre ${label}`}><CircleHelp className="h-3.5 w-3.5"/></span></span>{children}</label>}
function F({l,h,children}:{n:string;l:string;h:string;children:ReactNode}){return <label className="grid min-w-0 gap-1"><span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{l}<span title={h} aria-label={`${l} : ${h}`}><CircleHelp className="h-3.5 w-3.5"/></span></span>{children}</label>}
function Choice({value,onChange,options,all}:{value:string;onChange:(v:string)=>void;options:Record<string,string>;all?:string}){return <select value={value} onChange={e=>onChange(e.target.value)} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">{all&&<option value="">{all}</option>}{Object.entries(options).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>}
function Area({value,set,required}:{value:string;set:(v:string)=>void;required?:boolean}){return <textarea required={required} value={value} onChange={e=>set(e.target.value)} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink"/>}
function Section({title,children}:{title:string;children:ReactNode}){return <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><h4 className="font-black text-cyan-600">{title}</h4>{children}</section>}
function Grid({children}:{children:ReactNode}){return <div className="grid min-w-0 gap-3 md:grid-cols-2">{children}</div>}
function Info({title,rows}:{title:string;rows:Array<[string,string|null|undefined]>}){return <section className="rounded-2xl border border-dtsc-border p-4"><h4 className="font-black">{title}</h4><dl className="mt-3 grid gap-2">{rows.map(([label,value])=><div key={label} className="grid gap-1 rounded-xl bg-dtsc-page p-3"><dt className="text-xs font-black uppercase text-dtsc-muted">{label}</dt><dd className="break-words text-sm font-bold">{value||"Non renseigné"}</dd></div>)}</dl></section>}
function Badge({text}:{text:string}){return <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{text}</span>}
function date(v:string){return new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v))}
function age(v:string|null){if(!v)return"Âge non renseigné";const birth=new Date(v),today=new Date();let years=today.getFullYear()-birth.getFullYear();if(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate()))years--;return`${years} ans`}
