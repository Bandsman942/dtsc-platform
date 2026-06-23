"use client";

import { useState, type FormEvent } from "react";
import { BriefcaseBusiness, Edit3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type CompanyProfile = {
  organizationName: string;
  legalForm?: string | null;
  sector?: string | null;
  sizeRange?: string | null;
  country?: string | null;
  city?: string | null;
  website?: string | null;
  description?: string | null;
  mission?: string | null;
  productsServices?: string | null;
  customers?: string | null;
  markets?: string | null;
  competitors?: string | null;
  processes?: string | null;
  tools?: string | null;
  dataSystems?: string | null;
  compliance?: string | null;
  challenges?: string | null;
  goals?: string | null;
  kpis?: string | null;
  userPosition?: string | null;
  department?: string | null;
  responsibilities?: string | null;
  decisionRole?: string | null;
};

type CompanyActivity = {
  id: string;
  title: string;
  description: string;
  frequency?: string | null;
  priority: string;
  tools?: string | null;
  dataInputs?: string | null;
  dataOutputs?: string | null;
  painPoints?: string | null;
};

const profileFields: Array<{ name: keyof CompanyProfile; label: string; placeholder: string; textarea?: boolean; required?: boolean; title: string }> = [
  { name: "organizationName", label: "Organisation", placeholder: "Nom de l'entreprise", required: true, title: "Nom officiel ou commercial de l'organisation." },
  { name: "legalForm", label: "Forme juridique", placeholder: "SARL, ASBL, SA, indépendant...", title: "Statut juridique utile pour le contexte administratif." },
  { name: "sector", label: "Secteur", placeholder: "Santé, assurance, éducation, commerce...", title: "Secteur principal d'activité." },
  { name: "sizeRange", label: "Taille", placeholder: "1-10, 11-50, 51-200, 200+ employés", title: "Taille approximative de l'organisation." },
  { name: "country", label: "Pays", placeholder: "RDC", title: "Pays principal d'activité." },
  { name: "city", label: "Ville", placeholder: "Kinshasa", title: "Ville ou zone principale." },
  { name: "website", label: "Site web", placeholder: "https://...", title: "Site ou page officielle de l'organisation." },
  { name: "description", label: "Description", placeholder: "Résumé de l'activité et du positionnement", textarea: true, title: "Résumé global utilisé par le chatbot pour comprendre le contexte." },
  { name: "mission", label: "Mission", placeholder: "Mission, vision ou proposition de valeur", textarea: true, title: "Ce que votre organisation cherche à accomplir." },
  { name: "productsServices", label: "Produits / services", placeholder: "Offres, produits, services, prestations", textarea: true, title: "Catalogue ou familles d'offres." },
  { name: "customers", label: "Clients", placeholder: "Segments clients, bénéficiaires, utilisateurs", textarea: true, title: "Clients ou publics servis." },
  { name: "markets", label: "Marchés", placeholder: "Zones, canaux, opportunités", textarea: true, title: "Marchés et zones d'intervention." },
  { name: "competitors", label: "Concurrents", placeholder: "Concurrents directs, alternatives, risques", textarea: true, title: "Acteurs ou alternatives qui influencent votre marché." },
  { name: "processes", label: "Processus clés", placeholder: "Vente, production, support, reporting, qualité...", textarea: true, title: "Processus importants pour votre performance." },
  { name: "tools", label: "Outils", placeholder: "Excel, CRM, ERP, WhatsApp, Power BI...", textarea: true, title: "Outils utilisés dans vos opérations." },
  { name: "dataSystems", label: "Données & systèmes", placeholder: "Sources de données, fichiers, bases, rapports", textarea: true, title: "Systèmes et sources de données disponibles." },
  { name: "compliance", label: "Conformité", placeholder: "Exigences qualité, confidentialité, sécurité, reporting", textarea: true, title: "Contraintes réglementaires, qualité ou sécurité." },
  { name: "challenges", label: "Défis", placeholder: "Difficultés, irritants, coûts, lenteurs, risques", textarea: true, title: "Problèmes que le chatbot doit prendre en compte." },
  { name: "goals", label: "Objectifs", placeholder: "Objectifs commerciaux, opérationnels, data, IA", textarea: true, title: "Résultats recherchés." },
  { name: "kpis", label: "KPI", placeholder: "Indicateurs à suivre", textarea: true, title: "Indicateurs utiles à votre pilotage." },
  { name: "userPosition", label: "Votre poste", placeholder: "Responsable commercial, analyste, dirigeant...", title: "Votre rôle dans l'organisation." },
  { name: "department", label: "Département", placeholder: "Direction, finance, opérations, IT...", title: "Votre service ou équipe." },
  { name: "responsibilities", label: "Responsabilités", placeholder: "Missions, tâches, périmètre de décision", textarea: true, title: "Vos responsabilités professionnelles." },
  { name: "decisionRole", label: "Rôle décisionnel", placeholder: "Décideur, prescripteur, contributeur, approbateur...", textarea: true, title: "Votre niveau d'implication dans les décisions." },
];

export function CompanyManager({ initialProfile, initialActivities }: { initialProfile: CompanyProfile | null; initialActivities: CompanyActivity[] }) {
  const [profile, setProfile] = useState(initialProfile);
  const [activities, setActivities] = useState(initialActivities);
  const [editingActivity, setEditingActivity] = useState<CompanyActivity | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const smartList = useSmartList({
    items: activities,
    pageSize: 5,
    getSearchText: (activity) => `${activity.title} ${activity.description} ${activity.priority} ${activity.tools || ""}`,
  });

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/company/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setProfile(body.profile);
      setProfileDialogOpen(false);
      toastSuccess("Profil entreprise enregistré. Le chatbot utilisera ce contexte dans votre espace privé.");
    } else {
      toastError(body?.error || "Impossible d'enregistrer le profil entreprise.");
    }
  }

  async function deleteProfile() {
    const response = await fetch("/api/company/profile", { method: "DELETE" });
    if (response.ok) {
      setProfile(null);
      setProfileDialogOpen(false);
      toastSuccess("Profil entreprise supprimé.");
    } else {
      toastError("Impossible de supprimer le profil entreprise.");
    }
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>, activityId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(activityId ? `/api/company/activities/${activityId}` : "/api/company/activities", {
      method: activityId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.error || "Impossible d'enregistrer l'activité.");
      return;
    }
    setActivities((current) => activityId ? current.map((item) => (item.id === activityId ? body.activity : item)) : [body.activity, ...current]);
    form.reset();
    setActivityDialogOpen(false);
    setEditingActivity(null);
    toastSuccess("Activité métier enregistrée.");
  }

  async function deleteActivity(id: string) {
    const response = await fetch(`/api/company/activities/${id}`, { method: "DELETE" });
    if (response.ok) {
      setActivities((current) => current.filter((item) => item.id !== id));
      toastSuccess("Activité supprimée.");
    } else {
      toastError("Impossible de supprimer l'activité.");
    }
  }

  return (
    <div className="grid gap-6">
      <section className="dtsc-card p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
            <BriefcaseBusiness className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-600">Contexte entreprise</p>
            <h2 className="mt-1 text-2xl font-black text-dtsc-ink">Profil professionnel utilisé par le chatbot</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
              Ces informations s&apos;inspirent des pratiques ISO 9001, gouvernance et cybersécurité: contexte, parties prenantes, processus, données, responsabilités, objectifs et indicateurs.
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-dtsc-border bg-dtsc-page p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{profile?.sector || "Secteur non renseigné"}</p>
          <h3 className="mt-1 text-xl font-black text-dtsc-ink">{profile?.organizationName || "Profil entreprise à compléter"}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-dtsc-muted">
            {profile?.description || "Renseignez le profil professionnel pour contextualiser le chatbot, les activités et les échanges liés à votre entreprise."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-dtsc-muted">
            <span className="rounded-full bg-dtsc-surface px-3 py-1">{profile?.city || "Ville non renseignée"}</span>
            <span className="rounded-full bg-dtsc-surface px-3 py-1">{profile?.sizeRange || "Taille non renseignée"}</span>
            <span className="rounded-full bg-dtsc-surface px-3 py-1">{profile?.userPosition || "Poste non renseigné"}</span>
          </div>
          <Button type="button" onClick={() => setProfileDialogOpen(true)} className="mt-5 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Ouvrir le formulaire plein écran du profil entreprise.">
            <Edit3 className="h-4 w-4" />
            Modifier le profil entreprise
          </Button>
        </div>
      </section>

      <section className="dtsc-card p-6">
        <h2 className="text-2xl font-black text-dtsc-ink">Activités professionnelles</h2>
        <p className="mt-2 text-sm leading-6 text-dtsc-muted">
          Décrivez vos activités récurrentes, les données utilisées, les outils, les irritants et les priorités. Le chatbot adaptera ses conseils à ces informations.
        </p>
        <Button type="button" onClick={() => setActivityDialogOpen(true)} className="mt-5 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Ouvrir le formulaire plein écran d'activité professionnelle.">
          <Plus className="h-4 w-4" />
          Ajouter une activité professionnelle
        </Button>

        <div className="mt-6">
          <ListControls
            query={smartList.query}
            onQueryChange={smartList.setQuery}
            page={smartList.page}
            pageCount={smartList.pageCount}
            totalCount={smartList.totalCount}
            filteredCount={smartList.filteredCount}
            placeholder="Rechercher une activité..."
            onPageChange={smartList.setPage}
          />
          <div className="divide-y divide-dtsc-border">
            {smartList.paginatedItems.map((activity) => (
              <article key={activity.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{formatEnumLabel(activity.priority)} · {activity.frequency || "Fréquence non renseignée"}</p>
                  <h3 className="mt-1 font-black text-dtsc-ink">{activity.title}</h3>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-dtsc-muted">{activity.description}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="icon" variant="outline" onClick={() => setEditingActivity(activity)} className="rounded-xl" title="Modifier cette activité.">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => deleteActivity(activity.id)} className="rounded-xl text-red-300" title="Supprimer cette activité.">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
            {!smartList.paginatedItems.length && <p className="py-8 text-sm text-dtsc-muted">Aucune activité professionnelle enregistrée.</p>}
          </div>
        </div>
      </section>

      <Dialog open={profileDialogOpen} title="Profil et activités entreprise" description="Renseignez le contexte professionnel utilisé par DTSC Platform et le chatbot dans votre espace privé." onClose={() => setProfileDialogOpen(false)} className="h-[92dvh] max-w-6xl">
        <CompanyProfileForm profile={profile} onSubmit={saveProfile} onDelete={deleteProfile} />
      </Dialog>

      <Dialog open={activityDialogOpen} title="Nouvelle activité professionnelle" description="Décrivez une activité réelle de votre contexte métier. Ces informations restent isolées dans le contexte actif." onClose={() => setActivityDialogOpen(false)} className="h-[92dvh] max-w-5xl">
        <ActivityForm onSubmit={(event) => saveActivity(event)} />
      </Dialog>

      <Dialog open={Boolean(editingActivity)} title="Modifier l'activité professionnelle" description="Mettez à jour les informations utilisées pour contextualiser le chatbot." onClose={() => setEditingActivity(null)} className="h-[92dvh] max-w-5xl">
        {editingActivity && (
          <ActivityForm activity={editingActivity} onSubmit={(event) => saveActivity(event, editingActivity.id)} />
        )}
      </Dialog>
    </div>
  );
}

function CompanyProfileForm({
  profile,
  onSubmit,
  onDelete,
}: {
  profile: CompanyProfile | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      {profileFields.map((field) => (
        <FormField key={field.name} label={field.label} hint={field.title} className={field.textarea ? "md:col-span-2" : undefined}>
          {field.textarea ? (
            <textarea name={field.name} defaultValue={profile?.[field.name] || ""} placeholder={field.placeholder} required={field.required} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
          ) : (
            <Input name={field.name} defaultValue={profile?.[field.name] || ""} placeholder={field.placeholder} required={field.required} />
          )}
        </FormField>
      ))}
      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-dtsc-border bg-dtsc-surface/95 py-4 backdrop-blur md:col-span-2">
        <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Enregistrer le profil entreprise pour personnaliser les réponses du chatbot.">Enregistrer le profil</Button>
        <Button type="button" variant="outline" onClick={onDelete} className="rounded-xl text-red-300" title="Supprimer le contexte entreprise de votre espace privé.">
          Supprimer le profil
        </Button>
      </div>
    </form>
  );
}

function ActivityForm({ activity, onSubmit }: { activity?: CompanyActivity; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <FormField label="Titre de l'activité" hint="Nommez clairement l'activité métier à documenter.">
        <Input name="title" defaultValue={activity?.title || ""} placeholder="Exemple: reporting commercial" required />
      </FormField>
      <FormField label="Fréquence" hint="Indiquez à quelle fréquence cette activité revient.">
        <Input name="frequency" defaultValue={activity?.frequency || ""} placeholder="Quotidien, hebdomadaire, mensuel..." />
      </FormField>
      <FormField label="Priorité" hint="Aidez le chatbot à comprendre l'importance opérationnelle.">
        <select name="priority" defaultValue={activity?.priority || "MEDIUM"} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
        </select>
      </FormField>
      <FormField label="Outils utilisés" hint="Listez les outils, fichiers ou logiciels utilisés." className="md:col-span-1">
        <Input name="tools" defaultValue={activity?.tools || ""} placeholder="Excel, CRM, WhatsApp, ERP..." />
      </FormField>
      <FormField label="Description" hint="Expliquez le déroulement réel de l'activité." className="md:col-span-2">
        <textarea name="description" defaultValue={activity?.description || ""} placeholder="Décrivez les étapes, acteurs et livrables." className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
      </FormField>
      <FormField label="Données en entrée" hint="Précisez les sources utilisées pour démarrer l'activité.">
        <Input name="dataInputs" defaultValue={activity?.dataInputs || ""} placeholder="Commandes, ventes, fichiers, demandes..." />
      </FormField>
      <FormField label="Résultats produits" hint="Indiquez les rapports, décisions ou documents générés.">
        <Input name="dataOutputs" defaultValue={activity?.dataOutputs || ""} placeholder="Rapport, tableau de bord, validation..." />
      </FormField>
      <FormField label="Difficultés et risques" hint="Mentionnez les lenteurs, risques, erreurs ou pertes de temps." className="md:col-span-2">
        <textarea name="painPoints" defaultValue={activity?.painPoints || ""} placeholder="Difficultés, risques ou pertes de temps." className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
      </FormField>
      <div className="md:col-span-2">
        <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Enregistrer cette activité dans le contexte professionnel.">
          {activity ? "Enregistrer les modifications" : "Ajouter l'activité"}
        </Button>
      </div>
    </form>
  );
}
