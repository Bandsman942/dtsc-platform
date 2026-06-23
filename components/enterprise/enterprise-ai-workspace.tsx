"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, BarChart3, Bot, Copy, Database, Edit3, FileText, FolderKanban, FolderPlus, History, Info, Loader2, Pencil, Plus, RefreshCw, Settings, Share2, Trash2, Upload, X } from "lucide-react";
import { Streamdown } from "streamdown";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { ConversationComposer } from "@/components/chat/ConversationComposer";
import { ConversationEmptyState } from "@/components/chat/ConversationEmptyState";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { ConversationListItem } from "@/components/chat/ConversationListItem";
import { FloatingActionButton } from "@/components/chat/FloatingActionButton";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SearchBar } from "@/components/chat/SearchBar";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatRelativeUserDateTime, formatUserDateTime } from "@/lib/user-format";

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
  role: "user" | "assistant" | "system" | string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  citations?: unknown;
  toolResults?: unknown;
};

type ConversationItem = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
  messages: ChatMessage[];
  _count?: { messages: number };
};

type ProjectItem = {
  id: string;
  name: string;
  updatedAt: string;
  _count?: { conversations: number };
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

type CollaborationGroup = { id: string; name: string };

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
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [permissions, setPermissions] = useState({ canUploadSources: false, canManageSources: false, canManageSettings: false, canUseReadTools: false, canUseActionDrafts: false });
  const [message, setMessage] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [sourceToArchive, setSourceToArchive] = useState<SourceItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [conversationDialog, setConversationDialog] = useState<"rename" | "delete" | null>(null);
  const [projectDialog, setProjectDialog] = useState<"create" | "rename" | "delete" | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [messageDialog, setMessageDialog] = useState<"edit" | "delete" | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [shareToGroupOpen, setShareToGroupOpen] = useState(false);
  const [collaborationGroups, setCollaborationGroups] = useState<CollaborationGroup[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || null,
    [activeConversationId, conversations]
  );
  const conversationList = useSmartList({
    items: conversations,
    pageSize: 8,
    getSearchText: (item) => `${item.title} ${item.projectName || ""} ${item.updatedAt} ${item._count?.messages ?? item.messages.length}`,
  });
  const groupedConversations = useMemo(() => {
    const projectQuery = conversationList.query.trim().toLocaleLowerCase("fr");
    const initialGroups = projects.reduce<Record<string, ConversationItem[]>>((groups, project) => {
      if (!projectQuery || project.name.toLocaleLowerCase("fr").includes(projectQuery)) {
        groups[project.name] = [];
      }
      return groups;
    }, {});
    return conversationList.paginatedItems.reduce<Record<string, ConversationItem[]>>((groups, conversation) => {
      const key = conversation.projectName?.trim() || "Sans projet";
      groups[key] = [...(groups[key] || []), conversation];
      return groups;
    }, initialGroups);
  }, [conversationList.paginatedItems, conversationList.query, projects]);

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
    setProjects(body.projects || []);
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

  const loadCollaborationGroups = useCallback(async () => {
    const response = await fetch("/api/collaborators/groups");
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setCollaborationGroups((body?.groups || []).map((group: CollaborationGroup) => ({ id: group.id, name: group.name })));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoadingData(true);
    try {
      await Promise.all([loadSources(), loadConversations(), loadUsage(), loadSettings()]);
    } catch (refreshError) {
      toastError(refreshError instanceof Error ? refreshError.message : "Chargement impossible.");
    } finally {
      setLoadingData(false);
    }
  }, [loadConversations, loadSettings, loadSources, loadUsage]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void loadCollaborationGroups();
  }, [loadCollaborationGroups]);

  useEffect(() => {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (conversation) setMessages(conversation.messages || []);
  }, [activeConversationId, conversations]);

  useEffect(() => {
    const container = messageScrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loadingChat]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || loadingChat) return;
    setLoadingChat(true);
    const optimisticMessage: ChatMessage = { id: `draft-${Date.now()}`, role: "user", content: trimmed, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimisticMessage]);
    setMessage("");
    try {
      const assistantDraftId = `assistant-${Date.now()}`;
      setMessages((current) => [...current, { id: assistantDraftId, role: "assistant", content: "", createdAt: new Date().toISOString() }]);
      const response = await fetch("/api/enterprise/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, conversationId: activeConversationId || "", content: trimmed, useKnowledge: true, useTools: true }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Réponse IA impossible.");
      }
      const conversationId = response.headers.get("X-Conversation-Id");
      if (conversationId) {
        setActiveConversationId(conversationId);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((item) => item.id === assistantDraftId ? { ...item, content: `${item.content}${chunk}` } : item)
        );
      }
      await Promise.all([loadConversations(), loadUsage()]);
    } catch (sendError) {
      toastError(sendError instanceof Error ? sendError.message : "Message non envoyé.");
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id && !item.id.startsWith("assistant-")));
    } finally {
      setLoadingChat(false);
    }
  }

  async function createConversation(projectId?: string) {
    const response = await fetch("/api/enterprise/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, projectId: projectId || "" }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.conversation?.id) {
      toastError(body?.message || "Conversation IA non créée.");
      return;
    }
    setActiveConversationId(body.conversation.id);
    setMessages([]);
    setHistoryOpen(false);
    toastSuccess("Nouvelle conversation IA créée.");
    await loadConversations();
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    const endpoint = "/api/enterprise/ai/projects";
    const method = projectDialog === "rename" && selectedProject ? "PATCH" : "POST";
    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, projectId: selectedProject?.id || "", name }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Projet IA non enregistré.");
      return;
    }
    setProjectDialog(null);
    setSelectedProject(null);
    toastSuccess(projectDialog === "rename" ? "Projet IA renommé." : "Projet IA créé.");
    await loadConversations();
  }

  async function deleteProject() {
    if (!selectedProject) return;
    const response = await fetch("/api/enterprise/ai/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, projectId: selectedProject.id }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Projet IA non supprimé.");
      return;
    }
    setProjectDialog(null);
    setSelectedProject(null);
    toastSuccess("Projet IA supprimé. Ses conversations restent disponibles sans projet.");
    await loadConversations();
  }

  async function saveConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const projectId = String(form.get("projectId") || "").trim();
    if (!title) return;
    const response = await fetch(`/api/enterprise/ai/conversations/${encodeURIComponent(activeConversation.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, title, projectId, action: "update" }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Conversation non enregistrée.");
      return;
    }
    setConversationDialog(null);
    toastSuccess("Conversation mise à jour.");
    await loadConversations();
  }

  async function deleteConversation() {
    if (!activeConversation) return;
    const response = await fetch(`/api/enterprise/ai/conversations/${encodeURIComponent(activeConversation.id)}?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Conversation non supprimée.");
      return;
    }
    setConversationDialog(null);
    setActiveConversationId(null);
    setMessages([]);
    toastSuccess("Conversation supprimée.");
    await loadConversations();
  }

  async function saveMessageEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMessage) return;
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content") || "").trim();
    if (!content) return;
    const response = await fetch(`/api/enterprise/ai/messages/${encodeURIComponent(selectedMessage.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, content, action: "edit" }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Message non modifié.");
      return;
    }
    setMessageDialog(null);
    setSelectedMessage(null);
    toastSuccess("Message modifié.");
    await loadConversations();
  }

  async function deleteMessage() {
    if (!selectedMessage) return;
    const response = await fetch(`/api/enterprise/ai/messages/${encodeURIComponent(selectedMessage.id)}?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Message non supprimé.");
      return;
    }
    setMessageDialog(null);
    setSelectedMessage(null);
    setMessages((current) => current.filter((item) => item.id !== selectedMessage.id));
    toastSuccess("Message supprimé.");
    await loadConversations();
  }

  async function copyMessageContent(targetMessage: ChatMessage) {
    const browserNavigator = typeof window === "undefined" ? undefined : window.navigator;
    if (!browserNavigator?.clipboard) {
      toastError("Copie indisponible dans ce navigateur.");
      return;
    }
    await browserNavigator.clipboard.writeText(targetMessage.content);
    toastInfo("Contenu copié.");
    setCopiedMessageId(targetMessage.id);
    window.setTimeout(() => setCopiedMessageId((current) => (current === targetMessage.id ? "" : current)), 1600);
  }

  async function shareConversationToGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation) return;
    const form = new FormData(event.currentTarget);
    const groupId = String(form.get("groupId") || "").trim();
    const content = String(form.get("content") || "").trim();
    if (!groupId) {
      toastError("Sélectionnez un groupe de destination.");
      return;
    }
    const response = await fetch(`/api/enterprise/ai/conversations/${encodeURIComponent(activeConversation.id)}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, groupId, content }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toastError(body?.message || "Partage impossible.");
      return;
    }
    setShareToGroupOpen(false);
    toastSuccess("Conversation partagée dans Mes collaborateurs.");
  }

  async function uploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toastError("Sélectionnez un fichier à indexer.");
      return;
    }
    toastInfo("Indexation de la source en cours...");
    const form = new FormData(event.currentTarget);
    form.set("organizationId", organizationId);
    form.set("file", file);
    try {
      const response = await fetch("/api/enterprise/ai/knowledge-sources", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Indexation impossible.");
      event.currentTarget.reset();
      toastSuccess("Source indexée et disponible pour le RAG.");
      await Promise.all([loadSources(), loadUsage()]);
    } catch (uploadError) {
      toastError(uploadError instanceof Error ? uploadError.message : "Indexation impossible.");
    }
  }

  async function archiveSource() {
    if (!sourceToArchive) return;
    const targetSource = sourceToArchive;
    setSourceToArchive(null);
    toastInfo("Archivage de la source...");
    try {
      const response = await fetch(`/api/enterprise/ai/knowledge-sources/${encodeURIComponent(targetSource.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "archive" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Archivage impossible.");
      toastSuccess("Source archivée.");
      await Promise.all([loadSources(), loadUsage()]);
    } catch (archiveError) {
      toastError(archiveError instanceof Error ? archiveError.message : "Archivage impossible.");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    toastInfo("Enregistrement des paramètres...");
    try {
      const response = await fetch("/api/enterprise/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...settings }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Paramètres non enregistrés.");
      toastSuccess("Paramètres IA enregistrés.");
      await loadSettings();
    } catch (settingsError) {
      toastError(settingsError instanceof Error ? settingsError.message : "Paramètres non enregistrés.");
    }
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">IA Assistant Entreprise</p>
          <h1 className="mt-1 truncate text-2xl font-black text-dtsc-ink sm:text-3xl">{organizationName}</h1>
        </div>
        <Button type="button" variant="secondary" onClick={refreshAll} disabled={loadingData} className="shrink-0 rounded-full">
          <RefreshCw className="h-4 w-4" /> Actualiser
        </Button>
      </div>

      <nav className="flex min-w-0 gap-2 overflow-x-auto border-b border-dtsc-border pb-2">
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

      {activeTab === "chat" && (
        <section className="relative grid h-[calc(100dvh-11.5rem)] min-h-0 overflow-hidden bg-dtsc-surface lg:h-[calc(100vh-12rem)] lg:grid-cols-[320px_1fr]">
          <div className="hidden min-h-0 border-r border-dtsc-border lg:block">
            <EnterpriseAiHistoryPanel
              conversations={conversations}
              groupedConversations={groupedConversations}
              activeConversationId={activeConversationId}
              conversationList={conversationList}
              usage={usage}
              projects={projects}
              onCreate={() => { void createConversation(); }}
              onCreateProject={() => { setSelectedProject(null); setHistoryOpen(false); setProjectDialog("create"); }}
              onRenameProject={(project) => { setSelectedProject(project); setHistoryOpen(false); setProjectDialog("rename"); }}
              onDeleteProject={(project) => { setSelectedProject(project); setHistoryOpen(false); setProjectDialog("delete"); }}
              onCreateInProject={(projectId) => { void createConversation(projectId); }}
              onSelect={(id) => { setActiveConversationId(id); setHistoryOpen(false); }}
            />
          </div>
          {historyOpen && (
            <div className="fixed inset-0 z-40 bg-[#001736]/60 backdrop-blur-sm lg:hidden" onClick={() => setHistoryOpen(false)}>
              <div className="h-full w-[min(92vw,24rem)] p-3" onClick={(event) => event.stopPropagation()}>
                <div className="mb-2 flex justify-end">
                  <Button type="button" size="icon" variant="outline" onClick={() => setHistoryOpen(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <EnterpriseAiHistoryPanel
                  conversations={conversations}
                  groupedConversations={groupedConversations}
                  activeConversationId={activeConversationId}
                  conversationList={conversationList}
                  usage={usage}
                  projects={projects}
                  onCreate={() => { void createConversation(); }}
                  onCreateProject={() => { setSelectedProject(null); setHistoryOpen(false); setProjectDialog("create"); }}
                  onRenameProject={(project) => { setSelectedProject(project); setHistoryOpen(false); setProjectDialog("rename"); }}
                  onDeleteProject={(project) => { setSelectedProject(project); setHistoryOpen(false); setProjectDialog("delete"); }}
                  onCreateInProject={(projectId) => { void createConversation(projectId); }}
                  onSelect={(id) => { setActiveConversationId(id); setHistoryOpen(false); }}
                />
              </div>
            </div>
          )}

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-dtsc-surface">
            <ConversationHeader
              title={activeConversation?.title || "Nouvelle conversation"}
              subtitle={`Assistant IA Entreprise · ${sectorCode || "GENERAL"} · ${sources.filter((source) => source.status === "READY").length} sources · outils ${permissions.canUseReadTools ? "actifs" : "désactivés"}`}
              type="assistant"
              onBack={() => setHistoryOpen(true)}
              actions={(
                <ActionMenu
                  label="Actions de la conversation IA"
                  items={[
                    { key: "info", label: "Infos", icon: Info, onSelect: () => setInfoOpen(true), disabled: !activeConversation },
                    { key: "share", label: "Partager au groupe", icon: Share2, onSelect: () => setShareToGroupOpen(true), disabled: !activeConversation },
                    { key: "rename", label: "Renommer / classer", icon: Pencil, onSelect: () => setConversationDialog("rename"), disabled: !activeConversation },
                    { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setConversationDialog("delete"), disabled: !activeConversation },
                  ]}
                />
              )}
            />
            <div ref={messageScrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-dtsc-page px-2.5 py-3 sm:px-4 lg:px-7">
              {!messages.length && (
                <ConversationEmptyState title="Aucune conversation IA." description="Demarrez une discussion avec l'assistant sectoriel de cette entreprise pour analyser les sources et modules autorises." />
              )}
              <div className="space-y-4">
                {messages.map((chatMessage) => {
                  const isUser = chatMessage.role === "user";
                  return (
                    <MessageBubble
                      key={chatMessage.id}
                      role={isUser ? "user" : "assistant"}
                      author={isUser ? "Vous" : "Assistant entreprise"}
                      initials={isUser ? "VO" : "AI"}
                      meta={`${formatRelativeUserDateTime(chatMessage.createdAt)}${chatMessage.editedAt ? " · modifié" : ""}`}
                      actions={(
                        <ActionMenu
                          label="Actions du message IA"
                          className="opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100"
                          items={[
                            { key: "copy", label: copiedMessageId === chatMessage.id ? "Copié" : "Copier", icon: Copy, onSelect: () => void copyMessageContent(chatMessage) },
                            { key: "edit", label: "Modifier", icon: Edit3, onSelect: () => { setSelectedMessage(chatMessage); setMessageDialog("edit"); }, disabled: !isUser || chatMessage.id.startsWith("draft-") },
                            { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => { setSelectedMessage(chatMessage); setMessageDialog("delete"); }, disabled: chatMessage.id.startsWith("draft-") || chatMessage.id.startsWith("assistant-") },
                          ]}
                        />
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words">{chatMessage.content}</p>
                      ) : (
                        <div className="dtsc-assistant-markdown">
                          <Streamdown>{chatMessage.content || "..."}</Streamdown>
                        </div>
                      )}
                    </MessageBubble>
                  );
                })}
                {loadingChat && (
                  <div className="flex items-center gap-2 text-sm font-bold text-dtsc-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assistant entreprise en rédaction...
                  </div>
                )}
              </div>
            </div>
            <ConversationComposer
              value={message}
              onChange={setMessage}
              onSubmit={sendMessage}
              placeholder="Écrivez votre demande..."
              sending={loadingChat}
              helper="Vérifiez les informations critiques avant toute décision métier."
            />
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

      <Dialog open={infoOpen} title="Infos sur la conversation IA" onClose={() => setInfoOpen(false)}>
        {activeConversation && (
          <div className="grid gap-3 text-sm text-dtsc-muted sm:grid-cols-2">
            <InfoCard label="Titre" value={activeConversation.title} />
            <InfoCard label="Projet" value={activeConversation.projectName || "Sans projet"} />
            <InfoCard label="Messages" value={String(activeConversation._count?.messages ?? activeConversation.messages.length)} />
            <InfoCard label="Dernière activité" value={formatUserDateTime(activeConversation.updatedAt)} />
          </div>
        )}
      </Dialog>

      <Dialog open={conversationDialog === "rename"} title="Renommer et classer" onClose={() => setConversationDialog(null)}>
        <form onSubmit={saveConversation} className="space-y-3">
          <Input name="title" defaultValue={activeConversation?.title || ""} required placeholder="Titre de la conversation" />
          <select
            name="projectId"
            defaultValue={activeConversation?.projectId || ""}
            className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink"
          >
            <option value="">Sans projet</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
        </form>
      </Dialog>

      <Dialog
        open={conversationDialog === "delete"}
        title="Supprimer la conversation"
        description="Cette action retire la conversation de votre espace IA Entreprise."
        onClose={() => setConversationDialog(null)}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setConversationDialog(null)}>Annuler</Button>
            <Button type="button" variant="destructive" onClick={deleteConversation}>Supprimer</Button>
          </>
        )}
      >
        <p className="text-sm leading-7 text-dtsc-muted">Les traces sont conservées côté serveur pour audit et la conversation est masquée de votre historique actif.</p>
      </Dialog>

      <Dialog
        open={projectDialog === "create" || projectDialog === "rename"}
        title={projectDialog === "rename" ? "Renommer le projet IA" : "Créer un projet IA"}
        description="Les projets permettent de classer les conversations de l'assistant IA de cette entreprise."
        onClose={() => {
          setProjectDialog(null);
          setSelectedProject(null);
        }}
      >
        <form onSubmit={saveProject} className="space-y-3">
          <Input name="name" defaultValue={selectedProject?.name || ""} required placeholder="Nom du projet" />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
        </form>
      </Dialog>

      <Dialog
        open={projectDialog === "delete"}
        title="Supprimer le projet IA"
        description="Les conversations du projet seront conservées et replacées dans Sans projet."
        onClose={() => {
          setProjectDialog(null);
          setSelectedProject(null);
        }}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => { setProjectDialog(null); setSelectedProject(null); }}>Annuler</Button>
            <Button type="button" variant="destructive" onClick={deleteProject}>Supprimer</Button>
          </>
        )}
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression du projet {selectedProject?.name}.</p>
      </Dialog>

      <Dialog open={messageDialog === "edit"} title="Modifier le message" onClose={() => { setMessageDialog(null); setSelectedMessage(null); }}>
        <form onSubmit={saveMessageEdit} className="space-y-3">
          <textarea
            name="content"
            defaultValue={selectedMessage?.content || ""}
            className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"
            required
          />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
        </form>
      </Dialog>

      <Dialog
        open={messageDialog === "delete"}
        title="Supprimer le message"
        description="Le message sera retiré de cette conversation."
        onClose={() => { setMessageDialog(null); setSelectedMessage(null); }}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => { setMessageDialog(null); setSelectedMessage(null); }}>Annuler</Button>
            <Button type="button" variant="destructive" onClick={deleteMessage}>Supprimer</Button>
          </>
        )}
      >
        <p className="text-sm leading-7 text-dtsc-muted">La suppression est logique et conserve les garanties d&apos;audit.</p>
      </Dialog>

      <Dialog open={shareToGroupOpen} title="Partager dans Mes collaborateurs" onClose={() => setShareToGroupOpen(false)}>
        <form onSubmit={shareConversationToGroup} className="space-y-3">
          <p className="text-sm leading-7 text-dtsc-muted">
            Les membres du groupe verront une copie de la conversation, pas votre conversation privée originale.
          </p>
          <select name="groupId" required className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
            <option value="">Choisir un groupe</option>
            {collaborationGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          <textarea
            name="content"
            defaultValue={activeConversation ? `Conversation IA Entreprise partagée: ${activeConversation.title}` : ""}
            className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"
          />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Partager</Button>
        </form>
      </Dialog>

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

function EnterpriseAiHistoryPanel({
  conversations,
  projects,
  groupedConversations,
  activeConversationId,
  conversationList,
  usage,
  onCreate,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onCreateInProject,
  onSelect,
}: {
  conversations: ConversationItem[];
  projects: ProjectItem[];
  groupedConversations: Record<string, ConversationItem[]>;
  activeConversationId: string | null;
  conversationList: {
    query: string;
    setQuery: (value: string) => void;
    page: number;
    pageCount: number;
    totalCount: number;
    filteredCount: number;
    setPage: (page: number) => void;
  };
  usage: UsageSnapshot | null;
  onCreate: () => void;
  onCreateProject: () => void;
  onRenameProject: (project: ProjectItem) => void;
  onDeleteProject: (project: ProjectItem) => void;
  onCreateInProject: (projectId: string) => void;
  onSelect: (id: string) => void;
}) {
  const messageLimit = usage?.limits.monthlyMessages || 0;
  const messageValue = usage?.organization.messageCount || 0;
  const messagePercent = messageLimit ? Math.min(100, Math.round((messageValue / Math.max(messageLimit, 1)) * 100)) : 0;
  const sourceLimit = usage?.limits.knowledgeSources || 0;
  const sourceValue = usage?.organization.knowledgeSources || 0;
  const sourcePercent = sourceLimit ? Math.min(100, Math.round((sourceValue / Math.max(sourceLimit, 1)) * 100)) : 0;
  const groupedEntries = Object.entries(groupedConversations);

  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden px-3 py-3 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">Entreprise</p>
          <h2 className="truncate text-lg font-black text-dtsc-ink">Conversations IA</h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="icon" onClick={onCreate} className="h-10 w-10 rounded-full bg-[#002b5b] text-white" aria-label="Nouvelle conversation IA">
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={onCreateProject} className="h-10 w-10 rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue" aria-label="Créer un projet IA">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3">
        {(conversations.length > 0 || projects.length > 0) && (
          <SearchBar
            value={conversationList.query}
            onChange={conversationList.setQuery}
            placeholder="Rechercher..."
            ariaLabel="Rechercher une conversation IA Entreprise"
          />
        )}
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {groupedEntries.map(([projectName, items]) => {
          const project = projects.find((item) => item.name === projectName) || null;
          return (
          <div key={projectName} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-2 pt-2 text-[0.7rem] font-black uppercase tracking-[0.16em] text-dtsc-muted">
              <span className="flex min-w-0 items-center gap-2">
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                <span className="truncate">{projectName}</span>
              </span>
              {project ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => onCreateInProject(project.id)} className="rounded-lg p-1 text-dtsc-blue hover:bg-dtsc-soft" aria-label={`Nouvelle conversation dans ${project.name}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onRenameProject(project)} className="rounded-lg p-1 text-dtsc-blue hover:bg-dtsc-soft" aria-label={`Renommer ${project.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onDeleteProject(project)} className="rounded-lg p-1 text-red-600 hover:bg-red-50" aria-label={`Supprimer ${project.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
            {items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                id={conversation.id}
                type="assistant"
                title={conversation.title}
                preview={`${conversation._count?.messages ?? conversation.messages.length} messages`}
                timestamp={formatRelativeUserDateTime(conversation.updatedAt)}
                isActive={activeConversationId === conversation.id}
                onClick={() => onSelect(conversation.id)}
              />
            ))}
            {project && !items.length ? (
              <p className="rounded-xl bg-dtsc-page p-3 text-xs font-bold text-dtsc-muted">
                Projet vide. Lancez une conversation dans ce projet.
              </p>
            ) : null}
          </div>
        );
        })}
        {!groupedEntries.length && (conversations.length > 0 || projects.length > 0) && (
          <p className="rounded-xl bg-dtsc-page p-3 text-xs font-bold text-dtsc-muted">Aucune conversation ne correspond à votre recherche.</p>
        )}
        {!conversations.length && !projects.length && (
          <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucune conversation IA pour le moment.</p>
        )}
      </div>
      {conversationList.pageCount > 1 && (
        <div className="mt-2 flex shrink-0 items-center justify-between gap-2 text-xs font-bold text-dtsc-muted">
          <Button type="button" size="sm" variant="outline" onClick={() => conversationList.setPage(Math.max(1, conversationList.page - 1))} disabled={conversationList.page <= 1} className="h-8 rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue">Préc.</Button>
          <span>{conversationList.page}/{conversationList.pageCount}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => conversationList.setPage(Math.min(conversationList.pageCount, conversationList.page + 1))} disabled={conversationList.page >= conversationList.pageCount} className="h-8 rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue">Suiv.</Button>
        </div>
      )}
      <div className="mt-4 shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-xs text-dtsc-muted">
        <p className="font-black text-dtsc-ink">Usage mensuel entreprise</p>
        <div className="mt-3 space-y-3">
          <UsageBar label="Messages" value={messageValue} limit={messageLimit} percent={messagePercent} />
          <UsageBar label="Sources" value={sourceValue} limit={sourceLimit} percent={sourcePercent} />
        </div>
      </div>
      <FloatingActionButton label="Nouvelle conversation IA Entreprise" onClick={onCreate} icon={<Bot className="h-5 w-5" />} />
    </aside>
  );
}

function UsageBar({ label, value, limit, percent }: { label: string; value: number; limit: number; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-black text-dtsc-ink">{value}/{limit || "∞"}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-dtsc-soft">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-cyan-600">{label}</p>
      <p className="mt-1 break-words font-bold text-dtsc-ink">{value}</p>
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
