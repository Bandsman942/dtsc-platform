"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, BarChart3, Bot, Database, FileText, History, RefreshCw, Send, Settings, ShieldCheck, Upload } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SourceItem = {
  id: string;
  title: string;
  status: string;
  confidentiality: string;
  sectorCode: string | null;
  moduleCode: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  chunkCount: number;
  createdByName: string;
  createdAt: string;
  errorMessage: string | null;
  archivedAt: string | null;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  citations?: unknown;
  toolResults?: unknown;
};

type ConversationItem = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messages: ChatMessage[];
};

type UsageSnapshot = {
  periodStart: string;
  organization: { messageCount: number; knowledgeSources: number; storageMb: number; totalTokens: number };
  limits: { monthlyMessages: number; knowledgeSources: number; storageMb: number; readToolsEnabled: boolean; actionDraftsEnabled: boolean };
  remaining: { monthlyMessages: number; knowledgeSources: number; storageMb: number };
};

type SettingsState = {
  enabled: boolean;
  defaultLanguage: "fr" | "en";
  allowKnowledgeUpload: boolean;
  allowReadTools: boolean;
  allowActionDrafts: boolean;
  retentionDays: number;
};

const defaultSettings: SettingsState = {
  enabled: true,
  defaultLanguage: "fr",
  allowKnowledgeUpload: true,
  allowReadTools: true,
  allowActionDrafts: true,
  retentionDays: 365,
};

const tabs = [
  { key: "chat", label: "Chat", icon: Bot },
  { key: "sources", label: "Sources", icon: Database },
  { key: "history", label: "Historique", icon: History },
  { key: "usage", label: "Usage", icon: BarChart3 },
  { key: "settings", label: "Paramètres", icon: Settings },
] as const;

