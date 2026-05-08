"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type DocumentItem = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  _count?: { chunks: number };
};

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function DocumentManager({ initialDocuments, maxDocuments }: { initialDocuments: DocumentItem[]; maxDocuments: number }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  const getSearchText = useCallback((item: DocumentItem) => `${item.title} ${item.fileName} ${item.status}`, []);
  const smartList = useSmartList({ items: documents, pageSize: 6, getSearchText });
  const usedSlots = useMemo(() => documents.filter((item) => item.status !== "FAILED").length, [documents]);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!file) {
      setMessage("Sélectionnez un fichier avant de lancer l'indexation.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("title", title);
    setIsPending(true);
    const response = await fetch("/api/documents", { method: "POST", body: formData });
    const body = await response.json().catch(() => null);
    setIsPending(false);

    if (!response.ok) {
      setMessage(body?.error || "Impossible d'indexer ce document.");
      return;
    }

    setDocuments((current) => [body.document, ...current]);
    setTitle("");
    setFile(null);
    setMessage("Document indexé. Le chatbot peut maintenant s'appuyer sur ce contenu.");
  }

  async function deleteDocument(id: string) {
    setMessage("");
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Impossible de supprimer ce document.");
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={uploadDocument} className="dtsc-card grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
          Titre documentaire
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex: Offre DTSC, cahier de besoins..." title="Nom lisible du document dans votre base documentaire." />
        </label>
        <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
          Fichier
          <Input
            type="file"
            accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            title="Sélectionner un fichier métier à indexer pour le chatbot."
          />
        </label>
        <Button type="submit" disabled={isPending || usedSlots >= maxDocuments} title="Indexer ce document dans votre espace privé selon votre abonnement." className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <UploadCloud className="h-4 w-4" />
          {isPending ? "Indexation..." : "Indexer"}
        </Button>
        <p className="text-xs leading-5 text-dtsc-muted lg:col-span-3">
          Fichiers pris en charge: TXT, Markdown, CSV, JSON et PDF jusqu&apos;à 2 Mo. Capacité du plan: {usedSlots}/{maxDocuments} document(s).
        </p>
      </form>

      {message && <p className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</p>}

      <section className="dtsc-card p-5">
        <ListControls
          query={smartList.query}
          onQueryChange={smartList.setQuery}
          page={smartList.page}
          pageCount={smartList.pageCount}
          totalCount={smartList.totalCount}
          filteredCount={smartList.filteredCount}
          placeholder="Rechercher un document..."
          onPageChange={smartList.setPage}
        />
        <div className="divide-y divide-dtsc-border">
          {smartList.paginatedItems.map((item) => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-black text-dtsc-ink">{item.title}</h2>
                  <p className="break-all text-sm text-dtsc-muted">{item.fileName}</p>
                  <p className="mt-1 text-xs font-semibold text-dtsc-muted">
                    {item.status} · {item._count?.chunks || 0} segment(s) · {formatSize(item.sizeBytes)} · {new Date(item.createdAt).toLocaleString("fr-FR")}
                  </p>
                  {item.errorMessage && <p className="mt-2 text-xs font-semibold text-red-300">{item.errorMessage}</p>}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl border-dtsc-border bg-dtsc-surface text-red-300 hover:bg-red-500/10"
                onClick={() => deleteDocument(item.id)}
                aria-label="Supprimer le document"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </article>
          ))}
          {!smartList.paginatedItems.length && <p className="py-8 text-sm text-dtsc-muted">Aucun document indexé.</p>}
        </div>
      </section>
    </div>
  );
}
