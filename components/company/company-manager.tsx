"use client";

import { useState, type FormEvent } from "react";
import { BriefcaseBusiness, Edit3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
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
  const [message, setMessage] = useState("");
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
    setMessage(response.ok ? "Profil entreprise enregistré. Le chatbot utilisera ce contexte dans votre espace privé." : body?.error || "Impossible d'enregistrer le profil entreprise.");
    if (response.ok) {
      setProfile(body.profile);
    }
  }

  async function deleteProfile() {
    const response = await fetch("/api/company/profile", { method: "DELETE" });
    setMessage(response.ok ? "Profil entreprise supprimé." : "Impossible de supprimer le profil entreprise.");
    if (response.ok) {
      setProfile(null);
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
      setMessage(body?.error || "Impossible d'enregistrer l'activité.");
      return;
    }
    setActivities((current) => activityId ? current.map((item) => (item.id === activityId ? body.activity : item)) : [body.activity, ...current]);
    form.reset();
    setEditingActivity(null);
    setMessage("Activité métier enregistrée.");
  }

  async function deleteActivity(id: string) {
    const response = await fetch(`/api/company/activities/${id}`, { method: "DELETE" });
    setMessage(response.ok ? "Activité supprimée." : "Impossible de supprimer l'activité.");
    if (response.ok) {
      setActivities((current) => current.filter((item) => item.id !== id));
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
        <form onSubmit={saveProfile} className="mt-6 grid gap-4 md:grid-cols-2">
          {profileFields.map((field) => (
            <label key={field.name} title={field.title} className={field.textarea ? "grid gap-1 text-sm font-bold text-dtsc-ink md:col-span-2" : "grid gap-1 text-sm font-bold text-dtsc-ink"}>
              {field.label}
              {field.textarea ? (
                <textarea name={field.name} defaultValue={profile?.[field.name] || ""} placeholder={field.placeholder} required={field.required} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
              ) : (
                <Input name={field.name} defaultValue={profile?.[field.name] || ""} placeholder={field.placeholder} required={field.required} />
              )}
            </label>
          ))}
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Enregistrer le profil entreprise pour personnaliser les réponses du chatbot.">Enregistrer le profil</Button>
            <Button type="button" variant="outline" onClick={deleteProfile} className="rounded-xl text-red-300" title="Supprimer le contexte entreprise de votre espace privé.">
              Supprimer le profil
            </Button>
          </div>
        </form>
      </section>

      <section className="dtsc-card p-6">
        <h2 className="text-2xl font-black text-dtsc-ink">Activités professionnelles</h2>
        <p className="mt-2 text-sm leading-6 text-dtsc-muted">
          Décrivez vos activités récurrentes, les données utilisées, les outils, les irritants et les priorités. Le chatbot adaptera ses conseils à ces informations.
        </p>
        <form onSubmit={(event) => saveActivity(event)} className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_180px]">
          <Input name="title" placeholder="Activité: reporting commercial" required />
          <Input name="frequency" placeholder="Fréquence: quotidien, mensuel..." />
          <select name="priority" className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
          </select>
          <textarea name="description" placeholder="Description de l'activité" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink lg:col-span-3" required />
          <Input name="tools" placeholder="Outils utilisés" />
          <Input name="dataInputs" placeholder="Données en entrée" />
          <Input name="dataOutputs" placeholder="Résultats / rapports produits" />
          <textarea name="painPoints" placeholder="Difficultés, risques ou pertes de temps" className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink lg:col-span-3" />
          <div className="lg:col-span-3">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Ajouter cette activité au contexte professionnel du chatbot.">Ajouter l&apos;activité</Button>
          </div>
        </form>

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

      <Dialog open={Boolean(message)} title="Entreprise" onClose={() => setMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{message}</p>
      </Dialog>

      <Dialog open={Boolean(editingActivity)} title="Modifier l'activité" onClose={() => setEditingActivity(null)}>
        {editingActivity && (
          <form onSubmit={(event) => saveActivity(event, editingActivity.id)} className="grid gap-3">
            <Input name="title" defaultValue={editingActivity.title} required />
            <Input name="frequency" defaultValue={editingActivity.frequency || ""} />
            <select name="priority" defaultValue={editingActivity.priority} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
            </select>
            <textarea name="description" defaultValue={editingActivity.description} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
            <Input name="tools" defaultValue={editingActivity.tools || ""} />
            <Input name="dataInputs" defaultValue={editingActivity.dataInputs || ""} />
            <Input name="dataOutputs" defaultValue={editingActivity.dataOutputs || ""} />
            <textarea name="painPoints" defaultValue={editingActivity.painPoints || ""} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