export function EnterpriseAiWorkspace({
  organizationId,
  organizationName,
  sectorCode,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  sectorCode: string | null;
  canManage: boolean;
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("chat");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [permissions, setPermissions] = useState({ canUploadSources: false, canManageSources: false, canManageSettings: false, canUseReadTools: false, canUseActionDrafts: false });
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [sourceToArchive, setSourceToArchive] = useState<SourceItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadSources = useCallback(async () => {
    const response = await fetch(`/api/enterprise/ai/knowledge-sources?organizationId=${encodeURIComponent(organizationId)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Chargement des sources impossible.");
    setSources(body.sources || []);
    setPermissions((current) => ({ ...current, ...(body.permissions || {}) }));
  }, [organizationId]);

  const loadConversations = useCallback(async () => {
    const response = await fetch(`/api/enterprise/ai/conversations?organizationId=${encodeURIComponent(organizationId)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Chargement de l'historique impossible.");
    const loaded = body.conversations || [];
    setConversations(loaded);
    setPermissions((current) => ({ ...current, ...(body.permissions || {}) }));
    if (!activeConversationId && loaded[0]) {
      setActiveConversationId(loaded[0].id);
      setMessages(loaded[0].messages || []);
    }
  }, [activeConversationId, organizationId]);

  const loadUsage = useCallback(async () => {
    const response = await fetch(`/api/enterprise/ai/usage?organizationId=${encodeURIComponent(organizationId)}`);
    const body = await response.json();
    if (response.ok) setUsage(body.usage);
  }, [organizationId]);

  const loadSettings = useCallback(async () => {
    const response = await fetch(`/api/enterprise/ai/settings?organizationId=${encodeURIComponent(organizationId)}`);
    const body = await response.json();
    if (!response.ok) return;
    setSettings({ ...defaultSettings, ...(body.settings || {}) });
    setPermissions((current) => ({ ...current, ...(body.permissions || {}) }));
  }, [organizationId]);

  const refreshAll = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      await Promise.all([loadSources(), loadConversations(), loadUsage(), loadSettings()]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Chargement impossible.");
    } finally {
      setLoadingData(false);
    }
  }, [loadConversations, loadSettings, loadSources, loadUsage]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (conversation) setMessages(conversation.messages || []);
  }, [activeConversationId, conversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loadingChat]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || loadingChat) return;
    setLoadingChat(true);
    setError(null);
    setStatus(null);
    const optimisticMessage: ChatMessage = { id: `draft-${Date.now()}`, role: "user", content: trimmed, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimisticMessage]);
    setMessage("");
    try {
      const response = await fetch("/api/enterprise/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, conversationId: activeConversationId || "", content: trimmed, useKnowledge: true, useTools: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Réponse IA impossible.");
      const savedMessage: ChatMessage = body.message;
      setActiveConversationId(body.conversationId);
      setMessages((current) => [...current.filter((item) => item.id !== optimisticMessage.id), optimisticMessage, savedMessage]);
      setUsage(body.usage || null);
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message non envoyé.");
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
    } finally {
      setLoadingChat(false);
    }
  }

  async function uploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Sélectionnez un fichier à indexer.");
      return;
    }
    setStatus("Indexation de la source en cours...");
    setError(null);
    const form = new FormData(event.currentTarget);
    form.set("organizationId", organizationId);
    form.set("file", file);
    try {
      const response = await fetch("/api/enterprise/ai/knowledge-sources", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Indexation impossible.");
      event.currentTarget.reset();
      setStatus("Source indexée et disponible pour le RAG.");
      await Promise.all([loadSources(), loadUsage()]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Indexation impossible.");
      setStatus(null);
    }
  }

  async function archiveSource() {
    if (!sourceToArchive) return;
    const targetSource = sourceToArchive;
    setSourceToArchive(null);
    setStatus("Archivage de la source...");
    try {
      const response = await fetch(`/api/enterprise/ai/knowledge-sources/${encodeURIComponent(targetSource.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "archive" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Archivage impossible.");
      setStatus("Source archivée.");
      await Promise.all([loadSources(), loadUsage()]);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Archivage impossible.");
      setStatus(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Enregistrement des paramètres...");
    setError(null);
    try {
      const response = await fetch("/api/enterprise/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...settings }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Paramètres non enregistrés.");
      setStatus("Paramètres IA enregistrés.");
      await loadSettings();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Paramètres non enregistrés.");
      setStatus(null);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">IA Assistant Entreprise</p>
            <h1 className="mt-2 text-3xl font-black text-dtsc-ink sm:text-4xl">{organizationName}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-dtsc-muted">
              Assistant sectoriel avec contexte entreprise, sources RAG privées, outils backend en lecture et brouillons d&apos;action contrôlés.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={refreshAll} disabled={loadingData}>
            <RefreshCw className="h-4 w-4" /> Actualiser
          </Button>
        </div>
      </section>

      <nav className="flex min-w-0 gap-2 overflow-x-auto rounded-2xl border border-dtsc-border bg-dtsc-surface p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${active ? "bg-[#002b5b] text-white" : "text-dtsc-muted hover:bg-dtsc-page hover:text-dtsc-ink"}`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </nav>

      {status && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{status}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

      {activeTab === "chat" && (
        <section className="grid min-h-[34rem] gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-black text-dtsc-ink">Conversations</h2>
              <Button type="button" variant="secondary" onClick={() => { setActiveConversationId(null); setMessages([]); }}>
                Nouveau
              </Button>
            </div>
            <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`w-full min-w-0 rounded-xl border p-3 text-left text-sm transition ${activeConversationId === conversation.id ? "border-cyan-400 bg-cyan-50 text-dtsc-ink" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:border-cyan-300"}`}
                >
                  <span className="block truncate font-black">{conversation.title}</span>
                  <span className="mt-1 block text-xs">{new Date(conversation.updatedAt).toLocaleString("fr-FR")}</span>
                </button>
              ))}
              {!conversations.length && <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Aucune conversation IA pour le moment.</p>}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col rounded-2xl border border-dtsc-border bg-dtsc-surface">
            <div className="border-b border-dtsc-border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
                <ShieldCheck className="h-4 w-4 text-cyan-600" />
                <span>{sectorCode || "GENERAL"}</span>
                <span>Sources {sources.filter((source) => source.status === "READY").length}</span>
                <span>Outils lecture {permissions.canUseReadTools ? "actifs" : "désactivés"}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((chatMessage) => (
                <article key={chatMessage.id} className={`max-w-[92%] rounded-2xl border p-3 text-sm leading-6 ${chatMessage.role === "assistant" ? "border-dtsc-border bg-dtsc-page text-dtsc-ink" : "ml-auto border-cyan-200 bg-cyan-50 text-[#06345f]"}`}>
                  <p className="text-xs font-black uppercase text-dtsc-muted">{chatMessage.role === "assistant" ? "Assistant" : "Vous"} · {new Date(chatMessage.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words">{chatMessage.content}</p>
                </article>
              ))}
              {loadingChat && <p className="rounded-xl bg-dtsc-page p-3 text-sm font-bold text-dtsc-muted">Analyse en cours...</p>}
              {!messages.length && <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">Posez une question sur l&apos;entreprise, les sources indexées ou les modules pharmacie activés.</p>}
              <div ref={endRef} />
            </div>
            <form onSubmit={sendMessage} className="flex min-w-0 gap-2 border-t border-dtsc-border p-3">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink outline-none focus:border-cyan-400"
                placeholder="Demandez une synthèse, une analyse de stock, une priorité d'alertes..."
              />
              <Button type="submit" disabled={loadingChat || !message.trim()}>
                <Send className="h-4 w-4" /> Envoyer
              </Button>
            </form>
          </div>
        </section>
      )}

      {activeTab === "sources" && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <h2 className="flex items-center gap-2 font-black text-dtsc-ink"><Database className="h-4 w-4 text-cyan-600" /> Sources RAG entreprise</h2>
            <div className="mt-4 grid gap-3">
              {sources.map((source) => (
                <article key={source.id} className="relative min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-4 pr-12">
                  {permissions.canManageSources && !source.archivedAt && (
                    <div className="absolute right-3 top-3">
                      <ActionMenu items={[{ key: "archive", label: "Archiver", icon: Archive, destructive: true, onSelect: () => setSourceToArchive(source) }]} />
                    </div>
                  )}
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{source.confidentiality} · {source.status}</p>
                  <h3 className="mt-1 break-words font-black text-dtsc-ink">{source.title}</h3>
                  <p className="mt-1 text-sm text-dtsc-muted">{source.fileName || "Source interne"} · {source.chunkCount} chunks · {source.sizeBytes ? `${Math.ceil(source.sizeBytes / 1024)} Ko` : "taille inconnue"}</p>
                  {source.errorMessage && <p className="mt-2 text-sm font-bold text-red-700">{source.errorMessage}</p>}
                </article>
              ))}
              {!sources.length && <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucune source IA indexée.</p>}
            </div>
          </div>

          <form onSubmit={uploadSource} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <h2 className="flex items-center gap-2 font-black text-dtsc-ink"><Upload className="h-4 w-4 text-cyan-600" /> Ajouter une source</h2>
            {!permissions.canUploadSources ? (
              <p className="mt-3 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">L&apos;ajout de sources est réservé aux responsables autorisés ou désactivé dans les paramètres.</p>
            ) : (
              <div className="mt-4 space-y-3">
                <Input name="title" placeholder="Titre lisible" />
                <Input name="moduleCode" placeholder="Module cible optionnel" />
                <select name="confidentiality" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-bold text-dtsc-ink">
                  <option value="INTERNAL">Interne</option>
                  <option value="PUBLIC">Public entreprise</option>
                  <option value="CONFIDENTIAL">Confidentiel</option>
                  <option value="MANAGERS_ONLY">Responsables uniquement</option>
                </select>
                <input ref={fileInputRef} name="file" type="file" className="w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm" />
                <Button type="submit"><Upload className="h-4 w-4" /> Indexer</Button>
              </div>
            )}
          </form>
        </section>
      )}

      {activeTab === "history" && (
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h2 className="flex items-center gap-2 font-black text-dtsc-ink"><History className="h-4 w-4 text-cyan-600" /> Historique récent</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => { setActiveConversationId(conversation.id); setActiveTab("chat"); }} className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-left transition hover:border-cyan-300">
                <h3 className="font-black text-dtsc-ink">{conversation.title}</h3>
                <p className="mt-1 text-sm text-dtsc-muted">{conversation.messages.length} message(s) · {new Date(conversation.updatedAt).toLocaleString("fr-FR")}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === "usage" && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UsageCard icon={Bot} label="Messages mensuels" value={usage?.organization.messageCount || 0} limit={usage?.limits.monthlyMessages || 0} />
          <UsageCard icon={FileText} label="Sources IA" value={usage?.organization.knowledgeSources || 0} limit={usage?.limits.knowledgeSources || 0} />
          <UsageCard icon={Database} label="Stockage IA MB" value={usage?.organization.storageMb || 0} limit={usage?.limits.storageMb || 0} />
          <UsageCard icon={BarChart3} label="Tokens estimés" value={usage?.organization.totalTokens || 0} />
        </section>
      )}

      {activeTab === "settings" && (
        <form onSubmit={saveSettings} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h2 className="flex items-center gap-2 font-black text-dtsc-ink"><Settings className="h-4 w-4 text-cyan-600" /> Paramètres IA</h2>
          {!permissions.canManageSettings && !canManage ? (
            <p className="mt-4 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Paramètres en lecture seule pour votre rôle.</p>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Toggle label="Assistant actif" value={settings.enabled} disabled={!permissions.canManageSettings} onChange={(value) => setSettings((current) => ({ ...current, enabled: value }))} />
            <Toggle label="Upload de sources" value={settings.allowKnowledgeUpload} disabled={!permissions.canManageSettings} onChange={(value) => setSettings((current) => ({ ...current, allowKnowledgeUpload: value }))} />
            <Toggle label="Outils backend lecture" value={settings.allowReadTools} disabled={!permissions.canManageSettings} onChange={(value) => setSettings((current) => ({ ...current, allowReadTools: value }))} />
            <Toggle label="Brouillons d'action" value={settings.allowActionDrafts} disabled={!permissions.canManageSettings} onChange={(value) => setSettings((current) => ({ ...current, allowActionDrafts: value }))} />
            <label className="text-sm font-bold text-dtsc-muted">
              Rétention historique en jours
              <Input type="number" min={30} max={3650} value={settings.retentionDays} disabled={!permissions.canManageSettings} onChange={(event) => setSettings((current) => ({ ...current, retentionDays: Number(event.target.value) }))} />
            </label>
          </div>
          {permissions.canManageSettings && <Button type="submit" className="mt-4"><Settings className="h-4 w-4" /> Enregistrer</Button>}
        </form>
      )}

      <Dialog
        open={Boolean(sourceToArchive)}
        title="Archiver la source IA"
        description={sourceToArchive ? `La source "${sourceToArchive.title}" sera retirée du RAG actif.` : ""}
        onClose={() => setSourceToArchive(null)}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setSourceToArchive(null)}>Annuler</Button>
            <Button type="button" variant="destructive" onClick={archiveSource}>Archiver</Button>
          </>
        )}
      >
        <p className="text-sm leading-6 text-dtsc-muted">Cette action conserve l&apos;historique et retire uniquement la source du contexte IA actif.</p>
      </Dialog>
    </div>
  );
}

function UsageCard({ icon: Icon, label, value, limit }: { icon: typeof Bot; label: string; value: number; limit?: number }) {
  const percent = limit ? Math.min(Math.round((value / Math.max(limit, 1)) * 100), 100) : 0;
  return (
    <article className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <div className="flex items-center gap-2 text-cyan-600"><Icon className="h-4 w-4" /><p className="text-xs font-black uppercase">{label}</p></div>
      <p className="mt-2 text-3xl font-black text-dtsc-ink">{value}</p>
      {limit ? <p className="mt-1 text-sm font-bold text-dtsc-muted">{percent}% de {limit}</p> : null}
    </article>
  );
}

function Toggle({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-black text-dtsc-ink">
      <span>{label}</span>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-cyan-600" />
    </label>
  );
}
