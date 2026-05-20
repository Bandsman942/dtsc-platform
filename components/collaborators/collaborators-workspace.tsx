"use client";

import { Archive, ArrowLeft, Check, Copy, Eye, Mic, MicOff, MessageSquare, Phone, PhoneCall, PhoneOff, Pencil, Plus, Reply, Send, Shield, ShieldOff, Trash2, UserMinus, UserPlus, UserRound, Video, VideoOff, X } from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";
import { getParticipantColor } from "@/lib/participant-colors";
import { formatRelativeUserDateTime, type UserDatePreferences } from "@/lib/user-format";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string; email: string; avatarUrl?: string | null; jobTitle?: string | null; role?: string; lastSeenAt?: string | null };
type GroupMember = { id: string; role: string; status: string; userId: string; joinedAt: string; user: UserOption };
type MentionedUser = { id: string; name: string; email?: string | null; jobTitle?: string | null };
type Group = {
  id: string;
  name: string;
  description?: string | null;
  groupType: string;
  meetingId?: string | null;
  autoCreated?: boolean;
  status: string;
  ownerId: string;
  visibility?: string | null;
  createdAt?: string;
  unreadMentionCount?: number;
  unreadMentionPreview?: string | null;
  lastMentionAt?: string | null;
  members: GroupMember[];
  invitations: Array<{ id: string; status: string; invitedEmail?: string | null; invitedUser?: { name: string; email: string } | null; invitedBy: { name: string } }>;
  messages: Array<{ id: string; content: string; createdAt: string; author: { name: string } }>;
  calls?: GroupCall[];
  _count?: { messages: number; members: number };
};
type GroupCallParticipant = {
  id: string;
  userId: string;
  status: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
};
type GroupCall = {
  id: string;
  groupId: string;
  meetingId?: string | null;
  callType: "AUDIO" | "VIDEO";
  provider: string;
  roomName: string;
  status: string;
  startedById: string;
  startedAt: string;
  endedAt?: string | null;
  participants?: GroupCallParticipant[];
};
type JoinedCall = {
  call: GroupCall;
  token: string;
  livekitUrl: string;
  roomName: string;
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
  replyTo?: { id: string; content: string; createdAt: string; deletedAt?: string | null; author: { id: string; name: string } } | null;
  mentions: Array<{ mentionedUser: MentionedUser }>;
  sharedChatbotConversation?: { id: string; title: string; updatedAt: string } | null;
  sharedConversationSnapshot?: { id: string; title: string; status: string; createdAt: string; deletedAt?: string | null } | null;
};
type MessageReadInfo = {
  messageId: string;
  readBy: Array<{ user: UserOption; readAt: string }>;
  unreadBy: Array<{ user: UserOption }>;
};
type SharedConversationSnapshot = {
  id: string;
  title: string;
  createdAt: string;
  group: { id: string; name: string };
  sharedBy: { id: string; name: string; email: string; avatarUrl?: string | null };
  snapshotJson: {
    messages?: Array<{ id: string; role: string; content: string; createdAt: string }>;
  };
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
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [groupDialog, setGroupDialog] = useState<"create" | "edit" | null>(null);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);
  const [mobileGroupListOpen, setMobileGroupListOpen] = useState(!initialGroups[0]?.id);
  const [mentionedProfile, setMentionedProfile] = useState<MentionedUser | null>(null);
  const [editingMessage, setEditingMessage] = useState<GroupMessage | null>(null);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([]);
  const [sharedSnapshot, setSharedSnapshot] = useState<SharedConversationSnapshot | null>(null);
  const [readInfo, setReadInfo] = useState<MessageReadInfo | null>(null);
  const [joinedCall, setJoinedCall] = useState<JoinedCall | null>(null);
  const [callJoining, setCallJoining] = useState(false);
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const activeMember = activeGroup?.members.find((member) => member.userId === currentUserId);
  const canManage = activeMember?.role === "OWNER" || activeMember?.role === "ADMIN";
  const isGroupOwner = activeMember?.role === "OWNER";
  const activeCall = activeGroup?.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE") || null;
  const availableInviteUsers = useMemo(() => {
    const activeMemberIds = new Set(activeGroup?.members.map((member) => member.userId) || []);
    const pendingInviteUserEmails = new Set(activeGroup?.invitations.flatMap((invitation) => [invitation.invitedUser?.email, invitation.invitedEmail]).filter(Boolean) || []);
    const queryTokens = normalizeSearchText(inviteSearch).split(/\s+/).filter(Boolean);
    return users
      .filter((user) => !activeMemberIds.has(user.id) && !pendingInviteUserEmails.has(user.email))
      .map((user) => ({
        user,
        searchable: normalizeSearchText(`${user.name} ${user.email} ${user.jobTitle || ""} ${user.role}`),
      }))
      .filter(({ user, searchable }) => selectedInviteUserIds.includes(user.id) || !queryTokens.length || queryTokens.every((token) => searchable.includes(token)))
      .sort((left, right) => {
        const leftSelected = selectedInviteUserIds.includes(left.user.id);
        const rightSelected = selectedInviteUserIds.includes(right.user.id);
        if (leftSelected !== rightSelected) {
          return leftSelected ? -1 : 1;
        }
        return inviteSearchScore(right.searchable, queryTokens) - inviteSearchScore(left.searchable, queryTokens);
      })
      .map(({ user }) => user)
      .slice(0, 80);
  }, [activeGroup?.invitations, activeGroup?.members, inviteSearch, selectedInviteUserIds, users]);
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

  async function loadMessages(groupId: string, cursor?: string | null) {
    if (!groupId) {
      setMessages([]);
      setMessagesCursor(null);
      setHasOlderMessages(false);
      return;
    }
    if (cursor) {
      setIsLoadingOlderMessages(true);
    }
    const query = new URLSearchParams({ limit: "30" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages?${query.toString()}`);
    const body = await response.json();
    const nextMessages = body.messages || [];
    setMessages((current) => (cursor ? [...nextMessages, ...current] : nextMessages));
    setMessagesCursor(body.nextCursor || null);
    setHasOlderMessages(Boolean(body.hasMore));
    setIsLoadingOlderMessages(false);
    if (!cursor) {
      await fetch(`/api/collaborators/groups/${groupId}/mentions/read`, { method: "POST" }).catch(() => null);
      setGroups((current) => current.map((group) => group.id === groupId ? { ...group, unreadMentionCount: 0, unreadMentionPreview: null, lastMentionAt: null } : group));
    }
  }

  useEffect(() => {
    loadMessages(activeGroupId);
  }, [activeGroupId]);

  async function openSharedSnapshot(snapshotId: string) {
    const response = await fetch(`/api/collaborators/shared-conversations/${snapshotId}`);
    const body = await response.json().catch(() => null);
    if (response.ok && body?.snapshot) {
      setSharedSnapshot(body.snapshot);
    } else {
      setFeedback(body?.message || "Conversation partagée indisponible.");
    }
  }

  async function openReadInfo(messageId: string) {
    const response = await fetch(`/api/collaborators/messages/${messageId}/reads`);
    const body = await response.json().catch(() => null) as Omit<MessageReadInfo, "messageId"> & { message?: string } | null;
    if (response.ok && body) {
      setReadInfo({ messageId, readBy: body.readBy || [], unreadBy: body.unreadBy || [] });
    } else {
      setFeedback(body?.message || "Infos de lecture indisponibles.");
    }
  }

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
      body: JSON.stringify({
        invitedUserIds: selectedInviteUserIds,
        invitedEmails: String(formData.get("invitedEmails") || ""),
        invitationMessage: String(formData.get("invitationMessage") || ""),
        expiresAt: String(formData.get("expiresAt") || ""),
      }),
    });
    const body = await response.json().catch(() => null);
    setFeedback(response.ok ? `${body?.invitationCount || selectedInviteUserIds.length || 1} invitation(s) envoyée(s).` : body?.message || "Invitation impossible ou déjà active.");
    if (response.ok) {
      closeInviteDialog();
      await refresh();
    }
  }

  function closeInviteDialog() {
    setInviteDialog(false);
    setInviteSearch("");
    setSelectedInviteUserIds([]);
  }

  function toggleInviteUser(userId: string) {
    setSelectedInviteUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  async function startGroupCall(callType: "AUDIO" | "VIDEO") {
    if (!activeGroup) {
      return;
    }
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callType, meetingId: "" }),
    });
    const body = await response.json().catch(() => null) as { call?: GroupCall; activeCall?: GroupCall; message?: string } | null;
    if (!response.ok) {
      setFeedback(body?.message || "Impossible de démarrer l'appel.");
      return;
    }
    const nextCall = body?.call || body?.activeCall;
    setFeedback(callType === "VIDEO" ? "Appel vidéo démarré." : "Appel audio démarré.");
    await refresh();
    if (nextCall) {
      await joinGroupCall(nextCall);
    }
    await loadMessages(activeGroup.id);
  }

  async function joinGroupCall(call: GroupCall) {
    setCallJoining(true);
    const response = await fetch(`/api/collaborators/calls/${call.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ microphoneEnabled: true, cameraEnabled: call.callType === "VIDEO" }),
    });
    const body = await response.json().catch(() => null) as { token?: string; livekitUrl?: string; roomName?: string; message?: string } | null;
    setCallJoining(false);
    if (!response.ok || !body?.token || !body.livekitUrl || !body.roomName) {
      setFeedback(body?.message || "Impossible de rejoindre l'appel.");
      return;
    }
    setJoinedCall({ call, token: body.token, livekitUrl: body.livekitUrl, roomName: body.roomName });
    setFeedback("Accès à l'appel généré.");
    await refresh();
    if (activeGroup) {
      await loadMessages(activeGroup.id);
    }
  }

  async function leaveJoinedCall() {
    if (!joinedCall) {
      return;
    }
    await fetch(`/api/collaborators/calls/${joinedCall.call.id}/leave`, { method: "POST" }).catch(() => null);
    setJoinedCall(null);
    await refresh();
    if (activeGroup) {
      await loadMessages(activeGroup.id);
    }
  }

  async function endGroupCall(call: GroupCall) {
    const response = await fetch(`/api/collaborators/calls/${call.id}/end`, { method: "POST" });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setFeedback(response.ok ? "Appel terminé." : body?.message || "Impossible de terminer l'appel.");
    if (response.ok) {
      setJoinedCall(null);
      await refresh();
      if (activeGroup) {
        await loadMessages(activeGroup.id);
      }
    }
  }

  async function createMentionGroup(user: MentionedUser) {
    const response = await fetch("/api/collaborators/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Discussion avec ${user.name}`,
        description: `Groupe créé depuis une mention @${user.name}.`,
        groupType: "INTERNAL",
        visibility: "PRIVATE",
      }),
    });
    const body = await response.json().catch(() => null) as { group?: { id: string } } | null;
    if (!response.ok || !body?.group?.id) {
      setFeedback("Impossible de créer le groupe depuis cette mention.");
      return;
    }
    const invitation = await fetch(`/api/collaborators/groups/${body.group.id}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitedUserIds: [user.id], invitationMessage: `Invitation créée depuis votre mention @${user.name}.` }),
    });
    setFeedback(invitation.ok ? "Groupe créé et invitation envoyée." : "Groupe créé, mais l'invitation n'a pas pu être envoyée.");
    await refresh();
    setActiveGroupId(body.group.id);
    setMobileGroupListOpen(false);
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
    <div className="grid h-[calc(100dvh-8rem)] min-w-0 gap-5 overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className={cn("dtsc-card h-full min-h-0 min-w-0 flex-col overflow-hidden p-4", activeGroup && !mobileGroupListOpen ? "hidden xl:flex" : "flex")}>
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
        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {groupList.paginatedItems.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                setActiveGroupId(group.id);
                setMobileGroupListOpen(false);
              }}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition",
                group.unreadMentionCount ? "border-cyan-300 bg-cyan-400/10 shadow-[0_14px_40px_rgba(0,186,217,0.12)]" : activeGroupId === group.id ? "border-cyan-300 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-page hover:border-cyan-300"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-black text-dtsc-ink">{group.name}</span>
                {Boolean(group.unreadMentionCount) && <span className="shrink-0 rounded-full bg-cyan-300 px-2 py-0.5 text-[0.68rem] font-black text-[#001736]">@ {group.unreadMentionCount}</span>}
              </span>
              <span className="mt-1 block text-xs text-dtsc-muted">{formatEnumLabel(group.groupType)} · {group._count?.members ?? group.members.length} membres · {group._count?.messages ?? 0} messages</span>
              <span className={cn("mt-2 block truncate text-xs", group.unreadMentionCount ? "font-bold text-cyan-600" : "text-dtsc-muted")}>{group.unreadMentionPreview || group.messages[0]?.content || group.description || "Aucun message récent."}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className={cn("dtsc-card h-full min-h-0 min-w-0 flex-col overflow-hidden", activeGroup && mobileGroupListOpen ? "hidden xl:flex" : "flex")}>
        {activeGroup ? (
          <>
            <div className="shrink-0 border-b border-dtsc-border p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" size="icon" onClick={() => setMobileGroupListOpen(true)} className="shrink-0 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue xl:hidden">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setGroupDetailsOpen(true)}
                  className="min-w-0 flex-1 rounded-2xl p-2 text-left transition hover:bg-dtsc-soft focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  aria-label={`Voir les détails du groupe ${activeGroup.name}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 text-sm font-black text-cyan-500">
                      {activeGroup.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-black text-dtsc-ink sm:text-2xl">{activeGroup.name}</h2>
                      <p className="truncate text-xs font-bold text-dtsc-muted">{activeGroup.members.length} membre(s) · {formatEnumLabel(activeGroup.status)} · Détails au clic</p>
                    </div>
                  </div>
                </button>
                <div className="flex gap-2">
                  {activeCall ? (
                    <Button type="button" onClick={() => joinGroupCall(activeCall)} disabled={callJoining} className="rounded-xl bg-cyan-500 text-[#001736] hover:bg-cyan-300">
                      <PhoneCall className="h-4 w-4" />
                      Rejoindre l&apos;appel
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => startGroupCall("AUDIO")} className="hidden rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue sm:inline-flex">
                        <Phone className="h-4 w-4" />
                        Audio
                      </Button>
                      <Button type="button" variant="outline" onClick={() => startGroupCall("VIDEO")} className="hidden rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue sm:inline-flex">
                        <Video className="h-4 w-4" />
                        Vidéo
                      </Button>
                    </>
                  )}
                  {canManage && <Button type="button" variant="outline" onClick={() => setInviteDialog(true)} className="rounded-xl"><UserPlus className="h-4 w-4" /> Inviter</Button>}
                  <ActionMenu
                    items={[
                      ...(activeCall
                        ? [
                            { key: "join-call", label: "Rejoindre l'appel", icon: PhoneCall, onSelect: () => joinGroupCall(activeCall) },
                            { key: "end-call", label: "Terminer l'appel", icon: PhoneOff, destructive: true, onSelect: () => endGroupCall(activeCall) },
                          ]
                        : [
                            { key: "start-audio", label: "Démarrer un appel audio", icon: Phone, onSelect: () => startGroupCall("AUDIO") },
                            { key: "start-video", label: "Démarrer un appel vidéo", icon: Video, onSelect: () => startGroupCall("VIDEO") },
                          ]),
                      ...(canManage ? [{ key: "edit", label: "Modifier le groupe", icon: Pencil, onSelect: () => setGroupDialog("edit") }] : []),
                      { key: "share", label: "Partager une conversation", icon: MessageSquare, onSelect: () => setShareDialog(true) },
                      { key: "support", label: "Contacter l'équipe DTSC", icon: Send, onSelect: async () => {
                        const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/contact-support`, { method: "POST" });
                        setFeedback(response.ok ? "L'équipe DTSC a été notifiée." : "Impossible de contacter l'équipe DTSC.");
                        if (response.ok) await loadMessages(activeGroup.id);
                      } },
                      ...(isGroupOwner
                        ? [{ key: "delete-group", label: "Supprimer le groupe", icon: Trash2, destructive: true, onSelect: archiveOrLeaveGroup }]
                        : [{ key: "leave-group", label: "Quitter le groupe", icon: Archive, onSelect: archiveOrLeaveGroup }]),
                    ]}
                  />
                </div>
              </div>
            </div>
            {activeCall && (
              <div className="border-b border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-200">
                Appel en cours · {activeCall.callType === "VIDEO" ? "vidéo" : "audio"} · {activeCall.participants?.filter((participant) => participant.status === "JOINED").length || 0} participant(s) connecté(s)
              </div>
            )}
            {activeGroup.groupType === "MEETING" && (
              <div className="border-b border-dtsc-border bg-dtsc-surface px-4 py-3">
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-[#001736] dark:border-cyan-400/40 dark:bg-[#08223a] dark:text-cyan-50">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Réunion COO liée</p>
                  <p className="mt-1 font-black">{activeGroup.name}</p>
                  <p className="mt-1 text-xs opacity-80">Préparation, discussion, appel, compte rendu et décisions restent attachés à ce groupe de réunion.</p>
                  {activeCall ? (
                    <Button type="button" size="sm" onClick={() => joinGroupCall(activeCall)} className="mt-3 rounded-xl bg-cyan-500 text-[#001736] hover:bg-cyan-300">
                      <PhoneCall className="h-4 w-4" />
                      Rejoindre l&apos;appel
                    </Button>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startGroupCall("AUDIO")} className="rounded-xl border-cyan-300 bg-white text-[#002b5b]">
                        <Phone className="h-4 w-4" />
                        Démarrer audio
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => startGroupCall("VIDEO")} className="rounded-xl border-cyan-300 bg-white text-[#002b5b]">
                        <Video className="h-4 w-4" />
                        Démarrer vidéo
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <MessageThread
              key={activeGroup.id}
              currentUserId={currentUserId}
              userPreferences={userPreferences}
              group={activeGroup}
              messages={messages}
              onChanged={async () => {
                await loadMessages(activeGroup.id);
                await refresh();
              }}
              hasOlderMessages={hasOlderMessages}
              isLoadingOlderMessages={isLoadingOlderMessages}
              onLoadOlder={() => loadMessages(activeGroup.id, messagesCursor)}
              onOpenSharedSnapshot={openSharedSnapshot}
              onOpenReadInfo={openReadInfo}
              onEdit={setEditingMessage}
              onMentionProfile={setMentionedProfile}
              onCreateMentionGroup={createMentionGroup}
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
      <Dialog open={inviteDialog} title="Inviter des collaborateurs" onClose={closeInviteDialog}>
        <form onSubmit={invite} className="space-y-3">
          <Input value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} placeholder="Recherche intelligente: nom, email, poste ou rôle..." />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedInviteUserIds((current) => [...new Set([...current, ...availableInviteUsers.map((user) => user.id)])])}
              className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"
              disabled={!availableInviteUsers.length}
            >
              Tout sélectionner
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedInviteUserIds([])}
              className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"
              disabled={!selectedInviteUserIds.length}
            >
              Réinitialiser
            </Button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            {availableInviteUsers.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-dtsc-surface px-3 py-2 text-sm text-dtsc-muted transition hover:bg-dtsc-soft">
                <input
                  type="checkbox"
                  checked={selectedInviteUserIds.includes(user.id)}
                  onChange={() => toggleInviteUser(user.id)}
                  className="h-4 w-4 shrink-0 accent-cyan-500"
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dtsc-soft text-xs font-black text-dtsc-blue">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-dtsc-ink">{user.name}</span>
                  <span className="block truncate text-xs">{user.jobTitle || user.role} · {user.email}</span>
                </span>
              </label>
            ))}
            {!availableInviteUsers.length && (
              <p className="rounded-xl bg-dtsc-surface p-3 text-sm text-dtsc-muted">Aucun utilisateur disponible avec ce filtre.</p>
            )}
          </div>
          <p className="text-xs font-bold text-dtsc-blue">
            {selectedInviteUserIds.length} utilisateur(s) sélectionné(s) · {availableInviteUsers.length} résultat(s) affiché(s).
          </p>
          <textarea name="invitedEmails" placeholder="Emails externes ou non inscrits, séparés par virgule ou ligne..." className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <Input name="expiresAt" type="date" />
          <textarea name="invitationMessage" placeholder="Message d'invitation..." className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <Button className="rounded-xl bg-[#002b5b] text-white">Envoyer les invitations</Button>
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
      <Dialog open={groupDetailsOpen} title="Détails du groupe" onClose={() => setGroupDetailsOpen(false)}>
        {activeGroup && (
          <GroupDetailsDialog
            group={activeGroup}
            currentUserId={currentUserId}
            userPreferences={userPreferences}
            onChanged={async () => {
              await refresh();
              if (activeGroup) {
                await loadMessages(activeGroup.id);
              }
            }}
            onFeedback={setFeedback}
          />
        )}
      </Dialog>
      <Dialog open={Boolean(readInfo)} title="Infos de lecture" onClose={() => setReadInfo(null)}>
        {readInfo && <ReadInfoPanel info={readInfo} userPreferences={userPreferences} />}
      </Dialog>
      <Dialog open={Boolean(joinedCall)} title={joinedCall?.call.callType === "VIDEO" ? "Appel vidéo DTSC" : "Appel audio DTSC"} onClose={() => { void leaveJoinedCall(); }} className="max-w-4xl">
        {joinedCall && (
          <GroupCallRoom
            joinedCall={joinedCall}
            group={activeGroup}
            onLeave={leaveJoinedCall}
            onEnd={() => endGroupCall(joinedCall.call)}
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
      <Dialog open={Boolean(sharedSnapshot)} title={sharedSnapshot?.title || "Conversation partagée"} onClose={() => setSharedSnapshot(null)}>
        {sharedSnapshot && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 text-sm text-slate-700 shadow-[0_14px_40px_rgba(0,43,91,0.08)] dark:border-cyan-400/40 dark:from-[#08223a] dark:to-[#071427] dark:text-slate-200">
              <p className="font-black text-slate-950 dark:text-white">{sharedSnapshot.title}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Partagée par {sharedSnapshot.sharedBy.name} dans {sharedSnapshot.group.name} · {formatRelativeUserDateTime(sharedSnapshot.createdAt, userPreferences)}
              </p>
            </div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {(sharedSnapshot.snapshotJson.messages || []).map((message) => {
                const color = getParticipantColor(message.role);
                const isAssistant = message.role === "assistant";
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-2xl border p-4 text-sm shadow-[0_10px_34px_rgba(0,23,54,0.10)]",
                      isAssistant && "border-cyan-300 bg-[#f7fcff] text-slate-900 dark:border-cyan-300/70 dark:bg-[#eaf6ff] dark:text-[#06111f]",
                      isUser && "border-slate-200 bg-white text-slate-900 dark:border-cyan-500/35 dark:bg-[#071427] dark:text-slate-100",
                      !isAssistant && !isUser && "border-amber-200 bg-amber-50 text-slate-900 dark:border-amber-300/60 dark:bg-[#fff7df] dark:text-[#1f2937]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black",
                            isAssistant ? "bg-cyan-600 text-white dark:bg-[#003b5c]" : isUser ? color.bgClassName : "bg-amber-200 text-amber-900"
                          )}
                        >
                          {isAssistant ? "AI" : isUser ? "UT" : "SY"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black uppercase tracking-[0.12em]" style={{ color: isAssistant ? "#0e7490" : color.hex }}>
                            {isAssistant ? "Assistant DTSC" : isUser ? "Utilisateur" : "Système"}
                          </p>
                          <p className={cn("text-[0.68rem] font-semibold", isAssistant ? "text-slate-500 dark:text-slate-700" : "text-slate-500 dark:text-slate-300")}>
                            {formatRelativeUserDateTime(message.createdAt, userPreferences)}
                          </p>
                        </div>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em]", isAssistant ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-200 dark:text-cyan-950" : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100")}>
                        Copie
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-3 whitespace-pre-wrap leading-7",
                        isAssistant && "!text-slate-950 dark:!text-slate-950",
                        isUser && "text-slate-900 dark:text-slate-100",
                        !isAssistant && !isUser && "text-slate-900 dark:text-slate-900"
                      )}
                      style={isAssistant ? { color: "#0f172a" } : undefined}
                    >
                      {message.content}
                    </p>
                  </div>
                );
              })}
              {!sharedSnapshot.snapshotJson.messages?.length && (
                <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Cette copie ne contient aucun message consultable.</p>
              )}
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={Boolean(mentionedProfile)} title="Profil collaborateur" onClose={() => setMentionedProfile(null)}>
        {mentionedProfile && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-cyan-600">Mention</p>
              <h3 className="mt-2 text-2xl font-black text-dtsc-ink">{mentionedProfile.name}</h3>
              {mentionedProfile.jobTitle && <p className="mt-1 text-sm font-bold text-dtsc-muted">{mentionedProfile.jobTitle}</p>}
              {mentionedProfile.email && <p className="mt-1 text-sm text-dtsc-muted">{mentionedProfile.email}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => { void createMentionGroup(mentionedProfile); }} className="rounded-xl bg-[#002b5b] text-white"><UserPlus className="h-4 w-4" /> Créer un groupe</Button>
              <Button type="button" variant="outline" onClick={() => copyText(mentionedProfile.name)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Copy className="h-4 w-4" /> Copier le nom</Button>
            </div>
          </div>
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
  hasOlderMessages,
  isLoadingOlderMessages,
  onLoadOlder,
  onOpenSharedSnapshot,
  onOpenReadInfo,
  onChanged,
  onEdit,
  onMentionProfile,
  onCreateMentionGroup,
}: {
  currentUserId: string;
  userPreferences: UserDatePreferences;
  group: Group;
  messages: GroupMessage[];
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  onLoadOlder: () => void;
  onOpenSharedSnapshot: (snapshotId: string) => void;
  onOpenReadInfo: (messageId: string) => void;
  onChanged: () => Promise<void>;
  onEdit: (message: GroupMessage) => void;
  onMentionProfile: (user: MentionedUser) => void;
  onCreateMentionGroup: (user: MentionedUser) => void;
}) {
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const previousGroupIdRef = useRef(group.id);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;
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
      body: JSON.stringify({ content, mentionedUserIds, messageType: "TEXT", replyToId: replyTo?.id || "" }),
    });
    if (response.ok) {
      setContent("");
      setMentionedUserIds([]);
      setReplyTo(null);
      await onChanged();
    }
  }

  function insertMention(member: GroupMember) {
    setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${member.user.name} `));
    setMentionedUserIds((current) => [...new Set([...current, member.userId])]);
  }

  useEffect(() => {
    const groupChanged = previousGroupIdRef.current !== group.id;
    const lastMessageChanged = previousLastMessageIdRef.current !== lastMessageId;
    previousGroupIdRef.current = group.id;
    previousLastMessageIdRef.current = lastMessageId;

    if (!groupChanged && !lastMessageChanged) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const messageList = messageListRef.current;
      if (messageList) {
        messageList.scrollTop = messageList.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [group.id, lastMessageId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={messageListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-dtsc-page p-4">
        {hasOlderMessages && (
          <div className="flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={onLoadOlder} disabled={isLoadingOlderMessages} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              {isLoadingOlderMessages ? "Chargement..." : "Charger les anciens messages"}
            </Button>
          </div>
        )}
        {messages.map((message) => (
          <GroupMessageBubble
            key={message.id}
            message={message}
            currentUserId={currentUserId}
            userPreferences={userPreferences}
            onChanged={onChanged}
            onEdit={onEdit}
            onOpenSharedSnapshot={onOpenSharedSnapshot}
            onOpenReadInfo={onOpenReadInfo}
            onReply={setReplyTo}
            onMentionProfile={onMentionProfile}
            onCreateMentionGroup={onCreateMentionGroup}
          />
        ))}
        {!messages.length && <p className="rounded-xl bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun message dans ce groupe.</p>}
      </div>
      <form onSubmit={sendMessage} className="relative shrink-0 border-t border-dtsc-border p-4">
        {replyTo && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-[#001736] dark:border-cyan-400/40 dark:bg-[#08223a] dark:text-cyan-50">
            <div className="min-w-0">
              <p className="font-black">Réponse à {replyTo.author.name}</p>
              <p className="mt-1 line-clamp-2 text-xs opacity-80">{replyTo.deletedAt ? "Message supprimé." : replyTo.content}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} className="rounded-lg p-1 text-dtsc-blue hover:bg-white/40" aria-label="Annuler la réponse">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-20 left-4 z-20 w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_18px_60px_rgba(0,23,54,0.18)]">
            {mentionSuggestions.map((member) => {
              const color = getParticipantColor(member.userId);
              return (
                <button key={member.id} type="button" onClick={() => insertMention(member)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-dtsc-soft">
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-full font-black", color.bgClassName, color.textClassName)}>{member.user.name.slice(0, 2).toUpperCase()}</span>
                  <span><span className="block font-bold text-dtsc-ink">{member.user.name}</span><span className="text-xs text-dtsc-muted">{member.user.jobTitle || member.user.email}</span></span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-3">
          <Input value={content} onChange={(event) => setContent(event.target.value)} placeholder="Écrire un message ou mentionner @collaborateur..." className="rounded-xl bg-dtsc-page" required />
          <Button className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /></Button>
        </div>
      </form>
    </div>
  );
}

function GroupMessageBubble({
  message,
  currentUserId,
  userPreferences,
  onChanged,
  onEdit,
  onOpenSharedSnapshot,
  onOpenReadInfo,
  onReply,
  onMentionProfile,
  onCreateMentionGroup,
}: {
  message: GroupMessage;
  currentUserId: string;
  userPreferences: UserDatePreferences;
  onChanged: () => Promise<void>;
  onEdit: (message: GroupMessage) => void;
  onOpenSharedSnapshot: (snapshotId: string) => void;
  onOpenReadInfo: (messageId: string) => void;
  onReply: (message: GroupMessage) => void;
  onMentionProfile: (user: MentionedUser) => void;
  onCreateMentionGroup: (user: MentionedUser) => void;
}) {
  const participantColor = getParticipantColor(message.authorId || message.author.email);
  if (message.messageType === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[92%] rounded-full border border-dtsc-border bg-dtsc-soft px-4 py-2 text-center text-xs font-bold text-dtsc-muted">
          {message.content}
          <span className="ml-2 font-semibold opacity-70">{formatRelativeUserDateTime(message.createdAt, userPreferences)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex", message.authorId === currentUserId ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[88%] gap-2", message.authorId === currentUserId && "flex-row-reverse")}>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-black", participantColor.bgClassName, participantColor.textClassName, participantColor.borderClassName)}>
          {message.author.name.slice(0, 2).toUpperCase()}
        </span>
        <div className={cn("min-w-0 rounded-2xl border p-3 text-sm shadow-[0_4px_20px_rgba(0,43,91,0.05)]", message.authorId === currentUserId ? "border-[#002b5b] bg-[#002b5b] text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink")}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs font-black" style={{ color: message.authorId === currentUserId ? "#a5f3fc" : participantColor.hex }}>{message.author.name}</p>
            <ActionMenu
              items={[
                { key: "reply", label: "Répondre", icon: Reply, onSelect: () => onReply(message) },
                { key: "reads", label: "Infos de lecture", icon: Eye, onSelect: () => onOpenReadInfo(message.id) },
                { key: "copy", label: "Copier le texte", icon: Copy, onSelect: () => copyText(message.content) },
                ...(message.authorId === currentUserId ? [{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => onEdit(message) }] : []),
                ...(message.authorId === currentUserId ? [{ key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: async () => {
                  await fetch(`/api/collaborators/messages/${message.id}`, { method: "DELETE" });
                  await onChanged();
                } }] : []),
              ]}
            />
          </div>
          {message.replyTo && !message.deletedAt && (
            <button type="button" className={cn("mb-2 block w-full rounded-xl border-l-4 p-3 text-left text-xs", message.authorId === currentUserId ? "border-cyan-200 bg-white/10 text-white/85" : "border-cyan-300 bg-dtsc-page text-dtsc-muted")}>
              <span className="block font-black">{message.replyTo.author.name}</span>
              <span className="mt-1 line-clamp-2 block">{message.replyTo.deletedAt ? "Message supprimé." : message.replyTo.content}</span>
            </button>
          )}
          <p className="whitespace-pre-wrap leading-6">
            {message.deletedAt ? "Message supprimé." : (
              <MentionText
                content={message.content}
                mentions={message.mentions.map((mention) => mention.mentionedUser)}
                onProfile={onMentionProfile}
                onCreateGroup={onCreateMentionGroup}
              />
            )}
          </p>
          {message.sharedConversationSnapshot && !message.deletedAt && (
            <button
              type="button"
              onClick={() => onOpenSharedSnapshot(message.sharedConversationSnapshot?.id || "")}
              className={cn(
                "mt-3 block w-full rounded-xl border p-3 text-left text-xs font-bold shadow-[0_10px_26px_rgba(0,23,54,0.10)] transition hover:-translate-y-0.5 hover:border-cyan-300",
                message.authorId === currentUserId
                  ? "border-white/30 bg-white text-[#001736] dark:border-cyan-300/60 dark:bg-[#eaf6ff] dark:text-[#06111f]"
                  : "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white text-[#002b5b] dark:border-cyan-400/40 dark:from-[#0b2742] dark:to-[#071427] dark:text-cyan-100"
              )}
            >
              <span className="block text-[0.68rem] uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Conversation chatbot partagée</span>
              <span className="mt-1 block">{message.sharedConversationSnapshot.title}</span>
              <span className="mt-2 inline-flex rounded-full bg-cyan-100 px-2.5 py-1 text-[0.68rem] font-black text-cyan-900 dark:bg-cyan-300 dark:text-cyan-950">Voir la copie consultable</span>
            </button>
          )}
          <p className={cn("mt-2 text-[0.68rem] font-semibold", message.authorId === currentUserId ? "text-white/70" : "text-dtsc-muted")}>
            {formatRelativeUserDateTime(message.createdAt, userPreferences)}{message.status === "EDITED" ? " · modifié" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function GroupDetailsDialog({
  group,
  currentUserId,
  userPreferences,
  onChanged,
  onFeedback,
}: {
  group: Group;
  currentUserId: string;
  userPreferences: UserDatePreferences;
  onChanged: () => Promise<void>;
  onFeedback: (message: string) => void;
}) {
  const owner = group.members.find((member) => member.userId === group.ownerId);
  const activeMembers = group.members.filter((member) => member.status === "ACTIVE");
  const pendingInvitations = group.invitations.filter((invitation) => invitation.status === "PENDING");
  const currentMember = group.members.find((member) => member.userId === currentUserId);
  const canManageMembers = currentMember?.role === "OWNER";

  async function updateMember(member: GroupMember, action: "PROMOTE_ADMIN" | "DEMOTE_ADMIN" | "REMOVE") {
    const response = await fetch(`/api/collaborators/groups/${group.id}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    onFeedback(response.ok ? "Gestion du membre appliquée." : body?.message || "Action membre impossible.");
    if (response.ok) {
      await onChanged();
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-slate-50 p-5 shadow-[0_18px_50px_rgba(0,43,91,0.10)] dark:border-cyan-400/40 dark:from-[#08223a] dark:via-[#071427] dark:to-[#0b1728]">
        <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">{formatEnumLabel(group.groupType)}</p>
        <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{group.name}</h3>
        <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{group.description || "Aucune description renseignée pour ce groupe."}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <GroupDetailMetric label="Membres actifs" value={String(activeMembers.length)} />
          <GroupDetailMetric label="Messages" value={String(group._count?.messages ?? group.messages.length)} />
          <GroupDetailMetric label="Statut" value={formatEnumLabel(group.status)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <GroupInfoLine label="Propriétaire" value={owner?.user.name || "Non renseigné"} />
        <GroupInfoLine label="Visibilité" value={formatEnumLabel(group.visibility || "PRIVATE")} />
        <GroupInfoLine label="Rôle actuel" value={formatEnumLabel(group.members.find((member) => member.userId === currentUserId)?.role || "MEMBER")} />
        <GroupInfoLine label="Créé le" value={group.createdAt ? formatRelativeUserDateTime(group.createdAt, userPreferences) : "Non renseigné"} />
        <GroupInfoLine label="Invitations en attente" value={String(pendingInvitations.length)} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="font-black text-dtsc-ink">Membres du groupe</h4>
          <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900 dark:bg-cyan-300 dark:text-cyan-950">{activeMembers.length} membre(s)</span>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-2 pr-1">
          {activeMembers.map((member) => {
            const color = getParticipantColor(member.userId);
            const online = isUserOnline(member.user.lastSeenAt);
            return (
              <div key={member.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-black", color.bgClassName, color.textClassName)}>
                    {member.user.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-black text-dtsc-ink">{member.user.name}</p>
                    <p className="truncate text-xs text-dtsc-muted">{member.user.jobTitle || member.user.email}</p>
                    <p className={cn("mt-1 flex items-center gap-1 text-[0.68rem] font-black", online ? "text-emerald-600" : "text-red-500")}>
                      <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-500" : "bg-red-500")} />
                      {online ? "En ligne" : "Hors ligne"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                  <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.1em]", member.role === "OWNER" ? "bg-cyan-100 text-cyan-900" : member.role === "ADMIN" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700")}>
                    {formatEnumLabel(member.role)}
                  </span>
                  <p className="mt-1 text-[0.68rem] font-semibold text-dtsc-muted">{formatRelativeUserDateTime(member.joinedAt, userPreferences)}</p>
                  </div>
                  {canManageMembers && member.userId !== group.ownerId && (
                    <ActionMenu
                      items={[
                        member.role === "ADMIN"
                          ? { key: "demote", label: "Retirer le rôle admin", icon: ShieldOff, onSelect: () => { void updateMember(member, "DEMOTE_ADMIN"); } }
                          : { key: "promote", label: "Nommer admin", icon: Shield, onSelect: () => { void updateMember(member, "PROMOTE_ADMIN"); } },
                        { key: "remove", label: "Retirer du groupe", icon: UserMinus, destructive: true, onSelect: () => { void updateMember(member, "REMOVE"); } },
                      ]}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {pendingInvitations.length > 0 && (
        <section>
          <h4 className="mb-3 font-black text-dtsc-ink">Invitations en attente</h4>
          <div className="space-y-2 rounded-2xl border border-dtsc-border bg-dtsc-page p-2">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="rounded-xl bg-dtsc-surface p-3 text-sm">
                <p className="font-bold text-dtsc-ink">{invitation.invitedUser?.name || invitation.invitedEmail || "Destinataire externe"}</p>
                <p className="mt-1 text-xs text-dtsc-muted">Invité par {invitation.invitedBy.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReadInfoPanel({ info, userPreferences }: { info: MessageReadInfo; userPreferences: UserDatePreferences }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReadInfoList title="Lu par" empty="Aucun membre n'a encore confirmé la lecture." users={info.readBy.map((entry) => ({
        user: entry.user,
        detail: formatRelativeUserDateTime(entry.readAt, userPreferences),
      }))} />
      <ReadInfoList title="Non lu" empty="Tous les membres actifs ont lu ce message." users={info.unreadBy.map((entry) => ({
        user: entry.user,
        detail: isUserOnline(entry.user.lastSeenAt) ? "En ligne" : "Hors ligne",
      }))} />
    </div>
  );
}

function GroupCallRoom({
  joinedCall,
  group,
  onLeave,
  onEnd,
}: {
  joinedCall: JoinedCall;
  group: Group | null;
  onLeave: () => Promise<void>;
  onEnd: () => Promise<void>;
}) {
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(joinedCall.call.callType === "VIDEO");
  const connectedParticipants = group?.calls
    ?.find((call) => call.id === joinedCall.call.id)
    ?.participants?.filter((participant) => participant.status === "JOINED") || joinedCall.call.participants?.filter((participant) => participant.status === "JOINED") || [];
  const liveKitHost = safeHostLabel(joinedCall.livekitUrl);

  return (
    <div className="grid min-h-[70vh] overflow-hidden rounded-3xl border border-dtsc-border bg-[#06111f] text-white shadow-[0_24px_80px_rgba(0,23,54,0.28)] md:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex min-h-0 flex-col">
        <div className="border-b border-white/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{joinedCall.call.callType === "VIDEO" ? "Réunion vidéo DTSC" : "Réunion audio DTSC"}</p>
          <h3 className="mt-2 text-2xl font-black">{group?.name || "Groupe DTSC"}</h3>
          <p className="mt-1 text-sm text-slate-300">Room LiveKit sécurisée · {liveKitHost}</p>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <LiveKitRoom
            token={joinedCall.token}
            serverUrl={joinedCall.livekitUrl}
            connect
            audio={microphoneEnabled}
            video={joinedCall.call.callType === "VIDEO" && cameraEnabled}
            data-lk-theme="default"
            className="h-full min-h-[30rem] overflow-hidden rounded-3xl border border-cyan-300/30 bg-slate-950"
            onDisconnected={() => { void onLeave(); }}
          >
            {joinedCall.call.callType === "VIDEO" ? (
              <VideoConference />
            ) : (
              <div className="grid h-full place-items-center p-5">
                <RoomAudioRenderer />
                <div className="rounded-full border border-cyan-300/30 bg-cyan-400/10 p-10 text-center">
                  <PhoneCall className="mx-auto h-14 w-14 text-cyan-300" />
                  <p className="mt-4 text-xl font-black">Appel audio en cours</p>
                  <p className="mt-2 text-sm text-slate-300">{connectedParticipants.length || 1} participant(s) connecté(s)</p>
                </div>
              </div>
            )}
          </LiveKitRoom>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 p-4">
          <Button type="button" variant="outline" onClick={() => setMicrophoneEnabled((value) => !value)} className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20">
            {microphoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {microphoneEnabled ? "Micro actif" : "Micro coupé"}
          </Button>
          {joinedCall.call.callType === "VIDEO" && (
            <Button type="button" variant="outline" onClick={() => setCameraEnabled((value) => !value)} className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20">
              {cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {cameraEnabled ? "Caméra active" : "Caméra coupée"}
            </Button>
          )}
          <Button type="button" onClick={() => { void onLeave(); }} className="rounded-full bg-red-600 text-white hover:bg-red-700">
            <PhoneOff className="h-4 w-4" />
            Quitter
          </Button>
          <Button type="button" variant="outline" onClick={() => { void onEnd(); }} className="rounded-full border-red-300 bg-red-50 text-red-700 hover:bg-red-100">
            Terminer
          </Button>
        </div>
      </section>
      <aside className="min-h-0 border-t border-white/10 bg-white/5 p-4 md:border-l md:border-t-0">
        <h4 className="font-black">Participants connectés</h4>
        <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {(connectedParticipants.length ? connectedParticipants : [{ userId: joinedCall.call.startedById, status: "JOINED" } as GroupCallParticipant]).map((participant) => {
            const member = group?.members.find((item) => item.userId === participant.userId);
            return (
              <div key={participant.userId} className="rounded-2xl bg-white/10 p-3 text-sm">
                <p className="font-black">{member?.user.name || "Participant DTSC"}</p>
                <p className="mt-1 text-xs text-slate-300">{formatEnumLabel(participant.status)}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 break-all rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-xs text-cyan-100">
          Token LiveKit généré côté serveur. Les secrets ne sont jamais exposés au client.
        </p>
      </aside>
    </div>
  );
}

function safeHostLabel(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "LiveKit";
  }
}

function ReadInfoList({ title, empty, users }: { title: string; empty: string; users: Array<{ user: UserOption; detail: string }> }) {
  return (
    <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
      <h3 className="font-black text-dtsc-ink">{title}</h3>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {users.map(({ user, detail }) => {
          const color = getParticipantColor(user.id);
          const online = isUserOnline(user.lastSeenAt);
          return (
            <div key={user.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-dtsc-surface p-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black", color.bgClassName, color.textClassName)}>
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-dtsc-ink">{user.name}</span>
                <span className="flex items-center gap-1 text-xs text-dtsc-muted">
                  <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-500" : "bg-red-500")} />
                  {detail}
                </span>
              </span>
            </div>
          );
        })}
        {!users.length && <p className="rounded-xl bg-dtsc-surface p-3 text-sm text-dtsc-muted">{empty}</p>}
      </div>
    </section>
  );
}

function GroupDetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-[0_10px_26px_rgba(0,23,54,0.08)] dark:border-cyan-300/20 dark:bg-white/10">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function GroupInfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-1 break-words font-bold text-dtsc-ink">{value}</p>
    </div>
  );
}

function MentionText({
  content,
  mentions,
  onProfile,
  onCreateGroup,
}: {
  content: string;
  mentions: MentionedUser[];
  onProfile: (user: MentionedUser) => void;
  onCreateGroup: (user: MentionedUser) => void;
}) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  if (!mentions.length) {
    return <>{content}</>;
  }
  const mentionByName = new Map(mentions.map((mention) => [`@${mention.name}`, mention]));
  const pattern = new RegExp(`(${mentions.map((mention) => escapeRegExp(`@${mention.name}`)).join("|")})`, "g");
  return (
    <>
      {content.split(pattern).map((part, index) => {
        const user = mentionByName.get(part);
        if (!user) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }
        const isOpen = openUserId === user.id;
        return (
          <span key={`${user.id}-${index}`} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setOpenUserId((current) => current === user.id ? null : user.id)}
              className="font-black text-cyan-600 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              @{user.name}
            </button>
            {isOpen && (
              <span className="absolute left-0 top-7 z-50 w-72 rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 text-left shadow-[0_18px_60px_rgba(0,23,54,0.22)]">
                <button type="button" onClick={() => { setOpenUserId(null); onProfile(user); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-dtsc-ink hover:bg-dtsc-soft">
                  <UserRound className="h-4 w-4" /> Voir le profil limité
                </button>
                <button type="button" onClick={() => { setOpenUserId(null); onCreateGroup(user); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-dtsc-ink hover:bg-dtsc-soft">
                  <UserPlus className="h-4 w-4" /> Créer un groupe avec lui
                </button>
                <button type="button" onClick={() => { setOpenUserId(null); copyText(user.name); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-dtsc-ink hover:bg-dtsc-soft">
                  <Copy className="h-4 w-4" /> Copier le nom
                </button>
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

function copyText(value: string) {
  const clipboard = typeof globalThis.navigator !== "undefined" ? globalThis.navigator.clipboard : null;
  void clipboard?.writeText(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isUserOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) {
    return false;
  }
  const seenAt = new Date(lastSeenAt).getTime();
  return Number.isFinite(seenAt) && Date.now() - seenAt <= 5 * 60 * 1000;
}

function inviteSearchScore(searchable: string, tokens: string[]) {
  if (!tokens.length) {
    return 0;
  }
  return tokens.reduce((score, token) => {
    if (searchable.startsWith(token)) {
      return score + 3;
    }
    if (searchable.includes(` ${token}`)) {
      return score + 2;
    }
    return searchable.includes(token) ? score + 1 : score;
  }, 0);
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
