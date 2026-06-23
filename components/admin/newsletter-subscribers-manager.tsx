"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type Subscriber = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  requestedService?: string | null;
  needDescription?: string | null;
  urgency?: string | null;
  estimatedBudget?: string | null;
  preferredContactChannel?: string | null;
  aiSummary?: string | null;
  source: string;
  signupPage?: string | null;
  interest?: string | null;
  consent: boolean;
  commercialConsent: boolean;
  status: string;
  internalNotes?: string | null;
  convertedToUser: boolean;
  convertedUserId?: string | null;
  convertedAt?: string | null;
  createdAt: string;
};

type UserOption = { id: string; name: string; email: string };

const statuses = ["new_ai_lead", "NEW", "TO_QUALIFY", "ACTIVE_PROSPECT", "CONTACTED", "INTERESTED", "CONVERTED", "UNSUBSCRIBED", "ARCHIVED"];

export function NewsletterSubscribersManager({ canManage }: { canManage: boolean }) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<Subscriber | null>(null);
  const [message, setMessage] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  useToastMessage(message);
  const list = useSmartList({
    items: subscribers,
    pageSize: 8,
    getSearchText: (subscriber) => `${subscriber.name} ${subscriber.email} ${subscriber.companyName || ""} ${subscriber.status} ${subscriber.interest || ""} ${subscriber.requestedService || ""} ${subscriber.needDescription || ""}`,
  });

  useEffect(() => {
    fetch("/api/admin/newsletter-subscribers")
      .then((response) => response.json())
      .then((body: { subscribers?: Subscriber[]; users?: UserOption[] }) => {
        setSubscribers(body.subscribers || []);
        setUsers(body.users || []);
      })
      .catch(() => setMessage("Impossible de charger les inscrits newsletter."));
  }, []);

  const metrics = useMemo(() => ({
    total: subscribers.length,
    newOnes: subscribers.filter((subscriber) => subscriber.status === "NEW" || subscriber.status === "ACTIVE" || subscriber.status === "new_ai_lead").length,
    converted: subscribers.filter((subscriber) => subscriber.convertedToUser || subscriber.status === "CONVERTED").length,
  }), [subscribers]);

  async function saveSubscriber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/admin/newsletter-subscribers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, id: selected.id }),
    });
    const body = (await response.json().catch(() => null)) as { subscriber?: Subscriber; message?: string } | null;
    setMessage(response.ok ? "Inscrit newsletter mis à jour." : body?.message || "Mise à jour impossible.");
    const savedSubscriber = body?.subscriber;
    if (response.ok && savedSubscriber) {
      setSubscribers((items) => items.map((item) => item.id === savedSubscriber.id ? savedSubscriber : item));
      setSelected(savedSubscriber);
      setConfirmSave(false);
    }
  }

  return (
    <section className="dtsc-card p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-bold text-cyan-600">Prospects</p>
          <h2 className="mt-1 font-black text-dtsc-ink">Inscrits newsletter</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-dtsc-muted">Visualisez, qualifiez et convertissez explicitement les visiteurs inscrits à la newsletter.</p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <Metric label="Total" value={metrics.total} />
          <Metric label="Nouveaux" value={metrics.newOnes} />
          <Metric label="Convertis" value={metrics.converted} />
        </div>
      </div>

      <div className="mt-4">
        <ListControls
          query={list.query}
          onQueryChange={list.setQuery}
          page={list.page}
          pageCount={list.pageCount}
          totalCount={list.totalCount}
          filteredCount={list.filteredCount}
          placeholder="Rechercher nom, email, entreprise, statut..."
          onPageChange={list.setPage}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-dtsc-muted">
            <tr>
              <th className="py-3">Prospect</th>
              <th>Entreprise</th>
              <th>Source</th>
              <th>Statut</th>
              <th>Consentement</th>
              <th>Inscription</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dtsc-border text-dtsc-muted">
            {list.paginatedItems.map((subscriber) => (
              <tr key={subscriber.id}>
                <td className="py-3">
                  <button type="button" onClick={() => setSelected(subscriber)} className="text-left font-bold text-dtsc-ink hover:text-cyan-600">
                    {subscriber.name}
                    <span className="block text-xs font-medium text-dtsc-muted">{subscriber.email}</span>
                  </button>
                </td>
                <td>{subscriber.companyName || "-"}</td>
                <td>{subscriber.signupPage || subscriber.source}</td>
                <td>{formatEnumLabel(subscriber.status)}</td>
                <td>{subscriber.consent ? "Newsletter" : "Non"}{subscriber.commercialConsent ? " · Contact commercial" : ""}</td>
                <td>{new Date(subscriber.createdAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.filteredCount && <p className="py-6 text-sm text-dtsc-muted">Aucun inscrit newsletter.</p>}
      </div>

      {selected && (
        <Dialog open={true} title="Détail inscrit newsletter" onClose={() => {
          setSelected(null);
          setConfirmSave(false);
        }} className="max-w-3xl">
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              setConfirmSave(true);
            }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <p className="font-black text-dtsc-ink">{selected.name}</p>
              <p className="text-sm text-dtsc-muted">{selected.email}</p>
              <p className="mt-2 text-sm text-dtsc-muted">{[selected.phone, selected.companyName, selected.jobTitle, selected.interest].filter(Boolean).join(" · ") || "Informations complémentaires non renseignées."}</p>
              {(selected.requestedService || selected.needDescription || selected.aiSummary) && (
                <div className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm leading-6 text-dtsc-muted">
                  {selected.requestedService && <p><strong className="text-dtsc-ink">Service demandé:</strong> {selected.requestedService}</p>}
                  {selected.needDescription && <p><strong className="text-dtsc-ink">Besoin:</strong> {selected.needDescription}</p>}
                  {selected.urgency && <p><strong className="text-dtsc-ink">Urgence:</strong> {selected.urgency}</p>}
                  {selected.estimatedBudget && <p><strong className="text-dtsc-ink">Budget:</strong> {selected.estimatedBudget}</p>}
                  {selected.preferredContactChannel && <p><strong className="text-dtsc-ink">Canal préféré:</strong> {selected.preferredContactChannel}</p>}
                  {selected.aiSummary && <p><strong className="text-dtsc-ink">Résumé IA:</strong> {selected.aiSummary}</p>}
                </div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select name="status" defaultValue={selected.status === "ACTIVE" ? "NEW" : selected.status} disabled={!canManage} className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
                {statuses.map((status) => <option key={status} value={status}>{formatEnumLabel(status)}</option>)}
              </select>
              <select name="convertedUserId" defaultValue={selected.convertedUserId || ""} disabled={!canManage} className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
                <option value="">Lier à un utilisateur existant</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
              </select>
            </div>
            <textarea name="internalNotes" defaultValue={selected.internalNotes || ""} disabled={!canManage} placeholder="Notes internes de qualification..." className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
            <div className="flex flex-wrap gap-2">
              <Button name="action" value="UPDATE" disabled={!canManage} className="rounded-xl bg-[#002b5b] text-white"><MailCheck className="h-4 w-4" /> Enregistrer</Button>
              <Button name="action" value="CONVERT_EXISTING" disabled={!canManage} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Convertir avec lien utilisateur</Button>
              <Button name="action" value="UNSUBSCRIBE" disabled={!canManage} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Désabonner</Button>
              <Button name="action" value="ARCHIVE" disabled={!canManage} variant="outline" className="rounded-xl border-red-200 text-red-500">Archiver</Button>
            </div>
          </form>
        </Dialog>
      )}

      <Dialog
        open={confirmSave}
        title="Confirmer la modification"
        description="Cette action mettra à jour le statut, les notes ou la conversion de ce prospect newsletter."
        onClose={() => setConfirmSave(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmSave(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              Annuler
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-[#002b5b] text-white"
              onClick={() => {
                if (formRef.current) {
                  const submitEvent = { preventDefault() {}, currentTarget: formRef.current } as FormEvent<HTMLFormElement>;
                  saveSubscriber(submitEvent);
                }
              }}
            >
              Confirmer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Vérifiez les informations du prospect avant de confirmer cette action.</p>
      </Dialog>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{label}</p>
      <p className="text-lg font-black text-dtsc-ink">{value}</p>
    </div>
  );
}
