"use client";

import { Copy, FolderKanban, FolderPlus, Info, Loader2, Menu, Pencil, Plus, Send, Share2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { getParticipantColor } from "@/lib/participant-colors";
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
  const [error, setError] = useState("");
  const [dailyUsage, setDailyUsage] = useState(usage);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareToGroupOpen, setShareToGroupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
      .catch(() => setError("Impossible de charger la conversation."));
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
      setError("Sélectionnez un groupe de destination.");
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
      setError("Conversation partagée dans le groupe.");
    } else {
      setError("Impossible de partager cette conversation dans le groupe.");
    }
  }

  async function sendMessage(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!input.trim() || isStreaming) {
      return;
    }

    setError("");
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
      setError(body?.code === "DAILY_LIMIT_REACHED" ? `Limite journalière atteinte. Vos messages seront réinitialisés le ${formatResetAt(body.usage?.resetAt)}.` : "Le chatbot DTSC est momentanément indisponible.");
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
    await refreshConversations(createdConversationId || activeConversationId);
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
      setError("Copie indisponible dans ce navigateur.");
      return;
    }
    await browserNavigator.clipboard.writeText(value);
    setError("Contenu copié.");
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
    <aside className="dtsc-card flex h-full min-h-0 flex-col overflow-hidden p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <Button onClick={createConversation} className="h-11 flex-1 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <Plus className="h-4 w-4" />
          Nouvelle conversation
        </Button>
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
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sm:mt-4 sm:space-y-3">
        {conversations.length > 0 && (
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <ListControls
              query={conversationList.query}
              onQueryChange={conversationList.setQuery}
              page={conversationList.page}
              pageCount={conversationList.pageCount}
              totalCount={conversationList.totalCount}
              filteredCount={conversationList.filteredCount}
              placeholder="Rechercher une conversation..."
              onPageChange={conversationList.setPage}
            />
          </div>
        )}
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
                <button
                  key={conversation.id}
                  onClick={() => {
                    setActiveConversationId(conversation.id);
                    setHistoryOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-xl px-3 py-3 text-left text-sm transition",
                    activeConversationId === conversation.id
                      ? "border-l-4 border-cyan-400 bg-slate-100 text-[#001736]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-[#001736]"
                  )}
                >
                  <span className="block truncate font-medium">{conversation.title}</span>
                  <span className="text-xs text-slate-500">
                    {conversation._count?.messages ?? 0} messages · {formatRelativeUserDateTime(conversation.updatedAt, userPreferences)}
                  </span>
                </button>
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
    </aside>
  );

  return (
    <div className="relative grid h-[calc(100dvh-7.25rem)] min-h-0 gap-3 sm:h-[calc(100dvh-8rem)] lg:h-[calc(100vh-7rem)] lg:grid-cols-[320px_1fr]">
      <div className="hidden min-h-0 lg:block">{historyPanel}</div>
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

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5 sm:py-4">
          <Button type="button" variant="outline" size="icon" onClick={() => setHistoryOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue lg:hidden" aria-label="Ouvrir les conversations">
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-[#001736] sm:text-xl">
              {activeConversation?.title || "Assistant DTSC"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#d5e3fd] px-2.5 py-1 text-xs font-bold text-[#002b5b]">Assistant IA DTSC</span>
              <span className="text-xs font-medium text-slate-500">En ligne</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>

        <div ref={messageScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#faf9fe] px-3 py-3 sm:px-4 sm:py-5 lg:px-8">
          {!messages.length && (
            <div className="mx-auto flex h-full max-w-2xl flex-col justify-center text-center">
              <p className="text-3xl font-bold text-[#001736]">Comment DTSC peut vous aider ?</p>
              <p className="mt-3 leading-7 text-slate-600">
                Décrivez votre besoin en transformation numérique, automatisation, data, application métier ou IA.
              </p>
            </div>
          )}
          <div className="space-y-3 sm:space-y-5">
            {messages.map((message) => {
              const participantColor = getParticipantColor(message.role === "assistant" ? "dtsc-assistant" : "current-user");
              return (
              <div key={message.id} className={cn("flex gap-3", message.role === "user" && "justify-end")}>
                {message.role === "assistant" && (
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", participantColor.bgClassName, participantColor.textClassName)}>
                    <BotIcon />
                  </div>
                )}
                <div
                  className={cn(
                    "group max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6 shadow-[0_4px_20px_rgba(0,43,91,0.05)] sm:max-w-[88%] sm:px-4 sm:py-3",
                    message.role === "user"
                      ? "rounded-tr-sm bg-[#002b5b] text-white"
                      : "rounded-tl-sm bg-white text-slate-800"
                  )}
                >
                  <p className="mb-1 text-xs font-black" style={{ color: message.role === "user" ? "#a5f3fc" : participantColor.hex }}>
                    {message.role === "assistant" ? "Assistant DTSC" : "Vous"}
                  </p>
                  {message.role === "assistant" ? (
                    <div className="relative">
                      <div className="dtsc-assistant-markdown">
                        <Streamdown>{message.content || "..."}</Streamdown>
                      </div>
                      {message.content && (
                        <button
                          className="absolute -right-2 -top-2 hidden rounded-lg bg-white p-1 text-slate-500 shadow-md group-hover:block"
                          onClick={() => copyTextToClipboard(message.content)}
                          aria-label="Copier"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    message.content
                  )}
                  {message.createdAt && (
                    <p className={cn("mt-2 text-[0.68rem] font-semibold", message.role === "user" ? "text-white/70" : "text-slate-500")}>
                      {formatRelativeUserDateTime(message.createdAt, userPreferences)}
                    </p>
                  )}
                </div>
                {message.role === "user" && (
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold", participantColor.bgClassName, participantColor.textClassName)}>
                    VO
                  </div>
                )}
              </div>
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

        <form onSubmit={sendMessage} className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
          <p className="mb-2 hidden text-center text-[0.72rem] font-medium text-slate-500 sm:block">
            Le chatbot DTSC peut se tromper. Vérifiez les informations importantes avant toute décision.
          </p>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_4px_20px_rgba(0,43,91,0.05)] sm:gap-3 sm:p-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Écrivez votre demande..."
              className="h-11 border-0 bg-transparent text-slate-900 focus-visible:ring-0"
              disabled={limitReached}
            />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" disabled={!input.trim() || isStreaming || limitReached}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </section>
      <Dialog open={Boolean(error)} title="Message DTSC" onClose={() => setError("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{error}</p>
      </Dialog>
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
    </div>
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

function BotIcon() {
  return <span className="text-sm font-black">AI</span>;
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
