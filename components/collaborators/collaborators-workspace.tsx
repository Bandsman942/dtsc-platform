"use client";

import { Archive, Check, CheckCheck, Copy, Eye, Maximize2, Mic, MicOff, Minimize2, MonitorOff, MonitorUp, MessageSquare, Phone, PhoneCall, PhoneOff, Pencil, Plus, Reply, Send, Shield, ShieldOff, Trash2, UserMinus, UserPlus, UserRound, Video, VideoOff, X } from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import { ConnectionState, Room } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { ConversationComposer } from "@/components/chat/ConversationComposer";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { ConversationListItem } from "@/components/chat/ConversationListItem";
import { FloatingActionButton } from "@/components/chat/FloatingActionButton";
import { SearchBar } from "@/components/chat/SearchBar";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { playCallSound } from "@/components/calls/call-sounds";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { translate } from "@/lib/i18n";
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
  unreadMessageCount?: number;
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
  status: string;
  startedById: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  participants?: GroupCallParticipant[];
};
type JoinedCall = {
  call: GroupCall;
  token: string;
  livekitUrl: string;
};
type CallPreferences = {
  callSoundsEnabled?: boolean;
  callNotificationsEnabled?: boolean;
  floatingCallAlertsEnabled?: boolean;
  participantEventAlertsEnabled?: boolean;
  callAlertSoundEnabled?: boolean;
  incomingCallBannerEnabled?: boolean;
  connectionIssueSoundsEnabled?: boolean;
  startMutedByDefault?: boolean;
  startCameraOffByDefault?: boolean;
  callSoundVolume?: number | null;
  callAlertDisplayDuration?: number | null;
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
  reads?: Array<{ userId: string; readAt: string }>;
  sharedChatbotConversation?: { id: string; title: string; updatedAt: string } | null;
  sharedConversationSnapshot?: { id: string; title: string; status: string; createdAt: string; deletedAt?: string | null } | null;
};
type FullscreenFocusTarget = "auto" | "screen" | `participant:${string}`;
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
  initialActiveGroupId,
  initialJoinCallId,
  userPreferences,
  initialGroups,
  initialInvitations,
  users,
  conversations,
  callPreferences,
}: {
  currentUserId: string;
  initialActiveGroupId?: string | null;
  initialJoinCallId?: string | null;
  userPreferences: UserDatePreferences;
  initialGroups: Group[];
  initialInvitations: Invitation[];
  users: UserOption[];
  conversations: ConversationOption[];
  callPreferences: CallPreferences;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [activeGroupId, setActiveGroupId] = useState(
    initialActiveGroupId && initialGroups.some((group) => group.id === initialActiveGroupId) ? initialActiveGroupId : initialGroups[0]?.id || ""
  );
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
  useToastMessage(feedback);
  const trackedActiveCallIds = useRef<Set<string>>(new Set());
  const hasTrackedInitialCalls = useRef(false);
  const autoJoinCallIdRef = useRef(initialJoinCallId || "");
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const activeMember = activeGroup?.members.find((member) => member.userId === currentUserId);
  const canManage = activeMember?.role === "OWNER" || activeMember?.role === "ADMIN";
  const isGroupOwner = activeMember?.role === "OWNER";
  const activeCall = activeGroup?.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE") || null;
  const canEndActiveCall = Boolean(activeCall && (activeCall.startedById === currentUserId || canManage));
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

  const refresh = useCallback(async () => {
    const response = await fetch("/api/collaborators/groups");
    const body = await response.json();
    setGroups(body.groups || []);
    setInvitations(body.invitations || []);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 2500);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const activeCalls = groups.flatMap((group) => group.calls || []).filter((call) => call.status === "RINGING" || call.status === "ACTIVE");
    const nextIds = new Set(activeCalls.map((call) => call.id));
    if (hasTrackedInitialCalls.current) {
      const hasNewCall = activeCalls.some((call) => !trackedActiveCallIds.current.has(call.id));
      if (hasNewCall && callPreferences.callSoundsEnabled !== false && callPreferences.incomingCallBannerEnabled !== false) {
        void playCallSound("incoming", callPreferences.callSoundVolume ?? 45);
      }
    }
    trackedActiveCallIds.current = nextIds;
    hasTrackedInitialCalls.current = true;
  }, [callPreferences.callSoundVolume, callPreferences.callSoundsEnabled, callPreferences.incomingCallBannerEnabled, groups]);

  useEffect(() => {
    if (!joinedCall) {
      return;
    }
    const liveCall = groups.flatMap((group) => group.calls || []).find((call) => call.id === joinedCall.call.id);
    if (!liveCall || liveCall.status === "ENDED" || liveCall.status === "CANCELLED" || liveCall.status === "MISSED") {
      setJoinedCall(null);
      setFeedback("L'organisateur a terminé l'appel.");
      if (callPreferences.callSoundsEnabled !== false) {
        void playCallSound("ended", callPreferences.callSoundVolume ?? 45);
      }
    }
  }, [callPreferences.callSoundVolume, callPreferences.callSoundsEnabled, groups, joinedCall]);

  const loadMessages = useCallback(async (groupId: string, cursor?: string | null) => {
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
      setGroups((current) => current.map((group) => group.id === groupId ? { ...group, unreadMessageCount: 0, unreadMentionCount: 0, unreadMentionPreview: null, lastMentionAt: null } : group));
    }
  }, []);

  useEffect(() => {
    void loadMessages(activeGroupId);
  }, [activeGroupId, loadMessages]);

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadMessages(activeGroupId);
      }
    }, 7000);
    return () => window.clearInterval(interval);
  }, [activeGroupId, loadMessages]);

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

  const joinGroupCall = useCallback(async (call: GroupCall) => {
    setCallJoining(true);
    const response = await fetch(`/api/collaborators/calls/${call.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        microphoneEnabled: callPreferences.startMutedByDefault !== true,
        cameraEnabled: call.callType === "VIDEO" && callPreferences.startCameraOffByDefault !== true,
      }),
    });
    const body = await response.json().catch(() => null) as { token?: string; livekitUrl?: string; message?: string } | null;
    setCallJoining(false);
    if (!response.ok || !body?.token || !body.livekitUrl) {
      setFeedback(body?.message || "Impossible de rejoindre l'appel.");
      return;
    }
    setJoinedCall({ call, token: body.token, livekitUrl: body.livekitUrl });
    setFeedback("Connexion à l'appel en cours.");
    if (callPreferences.callSoundsEnabled !== false) {
      void playCallSound("connected", callPreferences.callSoundVolume ?? 45);
    }
    await refresh();
    if (activeGroup) {
      await loadMessages(activeGroup.id);
    }
  }, [
    activeGroup,
    callPreferences.callSoundVolume,
    callPreferences.callSoundsEnabled,
    callPreferences.startCameraOffByDefault,
    callPreferences.startMutedByDefault,
    loadMessages,
    refresh,
  ]);

  useEffect(() => {
    const targetCallId = autoJoinCallIdRef.current;
    if (!targetCallId || joinedCall || callJoining) {
      return;
    }
    const targetCall = groups.flatMap((group) => group.calls || []).find((call) => call.id === targetCallId && (call.status === "RINGING" || call.status === "ACTIVE"));
    if (!targetCall) {
      return;
    }
    autoJoinCallIdRef.current = "";
    void joinGroupCall(targetCall);
  }, [callJoining, groups, joinedCall, joinGroupCall]);

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
    <div className="relative grid h-[calc(100dvh-7.25rem)] min-w-0 overflow-hidden bg-dtsc-surface sm:h-[calc(100dvh-8rem)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-dtsc-border bg-dtsc-surface px-3 py-3 sm:px-4", activeGroup && !mobileGroupListOpen ? "hidden xl:flex" : "flex")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">Mes collaborateurs</p>
            <h2 className="truncate text-lg font-black text-dtsc-ink">Groupes</h2>
          </div>
          <Button type="button" size="icon" onClick={() => setGroupDialog("create")} className="h-10 w-10 rounded-full bg-[#002b5b] text-white" aria-label="Créer un groupe">
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
        <div className="mt-3 sm:mt-4">
          <SearchBar
            value={groupList.query}
            onChange={groupList.setQuery}
            placeholder="Rechercher un groupe..."
            ariaLabel="Rechercher un groupe collaboratif"
          />
        </div>
        <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-0.5 sm:pr-1">
          {groupList.paginatedItems.map((group) => {
            const groupActiveCall = group.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE");
            const activeParticipantCount = groupActiveCall?.participants?.filter((participant) => participant.status === "JOINED").length || 0;
            const unreadMessageCount = group.unreadMessageCount || 0;
            const unreadMentionCount = group.unreadMentionCount || 0;
            const latestMessage = group.messages[0];
            const preview = groupActiveCall
              ? `Appel ${groupActiveCall.callType === "VIDEO" ? "video" : "audio"} · ${activeParticipantCount} en ligne`
              : group.unreadMentionPreview || (latestMessage ? `${latestMessage.author.name}: ${latestMessage.content}` : "Aucun message recent.");
            return (
              <ConversationListItem
                key={group.id}
                id={group.id}
                type="group"
                title={group.name}
                preview={preview}
                timestamp={groupActiveCall ? "Live" : latestMessage ? formatRelativeUserDateTime(latestMessage.createdAt, userPreferences) : undefined}
                unreadCount={unreadMessageCount}
                mentionCount={unreadMentionCount}
                isActive={activeGroupId === group.id}
                statusLabel={groupActiveCall ? "Appel en cours" : undefined}
                onClick={() => {
                  setActiveGroupId(group.id);
                  setMobileGroupListOpen(false);
                }}
              />
            );
          })}
          {!groupList.filteredCount && (
            <p className="rounded-xl bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">Aucun groupe ne correspond à votre recherche.</p>
          )}
        </div>
        {groupList.pageCount > 1 && (
          <div className="mt-2 flex shrink-0 items-center justify-between gap-2 text-xs font-bold text-dtsc-muted">
            <Button type="button" size="sm" variant="outline" onClick={() => groupList.setPage(Math.max(1, groupList.page - 1))} disabled={groupList.page <= 1} className="h-8 rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue">Préc.</Button>
            <span>{groupList.page}/{groupList.pageCount}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => groupList.setPage(Math.min(groupList.pageCount, groupList.page + 1))} disabled={groupList.page >= groupList.pageCount} className="h-8 rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue">Suiv.</Button>
          </div>
        )}
        <FloatingActionButton label="Créer un groupe" onClick={() => setGroupDialog("create")} />
      </aside>

      <section className={cn("h-full min-h-0 min-w-0 flex-col overflow-hidden bg-dtsc-surface", activeGroup && mobileGroupListOpen ? "hidden xl:flex" : "flex")}>
        {activeGroup ? (
          <>
            <ConversationHeader
              title={activeGroup.name}
              subtitle={`${activeGroup.members.length} membre(s) · ${formatEnumLabel(activeGroup.status)}`}
              type="group"
              onBack={() => setMobileGroupListOpen(true)}
              onTitleClick={() => setGroupDetailsOpen(true)}
              backButtonClassName="xl:hidden"
              actions={(
                <>
                  {activeCall ? (
                    <Button type="button" onClick={() => joinGroupCall(activeCall)} disabled={callJoining} className="hidden rounded-full bg-cyan-500 text-[#001736] hover:bg-cyan-300 sm:inline-flex">
                      <PhoneCall className="h-4 w-4" />
                      Rejoindre
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => startGroupCall("AUDIO")} className="hidden rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue sm:inline-flex" aria-label="Démarrer un appel audio">
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" onClick={() => startGroupCall("VIDEO")} className="hidden rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue sm:inline-flex" aria-label="Démarrer un appel vidéo">
                        <Video className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {canManage && <Button type="button" variant="outline" onClick={() => setInviteDialog(true)} className="hidden rounded-full sm:inline-flex"><UserPlus className="h-4 w-4" /> Inviter</Button>}
                  <ActionMenu
                    items={[
                      ...(activeCall
                        ? [
                            { key: "join-call", label: "Rejoindre l'appel", icon: PhoneCall, onSelect: () => joinGroupCall(activeCall) },
                            ...(canEndActiveCall ? [{ key: "end-call", label: "Terminer l'appel", icon: PhoneOff, destructive: true, onSelect: () => endGroupCall(activeCall) }] : []),
                          ]
                        : [
                            { key: "start-audio", label: "Démarrer un appel audio", icon: Phone, onSelect: () => startGroupCall("AUDIO") },
                            { key: "start-video", label: "Démarrer un appel vidéo", icon: Video, onSelect: () => startGroupCall("VIDEO") },
                          ]),
                      ...(canManage ? [
                        { key: "invite", label: "Inviter des membres", icon: UserPlus, onSelect: () => setInviteDialog(true) },
                        { key: "edit", label: "Modifier le groupe", icon: Pencil, onSelect: () => setGroupDialog("edit") },
                      ] : []),
                      { key: "details", label: "Infos du groupe", icon: Eye, onSelect: () => setGroupDetailsOpen(true) },
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
                </>
              )}
            />
            {activeCall && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-700 dark:text-cyan-200 sm:px-4">
                <span className="min-w-0 truncate">Appel {activeCall.callType === "VIDEO" ? "vidéo" : "audio"} · {formatCallDurationFromStart(activeCall.startedAt)} · {activeCall.participants?.filter((participant) => participant.status === "JOINED").length || 0} connecté(s)</span>
                <Button type="button" size="sm" onClick={() => joinGroupCall(activeCall)} className="h-7 shrink-0 rounded-full bg-cyan-500 px-3 text-[0.68rem] font-black text-[#001736] hover:bg-cyan-300">
                  Rejoindre
                </Button>
              </div>
            )}
            <CallHistoryStrip group={activeGroup} userPreferences={userPreferences} />
            {activeGroup.groupType === "MEETING" && (
              <details className="shrink-0 border-b border-dtsc-border bg-dtsc-surface px-3 py-2 sm:px-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-[#001736] dark:border-cyan-400/40 dark:bg-[#08223a] dark:text-cyan-50">
                  <span className="min-w-0">
                    <span className="block text-[0.62rem] font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Réunion COO liée</span>
                    <span className="block truncate font-black">{activeGroup.name}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-[0.66rem] font-black text-cyan-800 dark:bg-white/10 dark:text-cyan-100">Voir plus</span>
                </summary>
                <div className="mt-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-[#001736] dark:border-cyan-400/40 dark:bg-[#08223a] dark:text-cyan-50">
                  <p className="text-xs opacity-80">Préparation, discussion, appel, compte rendu et décisions restent attachés à ce groupe de réunion.</p>
                  {activeCall ? (
                    <Button type="button" size="sm" onClick={() => joinGroupCall(activeCall)} className="mt-2 rounded-xl bg-cyan-500 text-[#001736] hover:bg-cyan-300">
                      <PhoneCall className="h-4 w-4" />
                      Rejoindre l&apos;appel
                    </Button>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
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
              </details>
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
            {["COMPANY", "PROJECT", "CROSS_ORGANIZATION", "PRIVATE_NETWORK", "DTSC_SUPPORT", "INTERNAL", "CLIENT", "OTHER"].map((type) => <option key={type} value={type}>{formatEnumLabel(type)}</option>)}
          </select>
          <p className="text-xs font-semibold leading-5 text-dtsc-muted">
            Les groupes internes restent liés au contexte actif. Les groupes transversaux permettent d&apos;inviter des utilisateurs de toute la plateforme, avec accès uniquement après acceptation.
          </p>
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
            messages={messages}
            currentUserId={currentUserId}
            userPreferences={userPreferences}
            callPreferences={callPreferences}
            canEnd={joinedCall.call.startedById === currentUserId || canManage}
            onLeave={leaveJoinedCall}
            onEnd={() => endGroupCall(joinedCall.call)}
            onMessageSent={async () => {
              if (activeGroup) {
                await loadMessages(activeGroup.id);
                await refresh();
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
  onLoadOlder: () => Promise<void> | void;
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
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
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

  async function jumpToMessage(messageId: string) {
    const findMessageElement = () => messageListRef.current?.querySelector<HTMLElement>(`[data-group-message-id="${messageId}"]`) || null;
    let target = findMessageElement();
    if (!target && hasOlderMessages) {
      await onLoadOlder();
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      target = findMessageElement();
    }
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 1800);
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
      <div ref={messageListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-dtsc-page p-3 sm:space-y-3 sm:p-4">
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
            group={group}
            currentUserId={currentUserId}
            userPreferences={userPreferences}
            onChanged={onChanged}
            onEdit={onEdit}
            onOpenSharedSnapshot={onOpenSharedSnapshot}
            onOpenReadInfo={onOpenReadInfo}
            onReply={setReplyTo}
            onJumpToMessage={jumpToMessage}
            highlighted={highlightedMessageId === message.id}
            onMentionProfile={onMentionProfile}
            onCreateMentionGroup={onCreateMentionGroup}
          />
        ))}
        {!messages.length && <p className="rounded-xl bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun message dans ce groupe.</p>}
      </div>
      <ConversationComposer
        value={content}
        onChange={setContent}
        onSubmit={sendMessage}
        placeholder="Écrire un message ou mentionner @collaborateur..."
        className="relative"
        before={(
          <>
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
          </>
        )}
      />
    </div>
  );
}

function GroupMessageBubble({
  message,
  group,
  currentUserId,
  userPreferences,
  onChanged,
  onEdit,
  onOpenSharedSnapshot,
  onOpenReadInfo,
  onReply,
  onJumpToMessage,
  highlighted,
  onMentionProfile,
  onCreateMentionGroup,
}: {
  message: GroupMessage;
  group: Group;
  currentUserId: string;
  userPreferences: UserDatePreferences;
  onChanged: () => Promise<void>;
  onEdit: (message: GroupMessage) => void;
  onOpenSharedSnapshot: (snapshotId: string) => void;
  onOpenReadInfo: (messageId: string) => void;
  onReply: (message: GroupMessage) => void;
  onJumpToMessage: (messageId: string) => void;
  highlighted: boolean;
  onMentionProfile: (user: MentionedUser) => void;
  onCreateMentionGroup: (user: MentionedUser) => void;
}) {
  const participantColor = getParticipantColor(message.authorId || message.author.email);
  const receiptStatus = getMessageReadReceiptStatus(message, group, currentUserId);
  if (message.messageType === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[92%] rounded-full border border-dtsc-border bg-dtsc-soft px-2.5 py-1 text-center text-[0.68rem] font-bold leading-4 text-dtsc-muted sm:px-3">
          {message.content}
          <span className="ml-1.5 font-semibold opacity-70">{formatRelativeUserDateTime(message.createdAt, userPreferences)}</span>
        </div>
      </div>
    );
  }
  return (
    <div id={`group-message-${message.id}`} data-group-message-id={message.id} className={cn("flex rounded-2xl transition", highlighted && "dtsc-message-focus-pulse", message.authorId === currentUserId ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[92%] gap-2 sm:max-w-[88%]", message.authorId === currentUserId && "flex-row-reverse")}>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[0.68rem] font-black sm:h-9 sm:w-9", participantColor.bgClassName, participantColor.textClassName, participantColor.borderClassName)}>
          {message.author.name.slice(0, 2).toUpperCase()}
        </span>
        <div className={cn("min-w-0 rounded-2xl border p-2.5 text-sm shadow-[0_4px_20px_rgba(0,43,91,0.05)] sm:p-3", message.authorId === currentUserId ? "border-[#002b5b] bg-[#002b5b] text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink")}>
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
            <button type="button" onClick={() => onJumpToMessage(message.replyTo?.id || "")} className={cn("mb-2 block w-full rounded-xl border-l-4 p-3 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-300", message.authorId === currentUserId ? "border-cyan-200 bg-white/10 text-white/85" : "border-cyan-300 bg-dtsc-page text-dtsc-muted")}>
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
          <div className={cn("mt-2 flex items-center gap-1.5 text-[0.68rem] font-semibold", message.authorId === currentUserId ? "justify-end text-white/70" : "justify-start text-dtsc-muted")}>
            <span>{formatRelativeUserDateTime(message.createdAt, userPreferences)}{message.status === "EDITED" ? " · modifié" : ""}</span>
            {receiptStatus && <MessageReadReceipt status={receiptStatus} locale={userPreferences.locale} />}
          </div>
        </div>
      </div>
    </div>
  );
}

type MessageReadReceiptStatus = "sent" | "readByAll";

function MessageReadReceipt({ status, locale, compact = false }: { status: MessageReadReceiptStatus; locale: UserDatePreferences["locale"]; compact?: boolean }) {
  const isReadByAll = status === "readByAll";
  const label = isReadByAll ? translate(locale, "collaborators.readByAll") : translate(locale, "collaborators.messageSent");
  const Icon = isReadByAll ? CheckCheck : Check;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-black",
        compact ? "translate-y-[1px]" : "",
        isReadByAll ? "text-emerald-300 dark:text-emerald-300" : "text-white/70 dark:text-slate-300"
      )}
      title={label}
      aria-label={label}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={3} />
    </span>
  );
}

function getMessageReadReceiptStatus(message: GroupMessage, group: Group, currentUserId: string): MessageReadReceiptStatus | null {
  if (message.authorId !== currentUserId || message.messageType === "SYSTEM" || message.deletedAt) {
    return null;
  }
  const expectedReaders = group.members
    .filter((member) => member.userId !== message.authorId && isActiveGroupMember(member))
    .map((member) => member.userId);
  const readUserIds = new Set((message.reads || []).map((read) => read.userId));
  const allReadersConfirmed = expectedReaders.length === 0 || expectedReaders.every((userId) => readUserIds.has(userId));
  return allReadersConfirmed ? "readByAll" : "sent";
}

function isActiveGroupMember(member: GroupMember) {
  return member.status === "ACTIVE" || member.status === "JOINED" || member.status === "OWNER" || member.status === "ADMIN";
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

function CallHistoryStrip({ group, userPreferences }: { group: Group; userPreferences: UserDatePreferences }) {
  const endedCalls = (group.calls || []).filter((call) => call.status === "ENDED").slice(0, 3);
  if (!endedCalls.length) {
    return null;
  }
  return (
    <div className="shrink-0 border-b border-dtsc-border bg-dtsc-page px-3 py-1.5 sm:px-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {endedCalls.map((call) => {
          const starter = group.members.find((member) => member.userId === call.startedById)?.user.name || "Collaborateur DTSC";
          const participantCount = call.participants?.filter((participant) => participant.status === "LEFT" || participant.status === "JOINED").length || 1;
          return (
            <div key={call.id} className="min-w-[12rem] rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-1.5 text-[0.68rem] text-dtsc-muted">
              <p className="truncate font-black text-dtsc-ink">Appel {call.callType === "VIDEO" ? "vidéo" : "audio"} · {formatCallDuration(call.durationSeconds ?? callDurationBetween(call.startedAt, call.endedAt))}</p>
              <p className="truncate">Par {starter} · {participantCount} · {formatRelativeUserDateTime(call.startedAt, userPreferences)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupCallRoom({
  joinedCall,
  group,
  messages,
  currentUserId,
  userPreferences,
  callPreferences,
  canEnd,
  onLeave,
  onEnd,
  onMessageSent,
}: {
  joinedCall: JoinedCall;
  group: Group | null;
  messages: GroupMessage[];
  currentUserId: string;
  userPreferences: UserDatePreferences;
  callPreferences: CallPreferences;
  canEnd: boolean;
  onLeave: () => Promise<void>;
  onEnd: () => Promise<void>;
  onMessageSent: () => Promise<void>;
}) {
  const [room] = useState(() => new Room());
  const [microphoneEnabled, setMicrophoneEnabled] = useState(callPreferences.startMutedByDefault !== true);
  const [cameraEnabled, setCameraEnabled] = useState(joinedCall.call.callType === "VIDEO" && callPreferences.startCameraOffByDefault !== true);
  const [connectionLabel, setConnectionLabel] = useState("Connexion à l'appel...");
  const [callError, setCallError] = useState("");
  const [callChatOpen, setCallChatOpen] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFocus, setFullscreenFocus] = useState<FullscreenFocusTarget>("auto");
  const [focusControlsVisible, setFocusControlsVisible] = useState(true);
  const [compactFullscreenUi, setCompactFullscreenUi] = useState(false);
  const [duration, setDuration] = useState(callDurationFromStart(joinedCall.call.startedAt));
  const callShellRef = useRef<HTMLDivElement | null>(null);
  const connectionWasInterruptedRef = useRef(false);
  const t = (key: string) => translate(userPreferences.locale, key);
  const starterMember = group?.members.find((member) => member.userId === joinedCall.call.startedById);
  const connectedParticipants = group?.calls
    ?.find((call) => call.id === joinedCall.call.id)
    ?.participants?.filter((participant) => participant.status === "JOINED") || joinedCall.call.participants?.filter((participant) => participant.status === "JOINED") || [];

  const reportCallEvent = useCallback(async (eventType: "CALL_INTERRUPTED" | "CALL_RECONNECTED") => {
    await fetch(`/api/collaborators/calls/${joinedCall.call.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType }),
    }).catch(() => null);
  }, [joinedCall.call.id]);

  const persistParticipantMediaState = useCallback(async (state: { microphoneEnabled?: boolean; cameraEnabled?: boolean }) => {
    await fetch(`/api/collaborators/calls/${joinedCall.call.id}/participants`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch(() => null);
  }, [joinedCall.call.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setDuration(callDurationFromStart(joinedCall.call.startedAt)), 1000);
    return () => window.clearInterval(interval);
  }, [joinedCall.call.startedAt]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === callShellRef.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setFullscreenFocus("auto");
      setFocusControlsVisible(true);
    } else {
      setFocusControlsVisible(true);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || !compactFullscreenUi || !focusControlsVisible) {
      return;
    }
    const timeout = window.setTimeout(() => setFocusControlsVisible(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [compactFullscreenUi, focusControlsVisible, isFullscreen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 700px), (pointer: coarse)");
    const syncCompactState = () => setCompactFullscreenUi(mediaQuery.matches);
    syncCompactState();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncCompactState);
      return () => mediaQuery.removeEventListener("change", syncCompactState);
    }
    mediaQuery.addListener(syncCompactState);
    return () => mediaQuery.removeListener(syncCompactState);
  }, []);

  useEffect(() => {
    if (!isFullscreen || joinedCall.call.callType !== "VIDEO") {
      return;
    }
    let cancelled = false;
    const timeouts: number[] = [];
    const applyFocusSafely = (attempt = 0) => {
      if (cancelled) {
        return;
      }
      const root = callShellRef.current?.querySelector<HTMLElement>(".dtsc-livekit-room");
      const applied = root ? applyLiveKitFullscreenFocus(root, fullscreenFocus, group) : false;
      if (!applied && attempt < 5) {
        timeouts.push(window.setTimeout(() => applyFocusSafely(attempt + 1), 220 + attempt * 180));
      }
    };
    const frameId = window.requestAnimationFrame(() => applyFocusSafely());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      const root = callShellRef.current?.querySelector<HTMLElement>(".dtsc-livekit-room");
      if (!root) {
        return;
      }
      root.removeAttribute("data-dtsc-focus-ready");
      root.querySelectorAll(".dtsc-focus-selected").forEach((node) => node.classList.remove("dtsc-focus-selected"));
    };
  }, [fullscreenFocus, group, isFullscreen, joinedCall.call.callType]);

  useEffect(() => {
    if (room.state === ConnectionState.Disconnected) {
      return;
    }
    room.localParticipant.setMicrophoneEnabled(microphoneEnabled).catch(() => {
      setMicrophoneEnabled(false);
      setCallError("Micro inaccessible. Vérifiez les permissions de votre navigateur.");
      if (callPreferences.connectionIssueSoundsEnabled !== false && callPreferences.callSoundsEnabled !== false) {
        void playCallSound("warning", callPreferences.callSoundVolume ?? 45);
      }
    });
  }, [callPreferences.callSoundVolume, callPreferences.callSoundsEnabled, callPreferences.connectionIssueSoundsEnabled, microphoneEnabled, room]);

  useEffect(() => {
    if (room.state === ConnectionState.Disconnected || joinedCall.call.callType !== "VIDEO") {
      return;
    }
    room.localParticipant.setCameraEnabled(cameraEnabled).catch(() => {
      setCameraEnabled(false);
      setCallError("Caméra inaccessible. Vérifiez les permissions de votre navigateur.");
      if (callPreferences.connectionIssueSoundsEnabled !== false && callPreferences.callSoundsEnabled !== false) {
        void playCallSound("warning", callPreferences.callSoundVolume ?? 45);
      }
    });
  }, [callPreferences.callSoundVolume, callPreferences.callSoundsEnabled, callPreferences.connectionIssueSoundsEnabled, cameraEnabled, joinedCall.call.callType, room]);

  async function toggleScreenShare() {
    const nextValue = !screenShareEnabled;
    try {
      await room.localParticipant.setScreenShareEnabled(nextValue);
      setScreenShareEnabled(nextValue);
      setCallError("");
    } catch {
      setCallError("Le partage d'écran n'est pas disponible sur cet appareil ou ce navigateur.");
    }
  }

  async function setMicrophoneState(nextEnabled: boolean) {
    try {
      if (room.state !== ConnectionState.Disconnected) {
        await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      }
      setMicrophoneEnabled(nextEnabled);
      setCallError("");
      void persistParticipantMediaState({ microphoneEnabled: nextEnabled });
    } catch {
      setMicrophoneEnabled(false);
      setCallError("Micro inaccessible. Vérifiez les permissions de votre navigateur.");
      void persistParticipantMediaState({ microphoneEnabled: false });
      if (callPreferences.connectionIssueSoundsEnabled !== false && callPreferences.callSoundsEnabled !== false) {
        void playCallSound("warning", callPreferences.callSoundVolume ?? 45);
      }
    }
  }

  async function setCameraState(nextEnabled: boolean) {
    try {
      if (room.state !== ConnectionState.Disconnected) {
        await room.localParticipant.setCameraEnabled(nextEnabled);
      }
      setCameraEnabled(nextEnabled);
      setCallError("");
      void persistParticipantMediaState({ cameraEnabled: nextEnabled });
    } catch {
      setCameraEnabled(false);
      setCallError("Caméra inaccessible. Vérifiez les permissions de votre navigateur.");
      void persistParticipantMediaState({ cameraEnabled: false });
      if (callPreferences.connectionIssueSoundsEnabled !== false && callPreferences.callSoundsEnabled !== false) {
        void playCallSound("warning", callPreferences.callSoundVolume ?? 45);
      }
    }
  }

  async function toggleFullscreen() {
    try {
      const element = callShellRef.current;
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else if (element instanceof HTMLElement) {
        await element.requestFullscreen();
      }
    } catch {
      setCallError("Le plein écran n'est pas disponible sur cet appareil.");
    }
  }

  function handleFullscreenFocusChange(nextFocus: FullscreenFocusTarget) {
    setFullscreenFocus(nextFocus);
    if (compactFullscreenUi) {
      setFocusControlsVisible(false);
    }
  }

  function handleCallStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isFullscreen || !compactFullscreenUi) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("[data-call-focus-controls], .dtsc-call-controls, .dtsc-call-chat-panel")) {
      return;
    }
    setFocusControlsVisible((visible) => !visible);
  }

  return (
    <div ref={callShellRef} className="dtsc-call-shell relative grid min-h-[78vh] overflow-hidden rounded-3xl border border-dtsc-border bg-[#06111f] text-white shadow-[0_24px_80px_rgba(0,23,54,0.28)] md:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="dtsc-call-main flex min-h-0 flex-col">
        <div className="dtsc-call-header shrink-0 border-b border-white/10 p-3 sm:p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{joinedCall.call.callType === "VIDEO" ? "Réunion vidéo DTSC" : "Réunion audio DTSC"}</p>
          <h3 className="mt-2 text-2xl font-black">{group?.name || "Groupe DTSC"}</h3>
          <p className="mt-1 text-sm text-slate-300">{connectionLabel} · {formatCallDuration(duration)}</p>
          {callError && <p className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">{callError}</p>}
        </div>
        <div className="dtsc-call-stage relative min-h-0 flex-1 p-2 sm:p-3" onPointerDown={handleCallStagePointerDown}>
          {callChatOpen && (
            <div className="mb-2 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100">
              {t("calls.activeWhileChatOpen")}
            </div>
          )}
          {isFullscreen && joinedCall.call.callType === "VIDEO" && (!compactFullscreenUi || focusControlsVisible) && (
            <CallFullscreenFocusControls
              focus={fullscreenFocus}
              participants={connectedParticipants}
              group={group}
              t={t}
              onFocusChange={handleFullscreenFocusChange}
            />
          )}
          <LiveKitRoom
            room={room}
            token={joinedCall.token}
            serverUrl={joinedCall.livekitUrl}
            connect
            audio={microphoneEnabled}
            video={joinedCall.call.callType === "VIDEO" && cameraEnabled}
            data-lk-theme="default"
            className={cn(
              "dtsc-livekit-room h-full min-h-[24rem] overflow-hidden rounded-3xl border border-cyan-300/30 bg-slate-950 sm:min-h-[30rem]",
              isFullscreen && fullscreenFocus !== "auto" && "dtsc-livekit-focus-mode",
              isFullscreen && fullscreenFocus === "screen" && "dtsc-livekit-focus-screen"
            )}
            onConnected={() => {
              setConnectionLabel("Appel connecté");
              if (connectionWasInterruptedRef.current) {
                connectionWasInterruptedRef.current = false;
                void reportCallEvent("CALL_RECONNECTED");
              }
              if (callPreferences.callSoundsEnabled !== false) {
                void playCallSound("connected", callPreferences.callSoundVolume ?? 45);
              }
            }}
            onDisconnected={() => setConnectionLabel("Vous avez quitté l'appel")}
            onError={() => {
              setConnectionLabel("Connexion instable");
              setCallError("Impossible de rejoindre l'appel. Vérifiez votre connexion puis réessayez.");
              if (!connectionWasInterruptedRef.current) {
                connectionWasInterruptedRef.current = true;
                void reportCallEvent("CALL_INTERRUPTED");
              }
              if (callPreferences.connectionIssueSoundsEnabled !== false && callPreferences.callSoundsEnabled !== false) {
                void playCallSound("warning", callPreferences.callSoundVolume ?? 45);
              }
            }}
          >
            <CallParticipantAvatarStyles group={group} />
            {joinedCall.call.callType === "VIDEO" ? (
              <VideoConference />
            ) : (
              <div className="grid h-full place-items-center p-5">
                <RoomAudioRenderer />
                <div className="rounded-[2rem] border border-cyan-300/30 bg-cyan-400/10 p-6 text-center shadow-[0_24px_70px_rgba(0,23,54,0.30)]">
                  <CallMemberAvatar member={starterMember} fallbackIcon={<PhoneCall className="h-9 w-9 text-cyan-200" />} className="mx-auto h-24 w-24 sm:h-28 sm:w-28" />
                  <p className="mt-4 text-xl font-black">Appel audio en cours</p>
                  <p className="mt-2 text-sm text-slate-300">{connectedParticipants.length || 1} participant(s) connecté(s)</p>
                </div>
              </div>
            )}
          </LiveKitRoom>
        </div>
        <div className={cn(
          "dtsc-call-controls flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 p-3 sm:gap-3 sm:p-4",
          isFullscreen && compactFullscreenUi && !focusControlsVisible && "dtsc-call-controls-hidden"
        )}>
          <Button type="button" variant="outline" onClick={() => setCallChatOpen((value) => !value)} className="rounded-full border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20">
            <MessageSquare className="h-4 w-4" />
            {t("calls.chat")}
          </Button>
          <Button type="button" variant="outline" onClick={() => { void setMicrophoneState(!microphoneEnabled); }} className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20">
            {microphoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {microphoneEnabled ? t("calls.microphoneOn") : t("calls.microphoneMuted")}
          </Button>
          {joinedCall.call.callType === "VIDEO" && (
            <Button type="button" variant="outline" onClick={() => { void setCameraState(!cameraEnabled); }} className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20">
              {cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {cameraEnabled ? t("calls.cameraOn") : t("calls.cameraOff")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => { void toggleScreenShare(); }} className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20">
            {screenShareEnabled ? <MonitorOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            {screenShareEnabled ? t("calls.stopScreenShare") : t("calls.shareScreen")}
          </Button>
          <Button type="button" variant="outline" onClick={() => { void toggleFullscreen(); }} className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? t("calls.exitFullscreen") : t("calls.fullscreen")}
          </Button>
          <Button type="button" onClick={() => { void onLeave(); }} className="rounded-full bg-red-600 text-white hover:bg-red-700">
            <PhoneOff className="h-4 w-4" />
            {t("calls.leave")}
          </Button>
          {canEnd && (
            <Button type="button" variant="outline" onClick={() => { void onEnd(); }} className="rounded-full border-red-300 bg-red-50 text-red-700 hover:bg-red-100">
              {t("calls.end")}
            </Button>
          )}
        </div>
      </section>
      <aside className="dtsc-call-sidebar min-h-0 border-t border-white/10 bg-white/5 p-3 md:border-l md:border-t-0 md:p-4">
        <h4 className="font-black">Participants connectés</h4>
        <div className="mt-3 max-h-[32vh] space-y-2 overflow-y-auto pr-1 md:max-h-[42vh]">
          {(connectedParticipants.length ? connectedParticipants : [{ userId: joinedCall.call.startedById, status: "JOINED" } as GroupCallParticipant]).map((participant) => {
            const member = group?.members.find((item) => item.userId === participant.userId);
            return (
              <div key={participant.userId} className="rounded-2xl bg-white/10 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <CallMemberAvatar member={member} className="h-9 w-9" />
                  <div className="min-w-0">
                    <p className="truncate font-black">{member?.user.name || "Participant DTSC"}</p>
                    <p className="mt-0.5 text-xs text-slate-300">{formatEnumLabel(participant.status)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-xs text-cyan-100">
          Connexion protégée. Les accès sont vérifiés automatiquement pour les membres autorisés.
        </p>
        <div className="mt-3 hidden md:block">
          <Button type="button" variant="outline" onClick={() => setCallChatOpen((value) => !value)} className="w-full rounded-2xl border-cyan-300/30 bg-white/10 text-cyan-100 hover:bg-white/15">
            <MessageSquare className="h-4 w-4" />
            {callChatOpen ? "Masquer le chat" : "Ouvrir le chat"}
          </Button>
        </div>
      </aside>
      {callChatOpen && group && (
        <div className="dtsc-call-chat-panel pointer-events-none absolute inset-0 z-20">
          <CallChatPanel
            group={group}
            callId={joinedCall.call.id}
            messages={messages}
            currentUserId={currentUserId}
            userPreferences={userPreferences}
            onClose={() => setCallChatOpen(false)}
            onMessageSent={onMessageSent}
          />
        </div>
      )}
    </div>
  );
}

function CallFullscreenFocusControls({
  focus,
  participants,
  group,
  t,
  onFocusChange,
}: {
  focus: FullscreenFocusTarget;
  participants: GroupCallParticipant[];
  group: Group | null;
  t: (key: string) => string;
  onFocusChange: (focus: FullscreenFocusTarget) => void;
}) {
  const participantTargets = participants.length
    ? participants
    : group?.members.filter((member) => member.status === "ACTIVE").map((member) => ({ userId: member.userId, status: "JOINED" } as GroupCallParticipant)) || [];

  return (
    <div data-call-focus-controls className="pointer-events-auto absolute left-3 right-3 top-3 z-30 rounded-2xl border border-cyan-300/30 bg-[#06111f]/82 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        <span className="shrink-0 px-2 text-[0.68rem] font-black uppercase tracking-[0.14em] text-cyan-200">
          {t("calls.fullscreenFocus")}
        </span>
        <button
          type="button"
          onClick={() => onFocusChange("auto")}
          className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition", focus === "auto" ? "bg-cyan-300 text-[#001736]" : "bg-white/10 text-slate-100 hover:bg-white/15")}
        >
          {t("calls.autoView")}
        </button>
        <button
          type="button"
          onClick={() => onFocusChange("screen")}
          className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition", focus === "screen" ? "bg-cyan-300 text-[#001736]" : "bg-white/10 text-slate-100 hover:bg-white/15")}
        >
          <MonitorUp className="h-3.5 w-3.5" />
          {t("calls.screenShareView")}
        </button>
        {participantTargets.map((participant) => {
          const member = group?.members.find((item) => item.userId === participant.userId);
          const target = `participant:${participant.userId}` as FullscreenFocusTarget;
          return (
            <button
              key={participant.userId}
              type="button"
              onClick={() => onFocusChange(target)}
              className={cn("inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-black transition", focus === target ? "bg-cyan-300 text-[#001736]" : "bg-white/10 text-slate-100 hover:bg-white/15")}
              title={`${t("calls.focusParticipant")} ${member?.user.name || "DTSC"}`}
            >
              <CallMemberAvatar member={member} className="h-6 w-6 border-white/20 text-[0.58rem]" />
              <span className="max-w-32 truncate">{member?.user.name || "Participant DTSC"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function applyLiveKitFullscreenFocus(root: HTMLElement, focus: FullscreenFocusTarget, group: Group | null) {
  root.removeAttribute("data-dtsc-focus-ready");
  const tiles = Array.from(root.querySelectorAll<HTMLElement>(".lk-participant-tile"));
  tiles.forEach((tile) => tile.classList.remove("dtsc-focus-selected"));

  if (focus === "auto") {
    return true;
  }

  const selectedTile = focus === "screen"
    ? findLiveKitScreenShareTile(root, tiles)
    : findLiveKitParticipantTile(tiles, focus.slice("participant:".length), group);

  if (!selectedTile) {
    return false;
  }

  selectedTile.classList.add("dtsc-focus-selected");
  root.setAttribute("data-dtsc-focus-ready", "true");
  return true;
}

function findLiveKitScreenShareTile(root: HTMLElement, tiles: HTMLElement[]) {
  const sourceNode = Array.from(root.querySelectorAll<HTMLElement>("[data-lk-source]")).find((node) => {
    const source = node.getAttribute("data-lk-source") || "";
    return normalizeSearchText(source).includes("screen") || normalizeSearchText(source).includes("share");
  });
  const tileFromSource = sourceNode?.closest<HTMLElement>(".lk-participant-tile");
  if (tileFromSource) {
    return tileFromSource;
  }

  return tiles.find((tile) => {
    const text = normalizeSearchText(tile.textContent || "");
    return text.includes("screen") || text.includes("share") || text.includes("partage");
  }) || null;
}

function findLiveKitParticipantTile(tiles: HTMLElement[], userId: string, group: Group | null) {
  const member = group?.members.find((item) => item.userId === userId);
  const candidates = [userId, member?.user.id, member?.user.email, member?.user.name]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeSearchText(value))
    .filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  return tiles.find((tile) => {
    const attributeValues = collectLiveKitTileAttributeValues(tile);
    const text = normalizeSearchText(tile.textContent || "");
    return candidates.some((candidate) => attributeValues.includes(candidate) || (candidate.length > 2 && text.includes(candidate)));
  }) || null;
}

function collectLiveKitTileAttributeValues(tile: HTMLElement) {
  const values = new Set<string>();
  const nodes = [tile, ...Array.from(tile.querySelectorAll<HTMLElement>("*"))];
  nodes.forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      if (attribute.name.startsWith("data-lk-") || attribute.name === "aria-label" || attribute.name === "title") {
        const normalized = normalizeSearchText(attribute.value);
        if (normalized) {
          values.add(normalized);
        }
      }
    });
  });
  return Array.from(values);
}

function CallMemberAvatar({
  member,
  className = "h-10 w-10",
  fallbackIcon,
}: {
  member?: GroupMember;
  className?: string;
  fallbackIcon?: ReactNode;
}) {
  const initials = member?.user.name ? member.user.name.slice(0, 2).toUpperCase() : "DT";
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-300/40 bg-cyan-300/15 text-xs font-black text-cyan-100", className)}>
      {member?.user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : fallbackIcon ? (
        fallbackIcon
      ) : (
        initials
      )}
    </span>
  );
}

function CallParticipantAvatarStyles({ group }: { group: Group | null }) {
  const avatarRules = (group?.members || [])
    .filter((member) => Boolean(member.user.avatarUrl))
    .map((member) => {
      const identity = cssAttributeValue(member.userId);
      const avatarUrl = JSON.stringify(member.user.avatarUrl || "");
      return `.dtsc-livekit-room [data-lk-participant-identity="${identity}"] .lk-participant-placeholder{background-image:url(${avatarUrl});background-size:cover;background-position:center;}`;
    })
    .join("\n");

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          .dtsc-livekit-room .lk-participant-placeholder svg{display:none!important;}
          .dtsc-livekit-room .lk-participant-placeholder{width:clamp(4.25rem,18vw,8rem)!important;height:clamp(4.25rem,18vw,8rem)!important;max-width:42%!important;max-height:42%!important;border-radius:999px!important;border:1px solid rgba(34,211,238,.34)!important;background-color:rgba(34,211,238,.14)!important;box-shadow:0 18px 54px rgba(0,23,54,.28)!important;}
          ${avatarRules}
        `,
      }}
    />
  );
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function CallChatPanel({
  group,
  callId,
  messages,
  currentUserId,
  userPreferences,
  onClose,
  onMessageSent,
}: {
  group: Group;
  callId: string;
  messages: GroupMessage[];
  currentUserId: string;
  userPreferences: UserDatePreferences;
  onClose: () => void;
  onMessageSent: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [panelRect, setPanelRect] = useState({ x: 12, y: 76, width: 340, height: 520 });
  const panelRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<{
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    initial: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const visibleMessages = messages.filter((message) => message.messageType !== "SYSTEM").slice(-24);
  const visibleMessageCount = visibleMessages.length;
  const t = (key: string) => translate(userPreferences.locale, key);
  const mentionSuggestions = useMemo(() => {
    const match = content.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) {
      return [];
    }
    const query = match[1].toLowerCase();
    return group.members
      .filter((member) => member.user.name.toLowerCase().includes(query) || member.user.email.toLowerCase().includes(query))
      .slice(0, 5);
  }, [content, group.members]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [visibleMessageCount]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const bounds = chatPanelBounds(panelRef.current);
      setPanelRect(clampChatPanelRect(initialChatPanelRect(bounds), bounds));
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction) {
        return;
      }
      const bounds = chatPanelBounds(panelRef.current);
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      if (interaction.mode === "drag") {
        setPanelRect(clampChatPanelRect({
          ...interaction.initial,
          x: interaction.initial.x + deltaX,
          y: interaction.initial.y + deltaY,
        }, bounds));
      } else {
        setPanelRect(clampChatPanelRect({
          ...interaction.initial,
          width: interaction.initial.width + deltaX,
          height: interaction.initial.height + deltaY,
        }, bounds));
      }
    }

    function handlePointerUp() {
      interactionRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  function startPanelInteraction(event: ReactPointerEvent<HTMLElement>, mode: "drag" | "resize") {
    event.preventDefault();
    interactionRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      initial: panelRect,
    };
    document.body.style.cursor = mode === "drag" ? "grabbing" : "nwse-resize";
    document.body.style.userSelect = "none";
  }

  function insertMention(member: GroupMember) {
    setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${member.user.name} `));
    setMentionedUserIds((current) => [...new Set([...current, member.userId])]);
  }

  async function sendCallMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || sending) {
      return;
    }
    setSending(true);
    const response = await fetch(`/api/collaborators/groups/${group.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: trimmedContent,
        messageType: "TEXT",
        mentionedUserIds,
      }),
    });
    setSending(false);
    if (response.ok) {
      setContent("");
      setMentionedUserIds([]);
      await onMessageSent();
    }
  }

  return (
    <section
      ref={panelRef}
      className="pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-cyan-300/30 bg-[#071427]/96 text-white shadow-[0_22px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
      style={{
        left: panelRect.x,
        top: panelRect.y,
        width: panelRect.width,
        height: panelRect.height,
      }}
    >
      <div
        onPointerDown={(event) => startPanelInteraction(event, "drag")}
        className="flex shrink-0 cursor-grab touch-none items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 active:cursor-grabbing"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{t("calls.callChatTitle")}</p>
          <p className="truncate text-[0.68rem] font-semibold text-slate-300">{t("calls.chatPersistedIn")} {group.name}</p>
        </div>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="rounded-full p-2 text-slate-300 hover:bg-white/10" aria-label={t("calls.closeCallChat")}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-gutter:stable]">
        {visibleMessages.map((message) => {
          const isCurrentUser = message.authorId === currentUserId;
          const receiptStatus = getMessageReadReceiptStatus(message, group, currentUserId);
          return (
            <div key={`${callId}-${message.id}`} className={cn("flex", isCurrentUser ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-5", isCurrentUser ? "bg-cyan-400 text-[#001736]" : "bg-white/10 text-slate-100")}>
                <p className={cn("mb-1 font-black", isCurrentUser ? "text-[#002b5b]" : "text-cyan-200")}>{isCurrentUser ? t("calls.you") : message.author.name}</p>
                <p className="whitespace-pre-wrap">{message.deletedAt ? "Message supprimé." : message.content}</p>
                <p className={cn("mt-1 text-[0.62rem] font-semibold", isCurrentUser ? "text-[#002b5b]/70" : "text-slate-400")}>
                  {formatRelativeUserDateTime(message.createdAt, userPreferences)}
                  {receiptStatus && (
                    <span className="ml-1 inline-flex align-middle">
                      <MessageReadReceipt status={receiptStatus} locale={userPreferences.locale} compact />
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        {!visibleMessages.length && (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs font-semibold text-slate-300">
            {t("calls.emptyCallChat")}
          </p>
        )}
      </div>
      <form onSubmit={sendCallMessage} className="relative shrink-0 border-t border-white/10 p-2.5">
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-[4.5rem] left-2 right-2 z-20 rounded-2xl border border-white/10 bg-[#0b1f35] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
            {mentionSuggestions.map((member) => (
              <button key={member.id} type="button" onClick={() => insertMention(member)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-[0.62rem] font-black text-[#001736]">{member.user.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block truncate font-black">{member.user.name}</span>
                  <span className="block truncate text-slate-400">{member.user.jobTitle || member.user.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 p-1.5">
          <Input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t("calls.callChatPlaceholder")}
            className="h-10 border-0 bg-transparent text-white placeholder:text-slate-400 focus-visible:ring-0"
          />
          <Button type="submit" size="icon" disabled={!content.trim() || sending} className="h-10 w-10 shrink-0 rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
      <button
        type="button"
        onPointerDown={(event) => startPanelInteraction(event, "resize")}
        className="absolute bottom-1.5 right-1.5 h-5 w-5 cursor-nwse-resize touch-none rounded-br-[1rem] border-b-2 border-r-2 border-cyan-200/70 opacity-80"
        aria-label={t("calls.resizeCallChat")}
      />
    </section>
  );
}

function initialChatPanelRect(bounds: { width: number; height: number }) {
  const isCompact = bounds.width < 720;
  const width = Math.min(isCompact ? bounds.width - 24 : 380, Math.max(280, bounds.width - 24));
  const height = Math.min(isCompact ? bounds.height - 116 : 560, Math.max(320, bounds.height - 96));
  return {
    x: isCompact ? 12 : Math.max(12, bounds.width - width - 16),
    y: isCompact ? 76 : 16,
    width,
    height,
  };
}

function chatPanelBounds(panel: HTMLElement | null) {
  const parent = panel?.parentElement;
  const rect = parent?.getBoundingClientRect();
  return {
    width: Math.max(rect?.width || 360, 320),
    height: Math.max(rect?.height || 620, 360),
  };
}

function clampChatPanelRect(
  rect: { x: number; y: number; width: number; height: number },
  bounds: { width: number; height: number }
) {
  const minWidth = Math.min(280, bounds.width - 24);
  const minHeight = Math.min(300, bounds.height - 24);
  const maxWidth = Math.max(minWidth, bounds.width - 24);
  const maxHeight = Math.max(minHeight, bounds.height - 24);
  const width = Math.min(Math.max(rect.width, minWidth), maxWidth);
  const height = Math.min(Math.max(rect.height, minHeight), maxHeight);
  return {
    x: Math.min(Math.max(rect.x, 12), Math.max(12, bounds.width - width - 12)),
    y: Math.min(Math.max(rect.y, 12), Math.max(12, bounds.height - height - 12)),
    width,
    height,
  };
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

function callDurationFromStart(startedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function callDurationBetween(startedAt: string, endedAt?: string | null) {
  if (!endedAt) {
    return callDurationFromStart(startedAt);
  }
  return Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
}

function formatCallDurationFromStart(startedAt: string) {
  return formatCallDuration(callDurationFromStart(startedAt));
}

function formatCallDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}` : `${pad(minutes)}:${pad(remainingSeconds)}`;
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
