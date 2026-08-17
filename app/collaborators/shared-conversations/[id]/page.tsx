import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Bot, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { assertGroupMemberForSession } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };
type SnapshotMessage = { id?: string; role?: string; content?: string; createdAt?: string };

function messagesFromSnapshot(value: unknown): SnapshotMessage[] {
  if (!value || typeof value !== "object" || !("messages" in value)) return [];
  const messages = (value as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter((item): item is SnapshotMessage => Boolean(item && typeof item === "object" && typeof (item as SnapshotMessage).content === "string"));
}

export default async function SharedConversationSnapshotPage({ params }: Params) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const snapshot = await prisma.collaborationSharedConversation.findFirst({
    where: { id, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      title: true,
      createdAt: true,
      groupId: true,
      snapshotJson: true,
      group: { select: { id: true, name: true } },
      sharedBy: { select: { name: true } },
    },
  });
  if (!snapshot) notFound();
  const member = await assertGroupMemberForSession(snapshot.groupId, session);
  if (!member) notFound();
  const messages = messagesFromSnapshot(snapshot.snapshotJson);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Link href={`/collaborators?groupId=${encodeURIComponent(snapshot.group.id)}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-dtsc-border bg-dtsc-surface text-dtsc-blue" aria-label="Retour aux collaborateurs">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-cyan-600">Copie consultable</p>
          <h1 className="truncate text-xl font-black text-dtsc-ink sm:text-2xl">{snapshot.title}</h1>
          <p className="truncate text-xs font-semibold text-dtsc-muted">Partagée par {snapshot.sharedBy.name} dans {snapshot.group.name}</p>
        </div>
      </div>

      <section className="space-y-3 rounded-3xl border border-dtsc-border bg-dtsc-page p-3 sm:p-5">
        {messages.map((message, index) => {
          const assistant = message.role === "assistant";
          return (
            <article key={message.id || `${index}-${message.createdAt || "message"}`} className={`rounded-2xl border p-4 shadow-sm ${assistant ? "border-cyan-300/60 bg-cyan-50 text-slate-950 dark:bg-cyan-100" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink"}`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em]">
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${assistant ? "bg-cyan-700 text-white" : "bg-dtsc-soft text-dtsc-blue"}`}>
                  {assistant ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                </span>
                {assistant ? "Assistant DTSC" : message.role === "user" ? "Utilisateur" : "Système"}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
            </article>
          );
        })}
        {!messages.length ? <p className="rounded-2xl bg-dtsc-surface p-5 text-sm text-dtsc-muted">Cette copie ne contient aucun message consultable.</p> : null}
      </section>
    </main>
  );
}
