"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles } from "lucide-react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
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

export function EnterpriseActivitiesModule({
  organization,
  blocks,
  requests,
}: {
  organization: {
    id: string;
    name: string;
    sector: string | null;
    businessSector: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
  };
  blocks: ActivityBlock[];
  requests: ActivityRequest[];
}) {
  const router = useRouter();
  const [selectedBlockCode, setSelectedBlockCode] = useState(blocks[0]?.blockCode || "");
  const [message, setMessage] = useState("");
  const selectedBlock = useMemo(() => blocks.find((block) => block.blockCode === selectedBlockCode) || null, [blocks, selectedBlockCode]);
  const list = useSmartList({
    items: requests,
    pageSize: 8,
    getSearchText: (request) => `${request.title} ${request.description} ${request.status} ${request.priority} ${request.blockCode}`,
  });

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBlockCode) {
      setMessage("Choisissez un bloc d'activité.");
      return;
    }
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/enterprise/${organization.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, blockCode: selectedBlockCode }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Demande envoyée." : body?.message || "Envoi impossible.");
    if (response.ok) {
      event.currentTarget.reset();
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
        <AccordionItem title="Actions rapides" defaultOpen>
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
                  <span className="mt-1 block max-w-56 truncate text-xs font-semibold text-dtsc-muted">{block.targetModuleCode || "Socle commun"}</span>
                </button>
              );
            })}
          </div>
          <form onSubmit={createRequest} className="mt-4 grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex items-start gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-3">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-cyan-600" />
              <div>
                <p className="font-black text-dtsc-ink">{selectedBlock?.labelFr || "Choisissez une action"}</p>
                <p className="text-xs font-semibold text-dtsc-muted">{selectedBlock?.descriptionFr || "Le formulaire créera une vraie demande liée à votre organisation."}</p>
              </div>
            </div>
            <Input name="title" placeholder="Titre de la demande" required />
            <textarea name="description" required placeholder="Décrivez précisément la demande, le rapport ou le problème." className="min-h-32 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
            <select name="priority" defaultValue="NORMAL" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="LOW">Faible</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Élevée</option>
              <option value="CRITICAL">Critique</option>
            </select>
            <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Send className="h-4 w-4" />
              Envoyer la demande
            </Button>
          </form>
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
