"use client";

import { Archive, Check, MessageSquare, Pencil, Plus, Send, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";
import { formatRelativeUserDateTime, type UserDatePreferences } from "@/lib/user-format";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string; email: string; avatarUrl?: string | null; jobTitle?: string | null; role: string };
type GroupMember = { id: string; role: string; status: string; userId: string; user: UserOption };
type Group = {
  id: string;
  name: string;
  description?: string | null;
  groupType: string;
  status: string;
  ownerId: string;
  members: GroupMember[];
  invitations: Array<{ id: string; status: string; invitedEmail?: string | null; invitedUser?: { name: string; email: string } | null; invitedBy: { name: string } }>;
  messages: Array<{ id: string; content: string; createdAt: string; author: { name: string } }>;
  _count?: { messages: number; members: number };
};
type Invitation = { id: string; group: { id: string; name: string; description?: string | null }; invitedBy: { name: string }; invitationMessage?: string | null; createdAt: string };
type ConversationOption = { id: string; title: string; updatedAt: string; _count?: { messages: number } };
type GroupMessage = {
  id: string;
  content: string;
  messageType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  authorId: string;
  author: UserOption;
  mentions: Array<{ mentionedUser: { id: string; name: string } }>;
  sharedChatbotConversation?: { id: string; title: string; updatedAt: string } | null;
};

