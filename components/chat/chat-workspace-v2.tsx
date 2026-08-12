"use client";

import { Archive, Bot, Copy, Download, FolderKanban, FolderPlus, Info, Menu, Pencil, Pin, PinOff, Plus, Search, Settings2, Share2, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Streamdown } from "streamdown";
import { ActionMenu } from "@/components/ui/action-menu";
import { AssistantComposer, AssistantConversationSettingsDialog, AssistantEmptyState, AssistantMessage, type AssistantPreferenceState } from "@/components/chat/assistant-conversation-ui";
import { Button } from "@/components/ui/button";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";
import { formatRelativeUserDateTime, formatUserDateTime, type UserDatePreferences } from "@/lib/user-format";
import { cn } from "@/lib/utils";
import { getIteration05UserGuide } from "@/lib/user-guides/iteration05-guides";

type Preference = AssistantPreferenceState & { pinnedAt: string | null; archivedAt: string | null };
type ConversationSummary = { id: string; title: string; projectId: string | null; projectName: string | null; project?: { id: string; name: string } | null; updatedAt: string; _count?: { messages: number }; preference?: Preference };
type ConversationProject = { id: string; name: string; _count?: { conversations: number } };
type ChatMessage = { id: string; role: "user" | "assistant" | "system"; content: string; createdAt?: string; feedbackValue?: number | null };
type Filter = "ALL" | "PINNED" | "ARCHIVED";
type AssistantErrorBody = { reasonCode?: string; error?: string; code?: string } | null;

const EMPTY_PREFERENCE: Preference = { pinnedAt: null, archivedAt: null, modelOverride: null, responseStyle: null, responseLength: null, useCompanyContext: true, useKnowledge: true, customInstructions: null };

function getAssistantRequestError(body: AssistantErrorBody, en: boolean) {
  const reasonCode = body?.reasonCode || body?.error || body?.code || "";
  if (reasonCode === "DAILY_LIMIT_REACHED") return en ? "Daily AI limit reached." : "Limite IA journalière atteinte.";
  if (reasonCode === "RATE_LIMITED") return en ? "Too many requests. Please try again shortly." : "Trop de requêtes. Réessayez dans quelques instants.";
  if (reasonCode === "MODEL_UNAVAILABLE") return en ? "The selected AI model is not available in this context." : "Le modèle IA sélectionné n’est pas disponible dans ce contexte.";
  if (["ORGANIZATION_CONTEXT_REQUIRED", "ORGANIZATION_ACCESS_DENIED", "MODULE_CONTEXT_FORBIDDEN"].includes(reasonCode)) {
    return en ? "This assistant context is not available for your current session." : "Ce contexte de l’assistant n’est pas disponible pour votre session actuelle.";
  }
  if (reasonCode === "PROVIDER_UNAVAILABLE") return en ? "The AI service is temporarily unavailable." : "Le service IA est temporairement indisponible.";
  if (reasonCode === "CONTEXT_TOO_LARGE") return en ? "This conversation is too large for the selected model." : "Cette conversation est trop volumineuse pour le modèle sélectionné.";
  if (reasonCode === "STREAM_INTERRUPTED") return en ? "The AI response was interrupted. Please try again." : "La réponse de l’IA a été interrompue. Réessayez.";
  return en ? "Assistant temporarily unavailable." : "Assistant momentanément indisponible.";
}

