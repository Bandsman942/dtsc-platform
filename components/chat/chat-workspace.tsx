"use client";

import { Copy, FolderKanban, FolderPlus, Info, Loader2, Pencil, Plus, Share2, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { ConversationComposer } from "@/components/chat/ConversationComposer";
import { ConversationEmptyState } from "@/components/chat/ConversationEmptyState";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { ConversationListItem } from "@/components/chat/ConversationListItem";
import { ConversationLayout } from "@/components/chat/ConversationLayout";
import { FloatingActionButton } from "@/components/chat/FloatingActionButton";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SearchBar } from "@/components/chat/SearchBar";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatRelativeUserDateTime, formatUserDateTime, type UserDatePreferences } from "@/lib/user-format";
import { cn } from "@/lib/utils";

type ConversationSummary = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  project?: { id: string; name: string } | null;
  updatedAt: string;
  _count?: { messages: number };
};

type ConversationProject = {
  id: string;
  name: string;
  _count?: { conversations: number };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
  feedbackValue?: number | null;
};

export function ChatWorkspace({
  initialConversations,
  initialProjects,
  collaborationGroups,
  initialConversationId,
  userPreferences,
  usage,
}: {
  initialConversations: ConversationSummary[];
  initialProjects: ConversationProject[];
  collaborationGroups: Array<{ id: string; name: string }>;
  initialConversationId?: string;
  userPreferences: UserDatePreferences;
  usage: {
    messagesToday: number;
    dailyMessageLimit: number;
    tokensToday: number;
    dailyTokenLimit: number;
    resetAt?: string;
  };
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [projects, setProjects] = useState(initialProjects);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationId || initialConversations[0]?.id || ""
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [dailyUsage, setDailyUsage] = useState(usage);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareToGroupOpen, setShareToGroupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(!initialConversationId);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [projectDialog, setProjectDialog] = useState<"create" | "rename" | "delete" | null>(null);
  const [selectedProject, setSelectedProject] = useState<ConversationProject | null>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );
  const conversationList = useSmartList({
    items: conversations,
    pageSize: 8,
    getSearchText: (conversation) =>
      `${conversation.title} ${conversation.project?.name || conversation.projectName || ""} ${conversation.updatedAt} ${conversation._count?.messages ?? 0}`,
  });
  const groupedConversations = useMemo(() => {
    const initialGroups = projects.reduce<Record<string, ConversationSummary[]>>((groups, project) => {
      groups[project.name] = [];
      return groups;
    }, {});
    return conversationList.paginatedItems.reduce<Record<string, ConversationSummary[]>>((groups, conversation) => {
      const key = conversation.project?.name || conversation.projectName?.trim() || "Sans projet";
      groups[key] = [...(groups[key] || []), conversation];
      return groups;
    }, initialGroups);
  }, [conversationList.paginatedItems, projects]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    fetch(`/api/conversations/${activeConversationId}`)
      .then((response) => response.json())
      .then((data) => setMessages(data.conversation?.messages ?? []))
      .catch(() => toastError("Impossible de charger la conversation."));
  }, [activeConversationId]);

  useEffect(() => {
    const container = messageScrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  async function refreshConversations(nextId?: string) {
    const [conversationResponse, projectResponse] = await Promise.all([
      fetch("/api/conversations"),
      fetch("/api/conversation-projects"),
    ]);
    const data = await conversationResponse.json();
    const projectData = await projectResponse.json();
    setConversations(data.conversations ?? []);
    setProjects(projectData.projects ?? []);
    if (nextId) {
      setActiveConversationId(nextId);
      setHistoryOpen(false);
    }
  }

  async function createConversation() {
    const response = await fetch("/api/conversations", { method: "POST" });
    const data = await response.json();
    await refreshConversations(data.conversation.id);
  }

  async function renameConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const projectIdValue = String(formData.get("projectId") || "").trim();
    if (!title) {
      return;
    }

    await fetch(`/api/conversations/${activeConversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, projectId: projectIdValue || null }),
    });
    setRenameOpen(false);
    await refreshConversations(activeConversation.id);
  }

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) {
      return;
    }

    const endpoint = selectedProject && projectDialog === "rename"
      ? `/api/conversation-projects/${selectedProject.id}`
      : "/api/conversation-projects";
    await fetch(endpoint, {
      method: selectedProject && projectDialog === "rename" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setProjectDialog(null);
    setSelectedProject(null);
    await refreshConversations(activeConversationId);
  }

  async function deleteProject() {
    if (!selectedProject) {
      return;
    }

    await fetch(`/api/conversation-projects/${selectedProject.id}`, { method: "DELETE" });
    setProjectDialog(null);
    setSelectedProject(null);
    await refreshConversations(activeConversationId);
  }

  async function deleteConversation() {
    if (!activeConversation) {
      return;
    }

    await fetch(`/api/conversations/${activeConversation.id}`, { method: "DELETE" });
    setDeleteOpen(false);
    setMessages([]);
    await refreshConversations();
    setActiveConversationId("");
  }

  async function shareConversationToGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const groupId = String(formData.get("groupId") || "");
    if (!groupId) {
      toastError("Sélectionnez un groupe de destination.");
      return;
    }
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: String(formData.get("content") || `Conversation partagée: ${activeConversation.title}`),
        messageType: "CHATBOT_SHARE",
        sharedChatbotConversationId: activeConversation.id,
        mentionedUserIds: [],
      }),
    });
    if (response.ok) {
      setShareToGroupOpen(false);
      toastSuccess("Conversation partagée dans le groupe.");
    } else {
      toastError("Impossible de partager cette conversation dans le groupe.");
    }
  }

  async function sendMessage(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!input.trim() || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() },
    ]);
    setInput("");
    setIsStreaming(true);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: activeConversationId || undefined,
        content: userMessage.content,
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      if (body?.usage) {
        setDailyUsage(body.usage);
      }
      toastError(body?.code === "DAILY_LIMIT_REACHED" ? `Limite journalière atteinte. Vos messages seront réinitialisés le ${formatResetAt(body.usage?.resetAt)}.` : "Le chatbot DTSC est momentanément indisponible.");
      setIsStreaming(false);
      return;
    }

    const createdConversationId = response.headers.get("X-Conversation-Id");
    if (createdConversationId && createdConversationId !== activeConversationId) {
      setActiveConversationId(createdConversationId);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: `${message.content}${chunk}` }
            : message
        )
      );
    }

    setIsStreaming(false);
    setDailyUsage((current) => ({
      ...current,
      messagesToday: Math.min(current.dailyMessageLimit, current.messagesToday + 1),
    }));
    const persistedConversationId = createdConversationId || activeConversationId;
    await refreshConversations(persistedConversationId);
    if (persistedConversationId) {
      const refreshed = await fetch(`/api/conversations/${persistedConversationId}`).then((result) => result.json()).catch(() => null);
      setMessages(refreshed?.conversation?.messages ?? []);
    }
  }

  const messagePercent = Math.min(100, Math.round((dailyUsage.messagesToday / dailyUsage.dailyMessageLimit) * 100));
  const tokenPercent = Math.min(100, Math.round((dailyUsage.tokensToday / dailyUsage.dailyTokenLimit) * 100));
  const limitReached = dailyUsage.messagesToday >= dailyUsage.dailyMessageLimit || dailyUsage.tokensToday >= dailyUsage.dailyTokenLimit;
  const resetLabel = formatResetAt(dailyUsage.resetAt);
  const activeConversationShareUrl = activeConversationId ? `/chat?conversationId=${activeConversationId}` : "/chat";
  const activeConversationAbsoluteUrl = typeof window === "undefined" ? activeConversationShareUrl : `${window.location.origin}${activeConversationShareUrl}`;

  async function copyTextToClipboard(value: string) {
    const browserNavigator = typeof window === "undefined" ? undefined : window.navigator;
    if (!browserNavigator?.clipboard) {
      toastError("Copie indisponible dans ce navigateur.");
      return;
    }
    await browserNavigator.clipboard.writeText(value);
    toastInfo("Contenu copié.");
  }

  async function copyAssistantResponse(message: ChatMessage) {
    const browserNavigator = typeof window === "undefined" ? undefined : window.navigator;
    if (!browserNavigator?.clipboard) {
      toastError("Copie indisponible dans ce navigateur.");
      return;
    }
    await browserNavigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId((current) => (current === message.id ? "" : current)), 1600);
  }

  async function reactToAssistantMessage(message: ChatMessage, value: 1 | -1) {
    const nextValue = message.feedbackValue === value ? null : value;
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, feedbackValue: nextValue } : item
      )
    );
    const response = await fetch(`/api/conversations/messages/${message.id}/feedback`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: nextValue }),
    });
    if (!response.ok) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, feedbackValue: message.feedbackValue ?? null } : item
        )
      );
      toastError("Impossible d'enregistrer cette réaction.");
    }
  }

  async function shareActiveConversationLink() {
    const browserNavigator = typeof window === "undefined" ? undefined : window.navigator;
    if (browserNavigator?.share) {
      await browserNavigator.share({
        title: activeConversation?.title || "Conversation DTSC",
        text: "Conversation DTSC Platform",
        url: activeConversationAbsoluteUrl,
      }).catch(() => null);
      return;
    }
    await copyTextToClipboard(activeConversationAbsoluteUrl);
  }

  const historyPanel = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden px-3 py-3 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">Assistant DTSC</p>
          <h2 className="truncate text-lg font-black text-dtsc-ink">Conversations</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setProjectDialog("create")}
          className="h-11 w-11 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"
          aria-label="Créer un dossier de conversations"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3">
        {conversations.length > 0 && (
          <SearchBar
            value={conversationList.query}
            onChange={conversationList.setQuery}
            placeholder="Rechercher une conversation..."
            ariaLabel="Rechercher une conversation DTSC"
          />
        )}
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {Object.entries(groupedConversations).map(([projectName, items]) => {
          const project = projects.find((item) => item.name === projectName);
          return (
            <div key={projectName} className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-2 pt-2 text-[0.7rem] font-black uppercase tracking-[0.16em] text-dtsc-muted">
                <span className="flex min-w-0 items-center gap-2">
                  <FolderKanban className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                  <span className="truncate">{projectName}</span>
                </span>
                {project && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProject(project);
                        setProjectDialog("rename");
                      }}
                      className="rounded-lg p-1 text-dtsc-blue hover:bg-dtsc-soft"
                      aria-label={`Renommer ${project.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProject(project);
                        setProjectDialog("delete");
                      }}
                      className="rounded-lg p-1 text-red-600 hover:bg-red-50"
                      aria-label={`Supprimer ${project.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
              {items.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  id={conversation.id}
                  type="assistant"
                  title={conversation.title}
                  preview={`${conversation._count?.messages ?? 0} messages`}
                  timestamp={formatRelativeUserDateTime(conversation.updatedAt, userPreferences)}
                  isActive={activeConversationId === conversation.id}
                  onClick={() => {
                    setActiveConversationId(conversation.id);
                    setHistoryOpen(false);
                  }}
                />
              ))}
              {!items.length && (
                <p className="rounded-xl bg-dtsc-page p-3 text-xs font-bold text-dtsc-muted">
                  Dossier vide. Ajoutez une conversation via le bouton modifier d&apos;une conversation.
                </p>
              )}
            </div>
          );
        })}
        {!conversationList.filteredCount && conversations.length > 0 && (
          <p className="rounded-xl bg-dtsc-page p-3 text-xs font-bold text-dtsc-muted">
            Aucune conversation ne correspond à votre recherche.
          </p>
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
        <p className="font-black text-dtsc-ink">Usage journalier</p>
        <div className="mt-3 space-y-3">
          <UsageBar label="Messages" value={dailyUsage.messagesToday} limit={dailyUsage.dailyMessageLimit} percent={messagePercent} />
          <UsageBar label="Tokens" value={dailyUsage.tokensToday} limit={dailyUsage.dailyTokenLimit} percent={tokenPercent} />
        </div>
        {limitReached && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 font-bold text-red-700">
            Limite atteinte: l&apos;envoi est bloqué jusqu&apos;au {resetLabel}.
          </div>
        )}
      </div>
      <FloatingActionButton label="Nouvelle conversation DTSC" onClick={createConversation} icon={<Plus className="h-5 w-5" />} />
    </div>
  );

  return (
    <ConversationLayout sidebar={historyPanel} sidebarOpen={false}>
      {historyOpen && (
        <div className="fixed inset-0 z-40 bg-[#001736]/55 backdrop-blur-sm lg:hidden" onClick={() => setHistoryOpen(false)}>
          <div className="h-full w-[min(92vw,24rem)] p-3" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <Button type="button" size="icon" variant="outline" onClick={() => setHistoryOpen(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {historyPanel}
          </div>
        </div>
      )}

      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-dtsc-surface">
        <ConversationHeader
          title={activeConversation?.title || "Assistant DTSC"}
          subtitle="Assistant IA DTSC · En ligne"
          type="assistant"
          onBack={() => setHistoryOpen(true)}
          actions={(
            <ActionMenu
              label="Actions de la conversation"
              items={[
                { key: "info", label: "Infos sur la conversation", icon: Info, onSelect: () => setInfoOpen(true), disabled: !activeConversation },
                { key: "copy-link", label: "Copier le lien", icon: Copy, onSelect: () => copyTextToClipboard(activeConversationAbsoluteUrl), disabled: !activeConversation },
                { key: "share", label: "Partager", icon: Share2, onSelect: shareActiveConversationLink, disabled: !activeConversation },
                { key: "share-group", label: "Transférer vers un groupe", icon: Share2, onSelect: () => setShareToGroupOpen(true), disabled: !activeConversation },
                { key: "rename", label: "Renommer", icon: Pencil, onSelect: () => setRenameOpen(true), disabled: !activeConversation },
                { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setDeleteOpen(true), disabled: !activeConversation },
              ]}
            />
          )}
        />
        <div ref={messageScrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-dtsc-page px-2.5 py-3 sm:px-4 sm:py-4 lg:px-7">
          {!messages.length && (
            <ConversationEmptyState title="Aucune conversation IA active." description="Demarrez une discussion avec l'assistant DTSC pour cadrer un besoin numerique, data ou automatisation." />
          )}
          <div className="space-y-3 sm:space-y-5">
            {messages.map((message) => {
              return (
                <MessageBubble
                  key={message.id}
                  role={message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user"}
                  author={message.role === "assistant" ? "Assistant DTSC" : "Vous"}
                  initials={message.role === "assistant" ? "AI" : "VO"}
                  meta={message.createdAt ? formatRelativeUserDateTime(message.createdAt, userPreferences) : undefined}
                  actions={message.role === "assistant" && message.content && !isStreaming ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => reactToAssistantMessage(message, 1)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-black transition",
                          message.feedbackValue === 1 ? "bg-cyan-100 text-[#002b5b]" : "bg-dtsc-page text-dtsc-muted hover:bg-cyan-50 hover:text-[#002b5b]"
                        )}
                        aria-label="Aimer la réponse"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Like
                      </button>
                      <button
                        type="button"
                        onClick={() => reactToAssistantMessage(message, -1)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-black transition",
                          message.feedbackValue === -1 ? "bg-rose-100 text-rose-700" : "bg-dtsc-page text-dtsc-muted hover:bg-rose-50 hover:text-rose-700"
                        )}
                        aria-label="Ne pas aimer la réponse"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Dislike
                      </button>
                      <button
                        type="button"
                        onClick={() => copyAssistantResponse(message)}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-dtsc-page px-2.5 text-xs font-black text-dtsc-muted transition hover:bg-cyan-50 hover:text-[#002b5b]"
                        aria-label="Copier la réponse"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedMessageId === message.id ? "Copié" : "Copier"}
                      </button>
                    </div>
                  ) : null}
                >
                  {message.role === "assistant" ? (
                    <div className="dtsc-assistant-markdown">
                      <Streamdown>{message.content || "..."}</Streamdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </MessageBubble>
              );
            })}
            {isStreaming && (
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                DTSC Assistant rédige une réponse...
              </div>
            )}
          </div>
        </div>

        <ConversationComposer
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          placeholder="Écrivez votre demande..."
          disabled={limitReached}
          sending={isStreaming}
          helper="Le chatbot DTSC peut se tromper. Vérifiez les informations importantes avant toute décision."
        />
      </section>
      <Dialog open={infoOpen} title="Infos sur la conversation" onClose={() => setInfoOpen(false)}>
        {activeConversation && (
          <div className="grid gap-3 text-sm text-dtsc-muted sm:grid-cols-2">
            <InfoCard label="Titre" value={activeConversation.title} />
            <InfoCard label="Dossier" value={activeConversation.project?.name || activeConversation.projectName || "Sans dossier"} />
            <InfoCard label="Messages" value={String(activeConversation._count?.messages ?? messages.length)} />
            <InfoCard label="Dernière activité" value={formatUserDateTime(activeConversation.updatedAt, userPreferences)} />
          </div>
        )}
      </Dialog>
      <Dialog open={renameOpen} title="Renommer la conversation" onClose={() => setRenameOpen(false)}>
        <form onSubmit={renameConversation} className="space-y-3">
          <Input name="title" defaultValue={activeConversation?.title || ""} required placeholder="Titre de la conversation" />
          <select
            name="projectId"
            defaultValue={activeConversation?.projectId || activeConversation?.project?.id || ""}
            className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink outline-none focus:border-cyan-400"
          >
            <option value="">Sans dossier</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog open={shareToGroupOpen} title="Partager dans Mes collaborateurs" onClose={() => setShareToGroupOpen(false)}>
        <form onSubmit={shareConversationToGroup} className="space-y-3">
          <p className="text-sm leading-7 text-dtsc-muted">
            Le partage est volontaire. Les membres du groupe verront une copie consultable, pas votre conversation privée originale.
          </p>
          <select name="groupId" required className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
            <option value="">Choisir un groupe</option>
            {collaborationGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          <textarea name="content" defaultValue={activeConversation ? `Conversation partagée: ${activeConversation.title} (${formatUserDateTime(activeConversation.updatedAt, userPreferences)})` : ""} className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Partager</Button>
        </form>
      </Dialog>
      <Dialog
        open={projectDialog === "create" || projectDialog === "rename"}
        title={projectDialog === "rename" ? "Renommer le dossier" : "Créer un dossier"}
        onClose={() => {
          setProjectDialog(null);
          setSelectedProject(null);
        }}
      >
        <form onSubmit={saveProject} className="space-y-3">
          <Input name="name" defaultValue={selectedProject?.name || ""} placeholder="Nom du dossier ou projet" required />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog
        open={projectDialog === "delete"}
        title="Supprimer le dossier"
        description="Les conversations ne seront pas supprimées. Elles seront replacées dans Sans dossier."
        onClose={() => {
          setProjectDialog(null);
          setSelectedProject(null);
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setProjectDialog(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={deleteProject} className="rounded-xl">
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression du dossier {selectedProject?.name}.</p>
      </Dialog>
      <Dialog
        open={deleteOpen}
        title="Supprimer la conversation"
        description="Cette action retire la conversation et ses messages de votre espace."
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={deleteConversation} className="rounded-xl">
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression de cette conversation.</p>
      </Dialog>
    </ConversationLayout>
  );
}

function formatResetAt(resetAt?: string) {
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(0, 0, 0, 0);
  const date = resetAt ? new Date(resetAt) : fallback;
  return date.toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-1 break-words font-bold text-dtsc-ink">{value}</p>
    </div>
  );
}

function UsageBar({
  label,
  value,
  limit,
  percent,
}: {
  label: string;
  value: number;
  limit: number;
  percent: number;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-bold">{value}/{limit}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-dtsc-soft">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
