"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Globe2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";
import { sanitizeRichHtml } from "@/lib/rich-content";

type Publication = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  coverLabel: string | null;
  published: boolean;
  createdAt: string;
};

const categories = ["RESSOURCE", "ARTICLE", "GUIDE", "CAS_PRATIQUE", "ANNONCE", "PROJET"];

export function PublicPublicationsManager({ publications, canEdit = true }: { publications: Publication[]; canEdit?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(publications);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Publication | null>(null);
  const [createPreviewHtml, setCreatePreviewHtml] = useState("");
  const [editingPreviewHtml, setEditingPreviewHtml] = useState("");
  const getPublicationSearchText = useCallback((publication: Publication) => {
    return [
      publication.title,
      publication.slug,
      publication.excerpt,
      publication.category,
      formatEnumLabel(publication.category),
      publication.published ? "publie publié publication" : "brouillon draft",
      publication.createdAt,
    ].join(" ");
  }, []);
  const publicationList = useSmartList({
    items,
    pageSize: 5,
    getSearchText: getPublicationSearchText,
  });

  async function submit(event: FormEvent<HTMLFormElement>, publicationId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(publicationId ? `/api/admin/publications/${publicationId}` : "/api/admin/publications", {
      method: publicationId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, published: payload.published === "on" }),
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
            <Input name="title" placeholder="Titre de la publication" required disabled={!canEdit} />
            <Input name="slug" placeholder="slug-url-sans-accents" pattern="[a-z0-9]+(-[a-z0-9]+)*" required disabled={!canEdit} />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="category" disabled={!canEdit} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
                {categories.map((category) => (
                  <option key={category} value={category}>{formatEnumLabel(category)}</option>
                ))}
              </select>
              <Input name="coverLabel" placeholder="Label visuel court" disabled={!canEdit} />
            </div>
            <textarea name="excerpt" placeholder="Résumé court visible dans la carte publique" disabled={!canEdit} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
            <RichTextEditor
              textName="content"
              htmlName="contentHtml"
              disabled={!canEdit}
              allowImageUpload
              onContentChange={({ html }) => setCreatePreviewHtml(html)}
              placeholder="Contenu long de la publication. Collez ici un texte déjà mis en forme ou rédigez avec la barre d'outils."
            />
            <PublicationPreview html={createPreviewHtml} />
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
              Publier sur la page Ressources
              <input name="published" type="checkbox" disabled={!canEdit} className="h-4 w-4 accent-cyan-500" />
            </label>
            <Button disabled={!canEdit} title={canEdit ? "Publier ou enregistrer un contenu public." : "Modification réservée au rôle ADMIN."} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Globe2 className="h-4 w-4" />
              Enregistrer la publication
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
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => {
                    setEditing(publication);
                    setEditingPreviewHtml(publication.content);
                  }} className="rounded-xl">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => remove(publication)} className="rounded-xl text-red-400">
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

      <Dialog open={Boolean(message)} title="Publication publique" onClose={() => setMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{message}</p>
      </Dialog>

      <Dialog open={Boolean(editing)} title="Modifier la publication" onClose={() => {
        setEditing(null);
        setEditingPreviewHtml("");
      }}>
        {editing && (
          <form onSubmit={(event) => submit(event, editing.id)} className="grid gap-3">
            <Input name="title" defaultValue={editing.title} required />
            <Input name="slug" defaultValue={editing.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
            <select name="category" defaultValue={editing.category} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
              {categories.map((category) => (
                <option key={category} value={category}>{formatEnumLabel(category)}</option>
              ))}
            </select>
            <Input name="coverLabel" defaultValue={editing.coverLabel || ""} />
            <textarea name="excerpt" defaultValue={editing.excerpt} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
            <RichTextEditor
              key={editing.id}
              textName="content"
              htmlName="contentHtml"
              defaultValue={editing.content}
              allowImageUpload
              onContentChange={({ html }) => setEditingPreviewHtml(html)}
              placeholder="Contenu long de la publication"
            />
            <PublicationPreview html={editingPreviewHtml} />
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
              Publié
              <input name="published" type="checkbox" defaultChecked={editing.published} className="h-4 w-4 accent-cyan-500" />
            </label>
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
          </form>
        )}
      </Dialog>
    </section>
  );
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
