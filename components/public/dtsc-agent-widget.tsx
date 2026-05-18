"use client";

import { useRef, useState, type FormEvent } from "react";
import { Bot, CheckCircle2, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type LeadSnapshot = {
  fullName?: string;
  email?: string;
  organization?: string;
  requestedService?: string;
};

const welcomeMessage =
  "Bonjour 👋 Je suis l'assistant IA de DTSC. Je peux vous aider à comprendre nos services, préciser votre besoin et transmettre votre demande à notre équipe.";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function DtscAgentWidget() {
  const conversationId = useRef(newId());
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([
    { id: "welcome", role: "assistant", content: welcomeMessage },
  ]);
  const [pending, setPending] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [lead, setLead] = useState<LeadSnapshot | null>(null);
  const [newsletterPending, setNewsletterPending] = useState(false);
  const [newsletterDone, setNewsletterDone] = useState(false);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) {
      return;
    }

    const userMessage: AgentMessage = { id: newId(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    const assistantId = newId();
    setMessages(nextMessages);
    setInput("");
    setPending(true);

    try {
      const response = await fetch("/api/public/dtsc-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId.current,
          leadSubmitted,
          messages: nextMessages
            .filter((message) => message.id !== "welcome")
            .map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.body || !contentType.includes("application/x-ndjson")) {
        const body = (await response.json().catch(() => null)) as { reply?: string } | null;
        setMessages((current) => [...current, { id: assistantId, role: "assistant", content: body?.reply || "Je n'ai pas pu répondre correctement. Vous pouvez contacter DTSC via la page Contact." }]);
        return;
      }

      setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const event = JSON.parse(line) as {
            type?: "delta" | "done";
            content?: string;
            leadCreated?: boolean;
            lead?: LeadSnapshot | null;
            newsletterPrompt?: string | null;
          };
          if (event.type === "delta" && event.content) {
            streamedContent += event.content;
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: streamedContent } : message));
          }
          if (event.type === "done") {
            if (event.leadCreated) {
              setLeadSubmitted(true);
              setLead(event.lead || null);
              if (event.newsletterPrompt) {
                setMessages((current) => [...current, { id: newId(), role: "assistant", content: event.newsletterPrompt || "" }]);
              }
            }
          }
        }
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          content: "L'assistant DTSC est momentanément indisponible. Vous pouvez nous écrire via la page Contact.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  async function subscribeNewsletter() {
    if (!lead?.email || !lead.fullName || newsletterPending || newsletterDone) {
      return;
    }
    setNewsletterPending(true);
    const response = await fetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lead.fullName,
        email: lead.email,
        companyName: lead.organization || "",
        interest: lead.requestedService || "Ressources DTSC",
        consent: true,
      }),
    });
    setNewsletterPending(false);
    setNewsletterDone(response.ok);
    setMessages((current) => [
      ...current,
      {
        id: newId(),
        role: "assistant",
        content: response.ok
          ? "Votre inscription aux actualités DTSC est enregistrée."
          : "L'inscription newsletter n'a pas pu être finalisée pour le moment.",
      },
    ]);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[95] sm:bottom-6 sm:right-6">
      {open && (
        <section className="mb-4 flex h-[min(78vh,42rem)] w-[calc(100vw-2rem)] max-w-[25rem] animate-scale-in flex-col overflow-hidden rounded-2xl border border-cyan-300/35 bg-[#071427] text-white shadow-[0_26px_90px_rgba(0,23,54,0.38)]">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#001736] px-4 py-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Assistant IA officiel</p>
              <h2 className="mt-1 text-lg font-black">DTSC Platform</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Fermer l'assistant DTSC">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,#071427,#0b1728)] px-4 py-4">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-[0_12px_30px_rgba(0,0,0,0.18)]",
                    message.role === "user"
                      ? "bg-cyan-400 font-bold text-[#001736]"
                      : "border border-white/10 bg-white/10 text-blue-50"
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-blue-50">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                  Analyse du besoin...
                </div>
              </div>
            )}
          </div>

          {leadSubmitted && lead?.email && !newsletterDone && (
            <div className="border-t border-white/10 bg-[#0b1728] px-4 py-3">
              <Button type="button" onClick={subscribeNewsletter} disabled={newsletterPending} className="w-full rounded-xl bg-emerald-300 text-[#001736] hover:bg-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                {newsletterPending ? "Inscription..." : "Recevoir les actualités DTSC"}
              </Button>
            </div>
          )}

          <form onSubmit={submitMessage} className="border-t border-white/10 bg-[#001736] p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/10 p-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Posez votre question sur DTSC..."
                maxLength={1500}
                rows={1}
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={pending || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-[#001736] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Envoyer le message">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group flex h-14 w-14 items-center justify-center rounded-2xl bg-[#002b5b] text-white shadow-[0_18px_50px_rgba(0,43,91,0.34)] ring-1 ring-cyan-300/35 transition hover:-translate-y-0.5 hover:bg-[#001736]"
        aria-label="Ouvrir l'assistant IA DTSC"
      >
        {open ? <Bot className="h-6 w-6 text-cyan-300" /> : <MessageCircle className="h-6 w-6 text-cyan-300 transition group-hover:scale-105" />}
      </button>
    </div>
  );
}