export function CollaboratorsWorkspace({
  currentUserId,
  userPreferences,
  initialGroups,
  initialInvitations,
  users,
  conversations,
}: {
  currentUserId: string;
  userPreferences: UserDatePreferences;
  initialGroups: Group[];
  initialInvitations: Invitation[];
  users: UserOption[];
  conversations: ConversationOption[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [activeGroupId, setActiveGroupId] = useState(initialGroups[0]?.id || "");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [feedback, setFeedback] = useState("");
  const [groupDialog, setGroupDialog] = useState<"create" | "edit" | null>(null);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [editingMessage, setEditingMessage] = useState<GroupMessage | null>(null);
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const activeMember = activeGroup?.members.find((member) => member.userId === currentUserId);
  const canManage = activeMember?.role === "OWNER" || activeMember?.role === "ADMIN";
  const groupList = useSmartList({
    items: groups,
    pageSize: 8,
    getSearchText: (group) => `${group.name} ${group.description || ""} ${group.groupType} ${group.members.map((member) => member.user.name).join(" ")}`,
  });

  async function refresh() {
    const response = await fetch("/api/collaborators/groups");
    const body = await response.json();
    setGroups(body.groups || []);
    setInvitations(body.invitations || []);
  }

  async function loadMessages(groupId: string) {
    if (!groupId) {
      setMessages([]);
      return;
    }
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages`);
    const body = await response.json();
    setMessages(body.messages || []);
  }

  useEffect(() => {
    loadMessages(activeGroupId);
  }, [activeGroupId]);

  async function saveGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endpoint = groupDialog === "edit" && activeGroup ? `/api/collaborators/groups/${activeGroup.id}` : "/api/collaborators/groups";
    const response = await fetch(endpoint, {
      method: groupDialog === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setFeedback(response.ok ? "Groupe enregistré." : "Impossible d'enregistrer le groupe.");
    if (response.ok) {
      setGroupDialog(null);
      await refresh();
    }
  }

  async function archiveOrLeaveGroup() {
    if (!activeGroup) {
      return;
    }
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}`, { method: "DELETE" });
    setFeedback(response.ok ? "Action appliquée au groupe." : "Action impossible.");
    if (response.ok) {
      setActiveGroupId("");
      await refresh();
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    setFeedback(response.ok ? "Invitation envoyée." : "Invitation impossible ou déjà active.");
    if (response.ok) {
      setInviteDialog(false);
      await refresh();
    }
  }

  async function respondToInvitation(id: string, action: "ACCEPT" | "DECLINE") {
    const response = await fetch(`/api/collaborators/invitations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setFeedback(response.ok ? "Invitation mise à jour." : "Impossible de traiter l'invitation.");
    if (response.ok) {
      await refresh();
    }
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="dtsc-card min-w-0 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-dtsc-ink">Groupes</h2>
            <p className="text-sm text-dtsc-muted">Espaces dont vous êtes membre.</p>
          </div>
          <Button type="button" size="icon" onClick={() => setGroupDialog("create")} className="rounded-xl bg-[#002b5b] text-white">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {invitations.length > 0 && (
          <div className="mt-4 space-y-2 rounded-2xl border border-cyan-300 bg-cyan-50 p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#002b5b]">Invitations</p>
            {invitations.map((invitation) => (
              <div key={invitation.id} className="rounded-xl bg-white p-3 text-sm">
                <p className="font-black text-[#001736]">{invitation.group.name}</p>
                <p className="mt-1 text-xs text-slate-600">Par {invitation.invitedBy.name} · {formatRelativeUserDateTime(invitation.createdAt, userPreferences)}</p>
                {invitation.invitationMessage && <p className="mt-2 text-xs text-slate-600">{invitation.invitationMessage}</p>}
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={() => respondToInvitation(invitation.id, "ACCEPT")} className="rounded-lg bg-[#002b5b] text-white"><Check className="h-3.5 w-3.5" /> Accepter</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => respondToInvitation(invitation.id, "DECLINE")} className="rounded-lg"><X className="h-3.5 w-3.5" /> Refuser</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <ListControls
            query={groupList.query}
            onQueryChange={groupList.setQuery}
            page={groupList.page}
            pageCount={groupList.pageCount}
            totalCount={groupList.totalCount}
            filteredCount={groupList.filteredCount}
            placeholder="Rechercher un groupe..."
            onPageChange={groupList.setPage}
          />
        </div>
        <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {groupList.paginatedItems.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroupId(group.id)}
              className={cn("w-full rounded-2xl border p-4 text-left transition", activeGroupId === group.id ? "border-cyan-300 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-page hover:border-cyan-300")}
            >
              <span className="block font-black text-dtsc-ink">{group.name}</span>
              <span className="mt-1 block text-xs text-dtsc-muted">{formatEnumLabel(group.groupType)} · {group._count?.members ?? group.members.length} membres · {group._count?.messages ?? 0} messages</span>
              <span className="mt-2 block truncate text-xs text-dtsc-muted">{group.messages[0]?.content || group.description || "Aucun message récent."}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="dtsc-card flex min-h-[70vh] min-w-0 flex-col overflow-hidden">
        {activeGroup ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-dtsc-border p-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-dtsc-ink">{activeGroup.name}</h2>
                <p className="text-sm text-dtsc-muted">{activeGroup.description || "Groupe collaboratif DTSC."}</p>
                <p className="mt-1 text-xs font-bold text-dtsc-blue">{activeGroup.members.map((member) => member.user.name).join(", ")}</p>
              </div>
              <div className="flex gap-2">
                {canManage && <Button type="button" variant="outline" onClick={() => setInviteDialog(true)} className="rounded-xl"><UserPlus className="h-4 w-4" /> Inviter</Button>}
                <ActionMenu
                  items={[
                    ...(canManage ? [{ key: "edit", label: "Modifier le groupe", icon: Pencil, onSelect: () => setGroupDialog("edit") }] : []),
                    { key: "share", label: "Partager une conversation", icon: MessageSquare, onSelect: () => setShareDialog(true) },
                    { key: "support", label: "Contacter l'équipe DTSC", icon: Send, onSelect: async () => {
                      const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/contact-support`, { method: "POST" });
                      setFeedback(response.ok ? "L'équipe DTSC a été notifiée." : "Impossible de contacter l'équipe DTSC.");
                      if (response.ok) await loadMessages(activeGroup.id);
                    } },
                    { key: "archive", label: canManage ? "Archiver le groupe" : "Quitter le groupe", icon: Archive, destructive: canManage, onSelect: archiveOrLeaveGroup },
                  ]}
                />
              </div>
            </div>
            <MessageThread
              currentUserId={currentUserId}
              userPreferences={userPreferences}
              group={activeGroup}
              messages={messages}
              onChanged={async () => {
                await loadMessages(activeGroup.id);
                await refresh();
              }}
              onEdit={setEditingMessage}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-dtsc-muted">Sélectionnez ou créez un groupe pour commencer.</div>
        )}
      </section>

      <Dialog open={groupDialog !== null} title={groupDialog === "edit" ? "Modifier le groupe" : "Créer un groupe"} onClose={() => setGroupDialog(null)}>
        <form onSubmit={saveGroup} className="space-y-3">
          <Input name="name" defaultValue={groupDialog === "edit" ? activeGroup?.name || "" : ""} placeholder="Nom du groupe" required />
          <textarea name="description" defaultValue={groupDialog === "edit" ? activeGroup?.description || "" : ""} placeholder="Description" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <select name="groupType" defaultValue={groupDialog === "edit" ? activeGroup?.groupType || "PROJECT" : "PROJECT"} className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
            {["COMPANY", "PROJECT", "DTSC_SUPPORT", "INTERNAL", "CLIENT", "OTHER"].map((type) => <option key={type} value={type}>{formatEnumLabel(type)}</option>)}
          </select>
          <Button className="rounded-xl bg-[#002b5b] text-white">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog open={inviteDialog} title="Inviter un collaborateur" onClose={() => setInviteDialog(false)}>
        <form onSubmit={invite} className="space-y-3">
          <select name="invitedUserId" className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
            <option value="">Sélectionner un utilisateur existant</option>
            {users.filter((user) => !activeGroup?.members.some((member) => member.userId === user.id)).map((user) => (
              <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
            ))}
          </select>
          <Input name="invitedEmail" type="email" placeholder="Ou inviter par email" />
          <textarea name="invitationMessage" placeholder="Message d'invitation..." className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <Button className="rounded-xl bg-[#002b5b] text-white">Envoyer l&apos;invitation</Button>
        </form>
      </Dialog>
      <Dialog open={shareDialog} title="Partager une conversation chatbot" onClose={() => setShareDialog(false)}>
        {activeGroup && (
          <ShareConversationForm
            conversations={conversations}
            groupId={activeGroup.id}
            onDone={async (ok) => {
              setFeedback(ok ? "Conversation partagée." : "Partage impossible.");
              if (ok) {
                setShareDialog(false);
                await loadMessages(activeGroup.id);
              }
            }}
          />
        )}
      </Dialog>
      <Dialog open={Boolean(editingMessage)} title="Modifier le message" onClose={() => setEditingMessage(null)}>
        {editingMessage && activeGroup && (
          <MessageEditForm
            message={editingMessage}
            members={activeGroup.members}
            onDone={async (ok) => {
              setFeedback(ok ? "Message modifié." : "Modification impossible.");
              if (ok) {
                setEditingMessage(null);
                await loadMessages(activeGroup.id);
              }
            }}
          />
        )}
      </Dialog>
      <Dialog open={Boolean(feedback)} title="Message DTSC" onClose={() => setFeedback("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{feedback}</p>
      </Dialog>
    </div>
  );
}