export function ChatWorkspaceV2({
  initialConversations,
  initialProjects,
  collaborationGroups,
  initialConversationId,
  userPreferences,
  usage,
  models,
  assistantDefaults,
}: {
  initialConversations: ConversationSummary[];
  initialProjects: ConversationProject[];
  collaborationGroups: Array<{ id: string; name: string }>;
  initialConversationId?: string;
  userPreferences: UserDatePreferences;
  usage: { messagesToday: number; dailyMessageLimit: number; tokensToday: number; dailyTokenLimit: number; resetAt?: string };
  models: Array<{ id: string; label: string }>;
  assistantDefaults: { preferredModel: string | null; responseStyle: string; responseLength: string };
}) {
  const locale = useAppLocale() || "fr";
  const en = locale === "en";
  const [conversations, setConversations] = useState(initialConversations.map(withDefaultPreference));
  const [projects, setProjects] = useState(initialProjects);
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId || initialConversations[0]?.id || "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(!initialConversationId);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AssistantPreferenceState>(EMPTY_PREFERENCE);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareToGroupOpen, setShareToGroupOpen] = useState(false);
  const [projectDialog, setProjectDialog] = useState<"create" | "rename" | "delete" | null>(null);
  const [selectedProject, setSelectedProject] = useState<ConversationProject | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [dailyUsage, setDailyUsage] = useState(usage);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeConversationId) || null, [activeConversationId, conversations]);
  const activePreference = activeConversation?.preference || EMPTY_PREFERENCE;
  const visibleConversations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return conversations
      .filter((conversation) => filter === "ARCHIVED" ? Boolean(conversation.preference?.archivedAt) : !conversation.preference?.archivedAt)
      .filter((conversation) => filter !== "PINNED" || Boolean(conversation.preference?.pinnedAt))
      .filter((conversation) => !needle || `${conversation.title} ${conversation.project?.name || conversation.projectName || ""}`.toLocaleLowerCase(locale).includes(needle))
      .sort((a, b) => Number(Boolean(b.preference?.pinnedAt)) - Number(Boolean(a.preference?.pinnedAt)) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [conversations, filter, locale, query]);
  const grouped = useMemo(() => visibleConversations.reduce<Record<string, ConversationSummary[]>>((acc, conversation) => {
    const key = conversation.project?.name || conversation.projectName || (en ? "Unfiled" : "Sans projet");
    (acc[key] ||= []).push(conversation);
    return acc;
  }, {}), [en, visibleConversations]);

  async function refreshConversations(nextId?: string) {
    const [conversationResponse, projectResponse] = await Promise.all([fetch("/api/conversations"), fetch("/api/conversation-projects")]);
    const conversationBody = await conversationResponse.json().catch(() => null);
    const projectBody = await projectResponse.json().catch(() => null);
    if (conversationResponse.ok) setConversations((conversationBody?.conversations || []).map(withDefaultPreference));
    if (projectResponse.ok) setProjects(projectBody?.projects || []);
    if (nextId) setActiveConversationId(nextId);
  }

  const loadConversation = useCallback(async (id: string) => {
    if (!id) return setMessages([]);
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toastError(en ? "Unable to load this conversation." : "Impossible de charger cette conversation.");
    setMessages(body?.conversation?.messages || []);
    if (body?.conversation?.preference) setConversations((current) => current.map((item) => item.id === id ? { ...item, preference: { ...EMPTY_PREFERENCE, ...body.conversation.preference } } : item));
  }, [en]);

  useEffect(() => { void refreshConversations(); }, []);
  useEffect(() => { void loadConversation(activeConversationId); }, [activeConversationId, loadConversation]);
  useEffect(() => {
    const container = messageScrollRef.current;
    if (!container || !followOutputRef.current) return;
    const frame = requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    return () => cancelAnimationFrame(frame);
  }, [messages, isStreaming]);
  useEffect(() => {
    setSettingsDraft({
      modelOverride: activePreference.modelOverride,
      responseStyle: activePreference.responseStyle || assistantDefaults.responseStyle,
      responseLength: activePreference.responseLength || assistantDefaults.responseLength,
      useCompanyContext: activePreference.useCompanyContext ?? true,
      useKnowledge: activePreference.useKnowledge ?? true,
      customInstructions: activePreference.customInstructions,
    });
  }, [activeConversationId, activePreference.modelOverride, activePreference.responseStyle, activePreference.responseLength, activePreference.useCompanyContext, activePreference.useKnowledge, activePreference.customInstructions, assistantDefaults.responseLength, assistantDefaults.responseStyle]);

  async function createConversation() {
    const response = await fetch("/api/conversations", { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.conversation?.id) return toastError(en ? "Unable to create a conversation." : "Impossible de créer la conversation.");
    await refreshConversations(body.conversation.id);
    setMessages([]);
    setHistoryOpen(false);
  }

  async function patchConversation(payload: Record<string, unknown>, success?: string) {
    if (!activeConversation) return false;
    const response = await fetch(`/api/conversations/${encodeURIComponent(activeConversation.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { toastError(body?.error || (en ? "Action failed." : "Action impossible.")); return false; }
    if (success) toastSuccess(success);
    await refreshConversations(activeConversation.id);
    return true;
  }

  async function saveSettings(next = settingsDraft) {
    const ok = await patchConversation({ action: "configure", ...next }, en ? "Conversation settings saved." : "Réglages de la conversation enregistrés.");
    if (ok) setSettingsOpen(false);
  }

  async function toggleContext(key: "useCompanyContext" | "useKnowledge") {
    const next = { ...settingsDraft, [key]: !settingsDraft[key] };
    setSettingsDraft(next);
    await saveSettings(next);
  }

  async function renameConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await patchConversation({ action: "update", title: String(form.get("title") || ""), projectId: String(form.get("projectId") || "") });
    if (ok) setRenameOpen(false);
  }

  async function deleteConversation() {
    if (!activeConversation) return;
    const response = await fetch(`/api/conversations/${encodeURIComponent(activeConversation.id)}`, { method: "DELETE" });
    if (!response.ok) return toastError(en ? "Unable to delete the conversation." : "Impossible de supprimer la conversation.");
    setDeleteOpen(false); setMessages([]); setActiveConversationId(""); await refreshConversations();
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) return;
    const endpoint = selectedProject && projectDialog === "rename" ? `/api/conversation-projects/${selectedProject.id}` : "/api/conversation-projects";
    const response = await fetch(endpoint, { method: selectedProject && projectDialog === "rename" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!response.ok) return toastError(en ? "Unable to save project." : "Impossible d’enregistrer le projet.");
    setProjectDialog(null); setSelectedProject(null); await refreshConversations(activeConversationId);
  }

  async function deleteProject() {
    if (!selectedProject) return;
    const response = await fetch(`/api/conversation-projects/${selectedProject.id}`, { method: "DELETE" });
    if (!response.ok) return toastError(en ? "Unable to delete project." : "Impossible de supprimer le projet.");
    setProjectDialog(null); setSelectedProject(null); await refreshConversations(activeConversationId);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || isStreaming || activePreference.archivedAt) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content, createdAt: new Date().toISOString() };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() }]);
    setInput(""); setIsStreaming(true); followOutputRef.current = true;
    const response = await fetch("/api/chat/v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConversationId || undefined, content }) });
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null) as AssistantErrorBody;
      setIsStreaming(false);
      setMessages((current) => current.filter((item) => item.id !== assistantId));
      return toastError(getAssistantRequestError(body, en));
    }
    const createdId = response.headers.get("X-Conversation-Id");
    if (createdId && createdId !== activeConversationId) setActiveConversationId(createdId);
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + chunk } : item)); }
    setIsStreaming(false);
    setDailyUsage((current) => ({ ...current, messagesToday: Math.min(current.dailyMessageLimit, current.messagesToday + 1) }));
    const persistedId = createdId || activeConversationId;
    await refreshConversations(persistedId || undefined);
    if (persistedId) await loadConversation(persistedId);
  }

  async function reactToMessage(message: ChatMessage, value: 1 | -1) {
    const next = message.feedbackValue === value ? null : value;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedbackValue: next } : item));
    const response = await fetch(`/api/conversations/messages/${message.id}/feedback`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: next }) });
    if (!response.ok) setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedbackValue: message.feedbackValue ?? null } : item));
  }

  async function copyText(value: string, id?: string) {
    await navigator.clipboard?.writeText(value); if (id) { setCopiedMessageId(id); window.setTimeout(() => setCopiedMessageId(""), 1300); } else toastInfo(en ? "Copied." : "Copié.");
  }

  function exportConversation() {
    if (!activeConversation) return;
    const markdown = `# ${activeConversation.title}\n\n${messages.map((message) => `## ${message.role === "assistant" ? "Assistant DTSC" : message.role === "user" ? (en ? "You" : "Vous") : "System"}\n\n${message.content}`).join("\n\n")}`;
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${activeConversation.title.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 80) || "conversation"}.md`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function shareToGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activeConversation) return;
    const form = new FormData(event.currentTarget); const groupId = String(form.get("groupId") || "");
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: String(form.get("content") || `Conversation partagée: ${activeConversation.title}`), messageType: "CHATBOT_SHARE", sharedChatbotConversationId: activeConversation.id, mentionedUserIds: [] }) });
    if (response.ok) { setShareToGroupOpen(false); toastSuccess(en ? "Shared to group." : "Conversation partagée dans le groupe."); } else toastError(en ? "Share failed." : "Partage impossible.");
  }

  const currentModel = activePreference.modelOverride || assistantDefaults.preferredModel || "";
  const modelLabel = models.find((model) => model.id === currentModel)?.label || (en ? "Automatic" : "Automatique");
  const limitReached = dailyUsage.messagesToday >= dailyUsage.dailyMessageLimit || dailyUsage.tokensToday >= dailyUsage.dailyTokenLimit;
  const suggestions = en ? ["Summarize my current business priorities", "Help me structure a digital project", "Compare two implementation options", "Draft an actionable plan for this week"] : ["Résume mes priorités d’entreprise actuelles", "Aide-moi à structurer un projet numérique", "Compare deux options de mise en œuvre", "Prépare un plan d’action pour cette semaine"];

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-dtsc-surface pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-3">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#002b5b] text-white"><Bot className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-dtsc-ink">Assistant DTSC</p><p className="text-[0.68rem] font-semibold text-dtsc-muted">{en ? "Your AI conversations" : "Vos conversations IA"}</p></div><Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => void createConversation()} aria-label="New conversation"><Plus className="h-4 w-4" /></Button></div>
        <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={en ? "Search chats" : "Rechercher"} className="h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-page pl-9 pr-3 text-sm font-semibold outline-none focus:border-cyan-400" /></div>
        <div className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{(["ALL", "PINNED", "ARCHIVED"] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7rem] font-black", filter === item ? "bg-dtsc-ink text-dtsc-surface" : "text-dtsc-muted hover:bg-dtsc-page")}>{item === "ALL" ? (en ? "All" : "Toutes") : item === "PINNED" ? (en ? "Pinned" : "Épinglées") : (en ? "Archived" : "Archivées")}</button>)}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {Object.entries(grouped).map(([projectName, items]) => <div key={projectName} className="mb-3"><div className="group flex items-center justify-between px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.1em] text-dtsc-muted"><span className="flex min-w-0 items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5" /><span className="truncate">{projectName}</span></span>{projects.find((project) => project.name === projectName) ? <ActionMenu label="Project" className="scale-75" items={[{ key: "rename", label: en ? "Rename project" : "Renommer le projet", icon: Pencil, onSelect: () => { const project = projects.find((entry) => entry.name === projectName)!; setSelectedProject(project); setProjectDialog("rename"); } }, { key: "delete", label: en ? "Delete project" : "Supprimer le projet", icon: Trash2, destructive: true, onSelect: () => { const project = projects.find((entry) => entry.name === projectName)!; setSelectedProject(project); setProjectDialog("delete"); } }]} /> : null}</div>{items.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setActiveConversationId(conversation.id); setHistoryOpen(false); }} className={cn("group flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition", activeConversationId === conversation.id ? "bg-cyan-500/10" : "hover:bg-dtsc-page")}><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><strong className="truncate text-sm text-dtsc-ink">{conversation.title}</strong>{conversation.preference?.pinnedAt ? <Pin className="h-3 w-3 shrink-0 text-cyan-600" /> : null}</span><span className="mt-0.5 block truncate text-[0.68rem] font-semibold text-dtsc-muted">{conversation._count?.messages || 0} {en ? "messages" : "messages"} · {formatRelativeUserDateTime(conversation.updatedAt, userPreferences)}</span></span></button>)}</div>)}
        {!visibleConversations.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-dtsc-muted">{en ? "No conversations here." : "Aucune conversation ici."}</p> : null}
      </div>
      <div className="shrink-0 border-t border-dtsc-border px-3 pt-2"><button type="button" onClick={() => { setSelectedProject(null); setProjectDialog("create"); }} className="flex h-9 w-full items-center gap-2 rounded-xl px-2 text-xs font-black text-dtsc-muted hover:bg-dtsc-page"><FolderPlus className="h-4 w-4" />{en ? "New project" : "Nouveau projet"}</button><p className="px-2 pt-1 text-[0.65rem] font-semibold text-dtsc-muted">{dailyUsage.messagesToday}/{dailyUsage.dailyMessageLimit} {en ? "messages today" : "messages aujourd’hui"}</p></div>
    </div>
  );

  const menuItems = activeConversation ? [
    { key: "settings", label: en ? "Conversation settings" : "Configurer la conversation", icon: Settings2, onSelect: () => setSettingsOpen(true) },
    { key: "pin", label: activePreference.pinnedAt ? (en ? "Unpin" : "Désépingler") : (en ? "Pin" : "Épingler"), icon: activePreference.pinnedAt ? PinOff : Pin, onSelect: () => void patchConversation({ action: activePreference.pinnedAt ? "unpin" : "pin" }) },
    { key: "archive", label: activePreference.archivedAt ? (en ? "Restore" : "Restaurer") : (en ? "Archive" : "Archiver"), icon: Archive, onSelect: () => void patchConversation({ action: activePreference.archivedAt ? "restore" : "archive" }) },
    { key: "rename", label: en ? "Rename / move" : "Renommer / classer", icon: Pencil, onSelect: () => setRenameOpen(true) },
    { key: "share-group", label: en ? "Share to a group" : "Partager dans un groupe", icon: Share2, onSelect: () => setShareToGroupOpen(true) },
    { key: "copy-link", label: en ? "Copy link" : "Copier le lien", icon: Copy, onSelect: () => void copyText(`${window.location.origin}/chat?conversationId=${activeConversation.id}`) },
    { key: "export", label: en ? "Export Markdown" : "Exporter en Markdown", icon: Download, onSelect: exportConversation },
    { key: "info", label: en ? "Conversation info" : "Infos de la conversation", icon: Info, onSelect: () => setInfoOpen(true) },
    { key: "delete", label: en ? "Delete" : "Supprimer", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleteOpen(true) },
  ] : [];

  return (
    <div className="relative grid h-[calc(100dvh-7.25rem)] min-h-0 min-w-0 overflow-hidden bg-dtsc-surface sm:h-[calc(100dvh-8rem)] lg:h-[calc(100vh-7rem)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-dtsc-border lg:block">{sidebar}</aside>
      {historyOpen ? <div className="fixed inset-0 z-[80] bg-dtsc-surface lg:hidden"><div className="flex h-12 items-center justify-between border-b border-dtsc-border px-3"><strong className="text-sm text-dtsc-ink">{en ? "Conversations" : "Conversations"}</strong><Button type="button" size="icon" variant="ghost" className="rounded-full" onClick={() => setHistoryOpen(false)}><X className="h-4 w-4" /></Button></div><div className="h-[calc(100dvh-3rem)]">{sidebar}</div></div> : null}
      <main data-immersive-conversation="true" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-dtsc-surface">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-dtsc-border/70 px-2.5 sm:px-4"><Button type="button" variant="ghost" size="icon" onClick={() => setHistoryOpen(true)} className="h-10 w-10 rounded-full lg:hidden" aria-label="History"><Menu className="h-5 w-5" /></Button><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-600"><Bot className="h-4 w-4" /></span><button type="button" onClick={() => setInfoOpen(true)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm font-black text-dtsc-ink">{activeConversation?.title || "Assistant DTSC"}</strong><span className="block truncate text-[0.68rem] font-semibold text-dtsc-muted">{activePreference.archivedAt ? (en ? "Archived conversation" : "Conversation archivée") : `${modelLabel} · ${en ? "ready" : "prêt"}`}</span></button><ContextualUserGuide guide={getIteration05UserGuide("GLOBAL_CHATBOT", locale)} compact /><Button type="button" variant="ghost" size="icon" onClick={() => void createConversation()} className="hidden h-10 w-10 rounded-full sm:inline-flex" aria-label="New"><Plus className="h-4 w-4" /></Button><ActionMenu label="Conversation actions" items={menuItems} orientation="horizontal" /></header>
        <div ref={messageScrollRef} onScroll={(event) => { const node = event.currentTarget; followOutputRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 140; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-dtsc-page py-2">
          {!messages.length ? <AssistantEmptyState title={en ? "What can I help you with?" : "Comment puis-je vous aider ?"} description={en ? "Ask DTSC Assistant to clarify a need, analyze your private business context or work from your authorized documents." : "Demandez à l’Assistant DTSC de cadrer un besoin, d’analyser votre contexte d’entreprise privé ou de travailler à partir de vos documents autorisés."} suggestions={suggestions} onSuggestion={setInput} /> : messages.map((chatMessage) => <AssistantMessage key={chatMessage.id} role={chatMessage.role} author="Assistant DTSC" meta={chatMessage.createdAt ? formatRelativeUserDateTime(chatMessage.createdAt, userPreferences) : undefined} actions={chatMessage.role === "assistant" && chatMessage.content && !isStreaming ? <><button type="button" onClick={() => void reactToMessage(chatMessage, 1)} className={cn("rounded-full p-2", chatMessage.feedbackValue === 1 ? "bg-cyan-500/12 text-cyan-700" : "text-dtsc-muted hover:bg-dtsc-soft")} aria-label="Like"><ThumbsUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void reactToMessage(chatMessage, -1)} className={cn("rounded-full p-2", chatMessage.feedbackValue === -1 ? "bg-rose-500/10 text-rose-700" : "text-dtsc-muted hover:bg-dtsc-soft")} aria-label="Dislike"><ThumbsDown className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void copyText(chatMessage.content, chatMessage.id)} className="rounded-full p-2 text-dtsc-muted hover:bg-dtsc-soft" aria-label="Copy"><Copy className="h-3.5 w-3.5" /></button><span className="text-[0.65rem] font-semibold text-dtsc-muted">{copiedMessageId === chatMessage.id ? (en ? "Copied" : "Copié") : ""}</span></> : undefined}>{chatMessage.role === "assistant" ? <Streamdown>{chatMessage.content || "…"}</Streamdown> : <p className="whitespace-pre-wrap break-words">{chatMessage.content}</p>}</AssistantMessage>)}
        </div>
        <AssistantComposer value={input} onChange={setInput} onSubmit={sendMessage} placeholder={en ? "Message DTSC Assistant" : "Message à l’Assistant DTSC"} disabled={limitReached || Boolean(activePreference.archivedAt)} sending={isStreaming} modelLabel={modelLabel} onSettings={() => setSettingsOpen(true)} contextChips={[{ key: "company", label: en ? "Company" : "Entreprise", active: settingsDraft.useCompanyContext ?? true, onClick: () => void toggleContext("useCompanyContext") }, { key: "docs", label: en ? "Documents" : "Documents", active: settingsDraft.useKnowledge, onClick: () => void toggleContext("useKnowledge") }]} helper={activePreference.archivedAt ? (en ? "Restore this conversation before sending a new message." : "Restaurez cette conversation avant d’envoyer un nouveau message.") : (en ? "AI can make mistakes. Verify important information." : "L’IA peut se tromper. Vérifiez les informations importantes.")} />
      </main>

      <AssistantConversationSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title={en ? "Conversation settings" : "Configurer la conversation"} preference={settingsDraft} onChange={setSettingsDraft} onSave={() => void saveSettings()} models={models} locale={locale} sourceOptions={[{ key: "useCompanyContext", label: en ? "Private company context" : "Contexte entreprise privé", description: en ? "Uses your DTSC company profile and activities when relevant." : "Utilise votre profil et vos activités Entreprise DTSC lorsque c’est pertinent." }, { key: "useKnowledge", label: en ? "Private documents" : "Documents privés", description: en ? "Uses only documents you are already authorized to access." : "Utilise uniquement les documents auxquels vous avez déjà accès." }]} />
      <Dialog open={renameOpen} title={en ? "Rename and organize" : "Renommer et classer"} onClose={() => setRenameOpen(false)}>{activeConversation ? <form onSubmit={renameConversation} className="grid gap-3"><Input name="title" defaultValue={activeConversation.title} required /><select name="projectId" defaultValue={activeConversation.projectId || ""} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold"><option value="">{en ? "No project" : "Sans projet"}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Button type="submit">{en ? "Save" : "Enregistrer"}</Button></form> : null}</Dialog>
      <Dialog open={deleteOpen} title={en ? "Delete conversation" : "Supprimer la conversation"} onClose={() => setDeleteOpen(false)} footer={<><Button variant="outline" onClick={() => setDeleteOpen(false)}>{en ? "Cancel" : "Annuler"}</Button><Button variant="destructive" onClick={() => void deleteConversation()}>{en ? "Delete" : "Supprimer"}</Button></>}><p className="text-sm text-dtsc-muted">{en ? "This permanently deletes this private chatbot conversation." : "Cette action supprime définitivement cette conversation chatbot privée."}</p></Dialog>
      <Dialog open={infoOpen} title={en ? "Conversation info" : "Infos de la conversation"} onClose={() => setInfoOpen(false)}>{activeConversation ? <div className="grid gap-2 text-sm"><InfoLine label={en ? "Title" : "Titre"} value={activeConversation.title} /><InfoLine label={en ? "Project" : "Projet"} value={activeConversation.project?.name || activeConversation.projectName || (en ? "None" : "Aucun")} /><InfoLine label={en ? "Messages" : "Messages"} value={String(activeConversation._count?.messages || messages.length)} /><InfoLine label={en ? "Last activity" : "Dernière activité"} value={formatUserDateTime(activeConversation.updatedAt, userPreferences)} /></div> : null}</Dialog>
      <Dialog open={shareToGroupOpen} title={en ? "Share to a group" : "Partager dans un groupe"} onClose={() => setShareToGroupOpen(false)}>{activeConversation ? <form onSubmit={shareToGroup} className="grid gap-3"><select name="groupId" required className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold"><option value="">{en ? "Choose a group" : "Choisir un groupe"}</option>{collaborationGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><Input name="content" defaultValue={en ? `Shared conversation: ${activeConversation.title}` : `Conversation partagée : ${activeConversation.title}`} /><Button type="submit">{en ? "Share" : "Partager"}</Button></form> : null}</Dialog>
      <Dialog open={projectDialog === "create" || projectDialog === "rename"} title={projectDialog === "rename" ? (en ? "Rename project" : "Renommer le projet") : (en ? "New project" : "Nouveau projet")} onClose={() => { setProjectDialog(null); setSelectedProject(null); }}><form onSubmit={saveProject} className="grid gap-3"><Input name="name" defaultValue={selectedProject?.name || ""} required /><Button type="submit">{en ? "Save" : "Enregistrer"}</Button></form></Dialog>
      <Dialog open={projectDialog === "delete"} title={en ? "Delete project" : "Supprimer le projet"} onClose={() => { setProjectDialog(null); setSelectedProject(null); }} footer={<><Button variant="outline" onClick={() => setProjectDialog(null)}>{en ? "Cancel" : "Annuler"}</Button><Button variant="destructive" onClick={() => void deleteProject()}>{en ? "Delete" : "Supprimer"}</Button></>}><p className="text-sm text-dtsc-muted">{en ? "Conversations are kept and become unfiled." : "Les conversations sont conservées et replacées sans projet."}</p></Dialog>
    </div>
  );
}

function withDefaultPreference(conversation: ConversationSummary): ConversationSummary { return { ...conversation, preference: { ...EMPTY_PREFERENCE, ...(conversation.preference || {}) } }; }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-dtsc-border py-2"><span className="font-semibold text-dtsc-muted">{label}</span><strong className="max-w-[65%] text-right text-dtsc-ink">{value}</strong></div>; }
