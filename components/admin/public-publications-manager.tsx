"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Globe2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";
import { sanitizeRichHtml } from "@/lib/rich-content";

type Publication = {
  id: string;
  authorId: string | null;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  coverLabel: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  author?: {
    name: string;
    email: string;
  } | null;
};

type PublicationDraft = Pick<Publication, "title" | "slug" | "category" | "excerpt" | "coverLabel" | "published"> & {
  content: string;
  contentHtml: string;
};

const categories = ["RESSOURCE", "ARTICLE", "GUIDE", "CAS_PRATIQUE", "ANNONCE", "PROJET"];

export function PublicPublicationsManager({
  publications,
  currentUserId,
  canCreateDrafts = false,
  canPublish = false,
  canDelete = false,
}: {
  publications: Publication[];
  currentUserId: string;
  canCreateDrafts?: boolean;
  canPublish?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(publications);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Publication | null>(null);
  const [editingDraft, setEditingDraft] = useState<PublicationDraft | null>(null);
  const editingFormRef = useRef<HTMLFormElement | null>(null);
  const [confirmEditSave, setConfirmEditSave] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Publication | null>(null);
  const [createPreviewHtml, setCreatePreviewHtml] = useState("");
  const [editingPreviewHtml, setEditingPreviewHtml] = useState("");
  useToastMessage(message);
  const getPublicationSearchText = useCallback((publication: Publication) => {
    return [
      publication.title,
      publication.slug,
      publication.excerpt,
      publication.category,
      formatEnumLabel(publication.category),
      publication.published ? "publie publié publication" : "brouillon draft",
      publication.createdAt,
      publication.updatedAt,
      publication.author?.name,
      publication.author?.email,
    ].join(" ");
  }, []);
  const publicationList = useSmartList({
    items,
    pageSize: 5,
    getSearchText: getPublicationSearchText,
  });
  const canEditPublication = useCallback((publication: Publication) => {
    return canPublish || (!publication.published && publication.authorId === currentUserId);
  }, [canPublish, currentUserId]);

  async function submit(event: FormEvent<HTMLFormElement>, publicationId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(publicationId ? `/api/admin/publications/${publicationId}` : "/api/admin/publications", {
      method: publicationId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, published: canPublish && payload.published === "on" }),
    });

    const body = (await response.json().catch(() => null)) as { publication?: Publication } | null;
    setMessage(response.ok ? "Publication publique enregistrée." : "Impossible d'enregistrer cette publication.");
    if (response.ok) {
      form.reset();
      if (body?.publication) {
        const savedPublication = body.publication;
        setItems((current) =>
          publicationId
            ? current.map((publication) => publication.id === savedPublication.id ? savedPublication : publication)
            : [savedPublication, ...current]
        );
      }
      setEditing(null);
      setEditingDraft(null);
      setCreatePreviewHtml("");
      setEditingPreviewHtml("");
      router.refresh();
    }
  }

  async function remove(publication: Publication) {
    const response = await fetch(`/api/admin/publications/${publication.id}`, { method: "DELETE" });
    setMessage(response.ok ? "Publication supprimée." : "Impossible de supprimer cette publication.");
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== publication.id));
      setPendingDelete(null);
      router.refresh();
    }
  }

  return (
    <section className="dtsc-card p-6">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Publications publiques</p>
          <h2 className="mt-2 text-2xl font-black text-dtsc-ink">Contenus administrables pour les pages publiques</h2>
          <p className="mt-3 text-sm leading-6 text-dtsc-muted">
            Réservez ici les articles, guides, annonces publiques, projets ou cas pratiques qui alimenteront la page Ressources. Les publications non publiées restent en brouillon.
          </p>
          <form onSubmit={(event) => submit(event)} className="mt-5 grid gap-3">
            <Input name="title" placeholder="Titre de la publication" required disabled={!canCreateDrafts} />
            <Input name="slug" placeholder="slug-url-sans-accents" pattern="[a-z0-9]+(-[a-z0-9]+)*" required disabled={!canCreateDrafts} />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="category" disabled={!canCreateDrafts} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
                {categories.map((category) => (
                  <option key={category} value={category}>{formatEnumLabel(category)}</option>
                ))}
              </select>
              <Input name="coverLabel" placeholder="Label visuel court" disabled={!canCreateDrafts} />
            </div>
            <textarea name="excerpt" placeholder="Résumé court visible dans la carte publique" disabled={!canCreateDrafts} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
            <RichTextEditor
              textName="content"
              htmlName="contentHtml"
              disabled={!canCreateDrafts}
              allowImageUpload
              onContentChange={({ html }) => setCreatePreviewHtml(html)}
              placeholder="Contenu long de la publication. Collez ici un texte déjà mis en forme ou rédigez avec la barre d'outils."
            />
            <PublicationPreview html={createPreviewHtml} />
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
              Publier sur la page Ressources
              <input name="published" type="checkbox" disabled={!canPublish} className="h-4 w-4 accent-cyan-500" />
            </label>
            {!canPublish && (
              <p className="text-xs leading-5 text-dtsc-muted">
                Votre contribution sera enregistrée en brouillon sous votre nom. Seul un administrateur peut la publier ou la supprimer.
              </p>
            )}
            <Button disabled={!canCreateDrafts} title={canCreateDrafts ? "Enregistrer un brouillon public." : "Création de brouillon désactivée par l'administrateur."} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Globe2 className="h-4 w-4" />
              {canPublish ? "Enregistrer la publication" : "Enregistrer en brouillon"}
            </Button>
          </form>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Catalogue public</p>
            <h3 className="mt-2 text-xl font-black text-dtsc-ink">Articles publiés et brouillons</h3>
            <p className="mt-2 text-sm leading-6 text-dtsc-muted">
              Recherchez instantanément par titre, statut, catégorie ou slug, puis parcourez la liste paginée.
            </p>
          </div>
          {items.length > 0 && (
            <ListControls
              query={publicationList.query}
              onQueryChange={publicationList.setQuery}
              page={publicationList.page}
              pageCount={publicationList.pageCount}
              totalCount={publicationList.totalCount}
              filteredCount={publicationList.filteredCount}
              placeholder="Rechercher un article, brouillon, statut ou slug..."
              onPageChange={publicationList.setPage}
            />
          )}
          {publicationList.paginatedItems.map((publication) => (
            <article key={publication.id} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{formatEnumLabel(publication.category)} · {publication.published ? "Publié" : "Brouillon"}</p>
                  <h3 className="mt-1 font-black text-dtsc-ink">{publication.title}</h3>
                  <p className="mt-1 text-xs text-dtsc-muted">/{publication.slug}</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-dtsc-muted">
                    {publication.published ? "Publié" : "Mis en brouillon"} par {publication.author?.name || "DTSC"} · {formatPublicationDate(publication.updatedAt || publication.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!canEditPublication(publication)} onClick={() => {
                    setEditing(publication);
                    setEditingDraft({
                      title: publication.title,
                      slug: publication.slug,
                      category: publication.category,
                      excerpt: publication.excerpt,
                      coverLabel: publication.coverLabel,
                      content: publication.content,
                      contentHtml: publication.content,
                      published: publication.published,
                    });
                    setEditingPreviewHtml(publication.content);
                  }} className="rounded-xl">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!canDelete} onClick={() => setPendingDelete(publication)} className="rounded-xl text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-dtsc-muted">{publication.excerpt}</p>
            </article>
          ))}
          {items.length > 0 && publicationList.filteredCount === 0 && (
            <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5 text-sm text-dtsc-muted">
              Aucun contenu ne correspond à cette recherche.
            </p>
          )}
          {!items.length && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5 text-sm text-dtsc-muted">Aucune publication publique enregistrée.</p>}
        </div>
      </div>

      <Dialog open={Boolean(editing)} title="Modifier la publication" onClose={() => {
        setEditing(null);
        setEditingDraft(null);
        setEditingPreviewHtml("");
        setConfirmEditSave(false);
      }}>
        {editing && editingDraft && (
          <form
            ref={editingFormRef}
            onSubmit={(event) => {
              event.preventDefault();
              setConfirmEditSave(true);
            }}
            className="grid gap-3"
          >
            <Input name="title" value={editingDraft.title} onChange={(event) => setEditingDraft((current) => current ? { ...current, title: event.target.value } : current)} required disabled={!canEditPublication(editing)} />
            <Input name="slug" value={editingDraft.slug} onChange={(event) => setEditingDraft((current) => current ? { ...current, slug: event.target.value } : current)} pattern="[a-z0-9]+(-[a-z0-9]+)*" required disabled={!canEditPublication(editing)} />
            <select name="category" value={editingDraft.category} onChange={(event) => setEditingDraft((current) => current ? { ...current, category: event.target.value } : current)} disabled={!canEditPublication(editing)} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
              {categories.map((category) => (
                <option key={category} value={category}>{formatEnumLabel(category)}</option>
              ))}
            </select>
            <Input name="coverLabel" value={editingDraft.coverLabel || ""} onChange={(event) => setEditingDraft((current) => current ? { ...current, coverLabel: event.target.value } : current)} disabled={!canEditPublication(editing)} />
            <textarea name="excerpt" value={editingDraft.excerpt} onChange={(event) => setEditingDraft((current) => current ? { ...current, excerpt: event.target.value } : current)} disabled={!canEditPublication(editing)} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
            <RichTextEditor
              key={editing.id}
              textName="content"
              htmlName="contentHtml"
              defaultValue={editingDraft.contentHtml || editingDraft.content}
              disabled={!canEditPublication(editing)}
              allowImageUpload
              onContentChange={(content) => {
                setEditingDraft((current) => current ? { ...current, content: content.text, contentHtml: content.html } : current);
                setEditingPreviewHtml(content.html);
              }}
              placeholder="Contenu long de la publication"
            />
            <PublicationPreview html={editingPreviewHtml} />
            <p className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-700 dark:text-cyan-100">Vous modifiez une copie locale. La publication publique sera synchronisée uniquement après confirmation.</p>
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
              Publié
              <input name="published" type="checkbox" checked={editingDraft.published} onChange={(event) => setEditingDraft((current) => current ? { ...current, published: event.target.checked } : current)} disabled={!canPublish} className="h-4 w-4 accent-cyan-500" />
            </label>
            <Button disabled={!canEditPublication(editing)} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
          </form>
        )}
      </Dialog>

      <Dialog
        open={confirmEditSave}
        title="Confirmer la modification"
        description="Cette action modifiera le contenu public visible ou préparé pour la page Ressources."
        onClose={() => setConfirmEditSave(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmEditSave(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              Annuler
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-[#002b5b] text-white"
              onClick={() => {
                if (editing && editingFormRef.current) {
                  const submitEvent = { preventDefault() {}, currentTarget: editingFormRef.current } as FormEvent<HTMLFormElement>;
                  submit(submitEvent, editing.id);
                  setConfirmEditSave(false);
                }
              }}
            >
              Confirmer la modification
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Vérifiez le titre, le statut publié/brouillon et le contenu avant de confirmer.</p>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        title="Confirmer la suppression"
        description="Cette action supprimera définitivement la publication publique sélectionnée."
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={() => pendingDelete && remove(pendingDelete)} className="rounded-xl">
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">
          {pendingDelete ? `Vous allez supprimer "${pendingDelete.title}". Cette publication ne sera plus disponible dans les ressources publiques.` : ""}
        </p>
      </Dialog>
    </section>
  );
}

function formatPublicationDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PublicationPreview({ html }: { html: string }) {
  const cleanHtml = sanitizeRichHtml(html);

  if (!cleanHtml) {
    return (
      <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">
        L&apos;aperçu public apparaîtra ici dès que le contenu sera rédigé ou qu&apos;une image sera ajoutée.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Aperçu public</p>
        <span className="rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-blue">Avant publication</span>
      </div>
      <div
        className="dtsc-publication-content max-h-[420px] overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-surface p-4 text-sm"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </div>
  );
}