function MessageThread({
  currentUserId,
  userPreferences,
  group,
  messages,
  onChanged,
  onEdit,
}: {
  currentUserId: string;
  userPreferences: UserDatePreferences;
  group: Group;
  messages: GroupMessage[];
  onChanged: () => Promise<void>;
  onEdit: (message: GroupMessage) => void;
}) {
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const mentionSuggestions = useMemo(() => {
    const match = content.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) {
      return [];
    }
    const query = match[1].toLowerCase();
    return group.members
      .filter((member) => member.user.name.toLowerCase().includes(query) || member.user.email.toLowerCase().includes(query))
      .slice(0, 6);
  }, [content, group.members]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/collaborators/groups/${group.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentionedUserIds, messageType: "TEXT" }),
    });
    if (response.ok) {
      setContent("");
      setMentionedUserIds([]);
      await onChanged();
    }
  }

  function insertMention(member: GroupMember) {
    setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${member.user.name} `));
    setMentionedUserIds((current) => [...new Set([...current, member.userId])]);
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-dtsc-page p-4">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.authorId === currentUserId ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] rounded-2xl border p-3 text-sm shadow-[0_4px_20px_rgba(0,43,91,0.05)]", message.authorId === currentUserId ? "border-[#002b5b] bg-[#002b5b] text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink")}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-xs font-black">{message.author.name}</p>
                <ActionMenu
                  items={[
                    ...(message.authorId === currentUserId ? [{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => onEdit(message) }] : []),
                    ...(message.authorId === currentUserId ? [{ key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: async () => {
                      await fetch(`/api/collaborators/messages/${message.id}`, { method: "DELETE" });
                      await onChanged();
                    } }] : []),
                  ]}
                />
              </div>
              <p className="whitespace-pre-wrap leading-6">{message.deletedAt ? "Message supprimé." : renderMentions(message.content, message.mentions.map((mention) => mention.mentionedUser.name))}</p>
              {message.sharedChatbotConversation && (
                <a href={`/chat?conversationId=${message.sharedChatbotConversation.id}`} className="mt-2 block rounded-xl bg-white/10 p-3 text-xs font-bold underline underline-offset-4">
                  Conversation chatbot: {message.sharedChatbotConversation.title}
                </a>
              )}
              <p className={cn("mt-2 text-[0.68rem] font-semibold", message.authorId === currentUserId ? "text-white/70" : "text-dtsc-muted")}>
                {formatRelativeUserDateTime(message.createdAt, userPreferences)}{message.status === "EDITED" ? " · modifié" : ""}
              </p>
            </div>
          </div>
        ))}
        {!messages.length && <p className="rounded-xl bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun message dans ce groupe.</p>}
      </div>
      <form onSubmit={sendMessage} className="relative border-t border-dtsc-border p-4">
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-20 left-4 z-20 w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_18px_60px_rgba(0,23,54,0.18)]">
            {mentionSuggestions.map((member) => (
              <button key={member.id} type="button" onClick={() => insertMention(member)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-dtsc-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dtsc-soft font-black text-dtsc-blue">{member.user.name.slice(0, 2).toUpperCase()}</span>
                <span><span className="block font-bold text-dtsc-ink">{member.user.name}</span><span className="text-xs text-dtsc-muted">{member.user.jobTitle || member.user.email}</span></span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <Input value={content} onChange={(event) => setContent(event.target.value)} placeholder="Écrire un message ou mentionner @collaborateur..." className="rounded-xl bg-dtsc-page" required />
          <Button className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /></Button>
        </div>
      </form>
    </>
  );
}

function renderMentions(content: string, names: string[]) {
  if (!names.length) {
    return content;
  }
  return names.reduce((text, name) => text.replaceAll(`@${name}`, `@${name}`), content);
}

function MessageEditForm({ message, members, onDone }: { message: GroupMessage; members: GroupMember[]; onDone: (ok: boolean) => void }) {
  const [content, setContent] = useState(message.content);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mentionedUserIds = members.filter((member) => content.includes(`@${member.user.name}`)).map((member) => member.userId);
    const response = await fetch(`/api/collaborators/messages/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentionedUserIds }),
    });
    onDone(response.ok);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <Button className="rounded-xl bg-[#002b5b] text-white">Enregistrer</Button>
    </form>
  );
}

function ShareConversationForm({ conversations, groupId, onDone }: { conversations: ConversationOption[]; groupId: string; onDone: (ok: boolean) => void }) {
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const conversationId = String(formData.get("conversationId") || "");
    const conversation = conversations.find((item) => item.id === conversationId);
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: String(formData.get("content") || `Conversation partagée: ${conversation?.title || ""}`),
        messageType: "CHATBOT_SHARE",
        sharedChatbotConversationId: conversationId,
        mentionedUserIds: [],
      }),
    });
    onDone(response.ok);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <select name="conversationId" required className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
        <option value="">Choisir une conversation</option>
        {conversations.map((conversation) => (
          <option key={conversation.id} value={conversation.id}>{conversation.title} · {conversation._count?.messages ?? 0} messages</option>
        ))}
      </select>
      <textarea name="content" placeholder="Message d'accompagnement..." className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <Button className="rounded-xl bg-[#002b5b] text-white">Partager</Button>
    </form>
  );
}
