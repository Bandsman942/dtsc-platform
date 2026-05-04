"use client";

import { Copy, Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
};

export function ChatWorkspace({
  initialConversations,
  initialConversationId,
}: {
  initialConversations: ConversationSummary[];
  initialConversationId?: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationId || initialConversations[0]?.id || ""
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  async function refreshConversations(nextId?: string) {
    const response = await fetch("/api/conversations");
    const data = await response.json();
    setConversations(data.conversations ?? []);
    if (nextId) {
      setActiveConversationId(nextId);
    }
  }

  async function createConversation() {
    const response = await fetch("/api/conversations", { method: "POST" });
    const data = await response.json();
    await refreshConversations(data.conversation.id);
  }

  async function renameConversation() {
    if (!activeConversation) {
      return;
    }
    const title = window.prompt("Nouveau titre", activeConversation.title);
    if (!title) {
      return;
    }

    await fetch(`/api/conversations/${activeConversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await refreshConversations(activeConversation.id);
  }

  async function deleteConversation() {
    if (!activeConversation || !window.confirm("Supprimer cette conversation ?")) {
      return;
    }

    await fetch(`/api/conversations/${activeConversation.id}`, { method: "DELETE" });
    setMessages([]);
    await refreshConversations();
    setActiveConversationId("");
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
    };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
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
      setError("Le chatbot DTSC est momentanément indisponible.");
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
    await refreshConversations(createdConversationId || activeConversationId);
  }

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="dtsc-card flex flex-col p-4">
        <Button onClick={createConversation} className="h-11 w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <Plus className="h-4 w-4" />
          Nouvelle conversation
        </Button>
        <div className="mt-4 space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setActiveConversationId(conversation.id)}
              className={cn(
                "w-full rounded-xl px-3 py-3 text-left text-sm transition",
                activeConversationId === conversation.id
                  ? "border-l-4 border-cyan-400 bg-slate-100 text-[#001736]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-[#001736]"
              )}
            >
              <span className="block truncate font-medium">{conversation.title}</span>
              <span className="text-xs text-slate-500">
                {conversation._count?.messages ?? 0} messages
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h1 className="text-xl font-bold text-[#001736]">
              {activeConversation?.title || "Assistant DTSC"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#d5e3fd] px-2.5 py-1 text-xs font-bold text-[#002b5b]">Assistant IA DTSC</span>
              <span className="text-xs font-medium text-slate-500">En ligne</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={renameConversation} disabled={!activeConversation}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={deleteConversation} disabled={!activeConversation}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#faf9fe] px-4 py-6 lg:px-8">
          {!messages.length && (
            <div className="mx-auto flex h-full max-w-2xl flex-col justify-center text-center">
              <p className="text-3xl font-bold text-[#001736]">Comment DTSC peut vous aider ?</p>
              <p className="mt-3 leading-7 text-slate-600">
                Décrivez votre besoin en transformation numérique, automatisation, data, application métier ou IA.
              </p>
            </div>
          )}
          <div className="space-y-5">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex gap-3", message.role === "user" && "justify-end")}>
                {message.role === "assistant" && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d5e3fd] text-[#002b5b]">
                    <BotIcon />
                  </div>
                )}
                <div
                  className={cn(
                    "group max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-[0_4px_20px_rgba(0,43,91,0.05)]",
                    message.role === "user"
                      ? "rounded-tr-sm bg-[#002b5b] text-white"
                      : "rounded-tl-sm bg-white text-slate-800"
                  )}
                >
                  {message.role === "assistant" ? (
                    <div className="relative">
                      <Streamdown>{message.content || "..."}</Streamdown>
                      {message.content && (
                        <button
                          className="absolute -right-2 -top-2 hidden rounded-lg bg-white p-1 text-slate-500 shadow-md group-hover:block"
                          onClick={() => navigator.clipboard.writeText(message.content)}
                          aria-label="Copier"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    message.content
                  )}
                </div>
                {message.role === "user" && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[#002b5b] text-xs font-bold">
                    VO
                  </div>
                )}
              </div>
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                DTSC Assistant rédige une réponse...
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <p className="px-4 pb-2 text-sm font-medium text-red-600">{error}</p>}
        <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Écrivez votre demande..."
              className="h-11 border-0 bg-transparent text-slate-900 focus-visible:ring-0"
            />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" disabled={!input.trim() || isStreaming}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BotIcon() {
  return <span className="text-sm font-black">AI</span>;
}
