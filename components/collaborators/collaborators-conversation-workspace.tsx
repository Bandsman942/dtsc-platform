"use client";

import {
  Archive,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Copy,
  Eye,
  Heart,
  History,
  ImagePlus,
  Info,
  MessageCircle,
  Pencil,
  Phone,
  Pin,
  Settings,
  Trash2,
  UserPlus,
  UsersRound,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ConversationAvatar } from "@/components/chat/ConversationAvatar";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { ConversationListItem } from "@/components/chat/ConversationListItem";
import { FloatingActionButton } from "@/components/chat/FloatingActionButton";
import { SearchBar } from "@/components/chat/SearchBar";
import { VoiceConversationComposer } from "@/components/chat/VoiceConversationComposer";
import {
  CollaborationMeetingMessageContent,
  type CollaborationMeetingFollowUpView,
  type CollaborationMeetingLinkView,
} from "@/components/collaborators/collaboration-meeting-message-content";
import { GroupPresenceJournalDialog } from "@/components/collaborators/group-presence-journal-dialog";
import { CollaboratorsWorkspace } from "@/components/collaborators/collaborators-workspace";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { collaborationExperienceT } from "@/lib/collaboration-experience-i18n";
import { formatRelativeUserDateTime, formatUserDateTime, type UserDatePreferences } from "@/lib/user-format";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string; email: string; avatarUrl?: string | null; jobTitle?: string | null; role?: string; lastSeenAt?: string | null };
type GroupMember = { id: string; role: string; status: string; userId: string; joinedAt: string; user: UserOption };
type GroupCallParticipant = { id: string; userId: string; status: string; joinedAt?: string | null; leftAt?: string | null; microphoneEnabled: boolean; cameraEnabled: boolean };
type GroupCall = { id: string; groupId: string; meetingId?: string | null; callType: "AUDIO" | "VIDEO"; status: string; startedById: string; startedAt: string; endedAt?: string | null; durationSeconds?: number | null; participants?: GroupCallParticipant[] };
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
  messages: Array<{ id: string; content: string; messageType?: string; createdAt: string; author: { name: string } }>;
  calls?: GroupCall[];
  _count?: { messages: number; members: number };
};
type Invitation = { id: string; group: { id: string; name: string; description?: string | null }; invitedBy: { name: string }; invitationMessage?: string | null; createdAt: string };
type ConversationOption = { id: string; title: string; updatedAt: string; _count?: { messages: number } };
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
  mentions?: Array<{ mentionedUser: { id: string; name: string } }>;
  reads?: Array<{ userId: string; readAt: string }>;
  receiptSummary?: { recipientCount: number; deliveredCount: number; readCount: number; allDelivered: boolean; allRead: boolean };
  meetingLink?: CollaborationMeetingLinkView | null;
  meetingFollowUp?: CollaborationMeetingFollowUpView | null;
};
type Preference = { groupId: string; userId: string; pinned: boolean; favorite: boolean; archived: boolean; notifications: "ALL" | "MENTIONS" | "NONE"; mutedUntil?: string | null };
type Story = { id: string; groupId: string; authorId: string; caption?: string | null; createdAt: string; expiresAt: string; imageUrl?: string | null };
type Voice = { id: string; messageId: string; authorId: string; durationMs: number; waveform?: unknown; createdAt: string; audioUrl?: string | null };
type Filter = "ALL" | "UNREAD" | "FAVORITES" | "GROUPS" | "ARCHIVED";
type ReadInfo = {
  readBy: Array<{ user: UserOption; readAt: string }>;
  unreadBy: Array<{ user: UserOption }>;
};
type Props = {
  currentUserId: string;
  initialActiveGroupId?: string | null;
  initialJoinCallId?: string | null;
  userPreferences: UserDatePreferences;
  initialGroups: Group[];
  initialInvitations: Invitation[];
  users: UserOption[];
  conversations: ConversationOption[];
  callPreferences: CallPreferences;
};

const GROUP_TYPES = ["COMPANY", "PROJECT", "INTERNAL", "CLIENT", "CROSS_ORGANIZATION", "PRIVATE_NETWORK", "OTHER"];

export function CollaboratorsConversationWorkspace(props: Props) {
  const { currentUserId, initialActiveGroupId, initialJoinCallId, userPreferences, users } = props;
  const t = useCallback((key: Parameters<typeof collaborationExperienceT>[1]) => collaborationExperienceT(userPreferences.locale, key), [userPreferences.locale]);
  const [groups, setGroups] = useState(props.initialGroups);
  const [invitations, setInvitations] = useState(props.initialInvitations);
  const [activeGroupId, setActiveGroupId] = useState(initialActiveGroupId && props.initialGroups.some((group) => group.id === initialActiveGroupId) ? initialActiveGroupId : "");
  const [mobileListOpen, setMobileListOpen] = useState(!initialActiveGroupId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [profiles, setProfiles] = useState<Record<string, string | null>>({});
  const [preferences, setPreferences] = useState<Record<string, Preference>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [voices, setVoices] = useState<Record<string, Voice>>({});
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [groupDialog, setGroupDialog] = useState<"create" | "edit" | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [presenceJournalOpen, setPresenceJournalOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialJoinCallId));
  const [editMessage, setEditMessage] = useState<GroupMessage | null>(null);
  const [editContent, setEditContent] = useState("");
  const [readInfo, setReadInfo] = useState<ReadInfo | null>(null);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  useToastMessage(feedback);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const activeMembership = activeGroup?.members.find((member) => member.userId === currentUserId) || null;
  const currentUserRole = users.find((user) => user.id === currentUserId)?.role;
  const canManage = Boolean(activeMembership && (activeMembership.role === "OWNER" || activeMembership.role === "ADMIN" || currentUserRole === "ADMIN"));
  const isOwner = activeMembership?.role === "OWNER";
  const activePreference = activeGroup ? preferences[activeGroup.id] || defaultPreference(activeGroup.id, currentUserId) : null;
  const voiceByMessage = voices;

  const refreshGroups = useCallback(async () => {
    const response = await fetch("/api/collaborators/groups", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { groups?: Group[]; invitations?: Invitation[] };
    setGroups(body.groups || []);
    setInvitations(body.invitations || []);
  }, []);

  const loadExperience = useCallback(async () => {
    const response = await fetch("/api/collaborators/groups/experience", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { profiles?: Array<{ groupId: string; avatarUrl?: string | null }>; preferences?: Preference[]; stories?: Story[] };
    setProfiles(Object.fromEntries((body.profiles || []).map((item) => [item.groupId, item.avatarUrl || null])));
    setPreferences(Object.fromEntries((body.preferences || []).map((item) => [item.groupId, item])));
    setStories(body.stories || []);
  }, []);

  const loadMessages = useCallback(async (groupId: string, cursor?: string | null) => {
    if (!groupId) return;
    if (cursor) setLoadingOlder(true);
    const params = new URLSearchParams({ limit: "30" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages?${params.toString()}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { messages?: GroupMessage[]; nextCursor?: string | null; hasMore?: boolean } | null;
    if (response.ok && body) {
      setMessages((current) => cursor ? [...(body.messages || []), ...current] : body.messages || []);
      setNextCursor(body.nextCursor || null);
      setHasMore(Boolean(body.hasMore));
      if (!cursor) setGroups((current) => current.map((group) => group.id === groupId ? { ...group, unreadMessageCount: 0, unreadMentionCount: 0, unreadMentionPreview: null } : group));
    }
    setLoadingOlder(false);
  }, []);

  const loadVoices = useCallback(async (groupId: string) => {
    if (!groupId) return setVoices({});
    const response = await fetch(`/api/collaborators/groups/${groupId}/voice`, { cache: "no-store" });
    if (!response.ok) return setVoices({});
    const body = await response.json() as { voices?: Voice[] };
    setVoices(Object.fromEntries((body.voices || []).map((voice) => [voice.messageId, voice])));
  }, []);

  useEffect(() => { void loadExperience(); }, [loadExperience]);
  useEffect(() => {
    if (!activeGroupId) { setMessages([]); setVoices({}); return; }
    setNextCursor(null);
    setHasMore(false);
    void Promise.all([loadMessages(activeGroupId), loadVoices(activeGroupId)]);
  }, [activeGroupId, loadMessages, loadVoices]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshGroups();
      if (activeGroupId) void Promise.all([loadMessages(activeGroupId), loadVoices(activeGroupId)]);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [activeGroupId, loadMessages, loadVoices, refreshGroups]);
  useEffect(() => {
    const element = messageListRef.current;
    if (element && messages.length) element.scrollTop = element.scrollHeight;
  }, [activeGroupId, messages.length]);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((group) => {
        const preference = preferences[group.id] || defaultPreference(group.id, currentUserId);
        if (filter === "ARCHIVED") return preference.archived;
        if (preference.archived) return false;
        if (filter === "UNREAD" && !(group.unreadMessageCount || group.unreadMentionCount)) return false;
        if (filter === "FAVORITES" && !preference.favorite) return false;
        if (filter === "GROUPS" && group.members.length <= 2) return false;
        if (!needle) return true;
        return `${group.name} ${group.description || ""} ${group.members.map((member) => member.user.name).join(" ")}`.toLowerCase().includes(needle);
      })
      .sort((left, right) => Number(Boolean(preferences[right.id]?.pinned)) - Number(Boolean(preferences[left.id]?.pinned)));
  }, [currentUserId, filter, groups, preferences, query]);

  const activeStories = useMemo(() => {
    const firstByGroup = new Map<string, Story>();
    for (const story of stories) if (!firstByGroup.has(story.groupId)) firstByGroup.set(story.groupId, story);
    return [...firstByGroup.values()].filter((story) => groups.some((group) => group.id === story.groupId));
  }, [groups, stories]);

  const mentionSuggestions = useMemo(() => {
    if (!activeGroup) return [];
    const match = content.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) return [];
    const value = match[1].toLowerCase();
    return activeGroup.members.filter((member) => member.user.name.toLowerCase().includes(value) || member.user.email.toLowerCase().includes(value)).slice(0, 6);
  }, [activeGroup, content]);

  async function sendText() {
    if (!activeGroup || !content.trim() || sending) return;
    setSending(true);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim(), mentionedUserIds, messageType: "TEXT", replyToId: replyTo?.id || "" }),
    });
    setSending(false);
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to send message." : "Impossible d’envoyer le message.");
    setContent("");
    setMentionedUserIds([]);
    setReplyTo(null);
    await Promise.all([loadMessages(activeGroup.id), refreshGroups()]);
  }

  async function sendVoice(payload: { blob: Blob; durationMs: number; waveform: number[] }) {
    if (!activeGroup || sending) return;
    setSending(true);
    const form = new FormData();
    const mime = payload.blob.type.toLowerCase();
    const extension = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("3gpp") ? "3gp" : mime.includes("wav") ? "wav" : "webm";
    form.append("file", new File([payload.blob], `voice.${extension}`, { type: payload.blob.type || "audio/webm" }));
    form.append("durationMs", String(payload.durationMs));
    form.append("waveform", JSON.stringify(payload.waveform));
    if (replyTo?.id) form.append("replyToId", replyTo.id);
    try {
      const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/voice`, { method: "POST", body: form });
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || t("voiceError"));
      setReplyTo(null);
      await Promise.all([loadMessages(activeGroup.id), loadVoices(activeGroup.id), refreshGroups()]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("voiceError"));
    } finally {
      setSending(false);
    }
  }

  function insertMention(member: GroupMember) {
    setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${member.user.name} `));
    setMentionedUserIds((current) => [...new Set([...current, member.userId])]);
  }

  async function updatePreference(groupId: string, patch: Partial<Preference>) {
    const response = await fetch(`/api/collaborators/groups/${groupId}/preferences`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to update settings." : "Impossible de mettre à jour les paramètres.");
    await loadExperience();
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endpoint = groupDialog === "edit" && activeGroup ? `/api/collaborators/groups/${activeGroup.id}` : "/api/collaborators/groups";
    const response = await fetch(endpoint, { method: groupDialog === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => null) as { group?: { id: string }; message?: string } | null;
    if (!response.ok) return setFeedback(body?.message || (userPreferences.locale === "en" ? "Unable to save group." : "Impossible d’enregistrer le groupe."));
    setGroupDialog(null);
    await refreshGroups();
    if (body?.group?.id) { setActiveGroupId(body.group.id); setMobileListOpen(false); }
  }

  async function respondInvitation(id: string, action: "ACCEPT" | "DECLINE") {
    const response = await fetch(`/api/collaborators/invitations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (response.ok) await refreshGroups();
  }

  async function inviteMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitedUserIds: selectedInviteUserIds, invitedEmails: String(form.get("invitedEmails") || ""), invitationMessage: String(form.get("invitationMessage") || "") }),
    });
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to send invitations." : "Impossible d’envoyer les invitations.");
    setInviteOpen(false); setSelectedInviteUserIds([]); setInviteSearch("");
    await refreshGroups();
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/profile-photo`, { method: "POST", body: form });
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to update group photo." : "Impossible de modifier la photo du groupe.");
    setPhotoOpen(false);
    await Promise.all([loadExperience(), loadMessages(activeGroup.id)]);
  }

  async function publishStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup) return;
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/stories`, { method: "POST", body: new FormData(event.currentTarget) });
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to publish status." : "Impossible de publier le statut.");
    setStoryOpen(false);
    await loadExperience();
  }

  async function editCurrentMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editMessage || !editContent.trim()) return;
    const response = await fetch(`/api/collaborators/messages/${editMessage.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editContent.trim(), status: "EDITED", mentionedUserIds: [] }) });
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to edit message." : "Impossible de modifier le message.");
    setEditMessage(null); setEditContent("");
    if (activeGroup) await loadMessages(activeGroup.id);
  }

  async function deleteMessage(message: GroupMessage) {
    if (!window.confirm(userPreferences.locale === "en" ? "Delete this message?" : "Supprimer ce message ?")) return;
    const response = await fetch(`/api/collaborators/messages/${message.id}`, { method: "DELETE" });
    if (response.ok && activeGroup) await Promise.all([loadMessages(activeGroup.id), refreshGroups()]);
  }

  async function openReadInfo(messageId: string) {
    const response = await fetch(`/api/collaborators/messages/${messageId}/reads`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { readBy?: Array<{ user: UserOption; readAt: string }>; unreadBy?: Array<{ user: UserOption }> } | null;
    if (response.ok && body) setReadInfo({ readBy: body.readBy || [], unreadBy: body.unreadBy || [] });
  }

  async function leaveOrDeleteGroup() {
    if (!activeGroup) return;
    const prompt = isOwner ? (userPreferences.locale === "en" ? "Delete this group?" : "Supprimer ce groupe ?") : (userPreferences.locale === "en" ? "Leave this group?" : "Quitter ce groupe ?");
    if (!window.confirm(prompt)) return;
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}`, { method: "DELETE" });
    if (!response.ok) return setFeedback(userPreferences.locale === "en" ? "Unable to apply action." : "Action impossible.");
    setActiveGroupId(""); setMobileListOpen(true);
    await refreshGroups();
  }

  function selectGroup(groupId: string) {
    setActiveGroupId(groupId);
    setMobileListOpen(false);
  }

  const groupMenu = activeGroup && activePreference ? buildGroupMenu({
    activeGroup,
    activePreference,
    canManage,
    isOwner,
    t,
    onInfo: () => setInfoOpen(true),
    onFavorite: () => void updatePreference(activeGroup.id, { favorite: !activePreference.favorite }),
    onPin: () => void updatePreference(activeGroup.id, { pinned: !activePreference.pinned }),
    onArchive: () => void updatePreference(activeGroup.id, { archived: !activePreference.archived }),
    onNotifications: () => setNotificationsOpen(true),
    onPresenceJournal: () => setPresenceJournalOpen(true),
    onPhoto: () => setPhotoOpen(true),
    onStory: () => setStoryOpen(true),
    onInvite: () => setInviteOpen(true),
    onSettings: () => setGroupDialog("edit"),
    onCalls: () => setAdvancedOpen(true),
    onLeave: () => void leaveOrDeleteGroup(),
  }) : [];

  if (advancedOpen) {
    return (
      <div className="fixed inset-0 z-[1100] overflow-hidden bg-dtsc-page">
        <div className="flex h-14 items-center justify-between border-b border-dtsc-border bg-dtsc-surface px-3">
          <p className="font-black text-dtsc-ink">{t("advanced")}</p>
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => setAdvancedOpen(false)} aria-label={t("close")}><X className="h-4 w-4" /></Button>
        </div>
        <div className="h-[calc(100dvh-3.5rem)] overflow-hidden">
          <CollaboratorsWorkspace {...props} initialActiveGroupId={activeGroupId || props.initialActiveGroupId} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid h-[calc(100dvh-7.25rem)] min-w-0 overflow-hidden bg-dtsc-surface sm:h-[calc(100dvh-8rem)] lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className={cn("relative h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-dtsc-border bg-dtsc-surface", activeGroup && !mobileListOpen ? "hidden lg:flex" : "flex")}>
        <div className="shrink-0 px-3 pb-2 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">{t("title")}</p><h2 className="truncate text-xl font-black text-dtsc-ink">{t("groups")}</h2></div>
            <Button type="button" size="icon" onClick={() => setGroupDialog("create")} className="h-11 w-11 rounded-full bg-[#002b5b] text-white lg:hidden" aria-label={t("newGroup")}><MessageCircle className="h-5 w-5" /></Button>
          </div>
          {activeStories.length ? (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeStories.map((story) => {
                const group = groups.find((item) => item.id === story.groupId);
                if (!group) return null;
                return <button key={story.id} type="button" onClick={() => setSelectedStory(story)} className="w-16 shrink-0 text-center"><span className="mx-auto block rounded-full bg-gradient-to-tr from-cyan-500 via-blue-600 to-fuchsia-500 p-[2px]"><span className="block rounded-full bg-dtsc-surface p-[2px]"><ConversationAvatar title={group.name} avatarUrl={profiles[group.id]} type="group" className="h-11 w-11" /></span></span><span className="mt-1 block truncate text-[0.65rem] font-bold text-dtsc-muted">{group.name}</span></button>;
              })}
            </div>
          ) : null}
          <div className="mt-3"><SearchBar value={query} onChange={setQuery} placeholder={t("search")} /></div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["ALL", "UNREAD", "FAVORITES", "GROUPS", "ARCHIVED"] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition", filter === item ? "border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft")}>{item === "ALL" ? t("all") : item === "UNREAD" ? t("unread") : item === "FAVORITES" ? t("favorites") : item === "GROUPS" ? t("groupsFilter") : t("archived")}</button>)}
          </div>
        </div>

        {invitations.length ? <div className="mx-3 mb-2 max-h-36 shrink-0 overflow-y-auto rounded-2xl border border-cyan-300/60 bg-cyan-400/10 p-2 sm:mx-4">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-2 py-1.5 text-xs"><span className="min-w-0 flex-1"><strong className="block truncate text-dtsc-ink">{invitation.group.name}</strong><span className="text-dtsc-muted">{t("invitation")} · {invitation.invitedBy.name}</span></span><Button type="button" size="icon" className="h-8 w-8 rounded-full" onClick={() => void respondInvitation(invitation.id, "ACCEPT")} aria-label={t("accept")}><Check className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => void respondInvitation(invitation.id, "DECLINE")} aria-label={t("decline")}><X className="h-3.5 w-3.5" /></Button></div>)}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-20 sm:px-3 lg:pb-3">
          {visibleGroups.map((group) => {
            const latest = group.messages[0];
            const preference = preferences[group.id] || defaultPreference(group.id, currentUserId);
            const activeCall = group.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE");
            const preview = activeCall ? `${activeCall.callType === "VIDEO" ? "Vidéo" : "Audio"} · ${t("online")}` : group.unreadMentionPreview || (latest ? `${latest.author.name}: ${latest.content}` : group.description || t("noMessage"));
            return <div key={group.id} className="relative"><ConversationListItem id={group.id} title={`${preference.pinned ? "📌 " : ""}${group.name}`} preview={preview} timestamp={latest ? formatRelativeUserDateTime(latest.createdAt, userPreferences) : undefined} avatarUrl={profiles[group.id]} unreadCount={group.unreadMessageCount} mentionCount={group.unreadMentionCount} isActive={activeGroupId === group.id} type="group" onClick={() => selectGroup(group.id)} />{preference.favorite ? <Heart className="pointer-events-none absolute right-2 top-9 h-3 w-3 fill-current text-cyan-600" /> : null}</div>;
          })}
          {!visibleGroups.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-dtsc-muted">{t("noGroup")}</p> : null}
        </div>
        <FloatingActionButton label={t("newGroup")} onClick={() => setGroupDialog("create")} className="hidden lg:inline-flex" />
      </aside>

      <main className={cn("h-full min-h-0 min-w-0 flex-col overflow-hidden bg-dtsc-page", activeGroup && !mobileListOpen ? "flex" : "hidden lg:flex")}>
        {activeGroup ? (
          <>
            <ConversationHeader title={activeGroup.name} subtitle={`${activeGroup.members.length} ${t("members")} · ${activeGroup.groupType.replaceAll("_", " ")}`} avatarUrl={profiles[activeGroup.id]} type="group" onBack={() => setMobileListOpen(true)} onTitleClick={() => setInfoOpen(true)} actions={<><Button type="button" variant="outline" size="icon" className="hidden rounded-full sm:inline-flex" onClick={() => setAdvancedOpen(true)} aria-label="Audio"><Phone className="h-4 w-4" /></Button><Button type="button" variant="outline" size="icon" className="hidden rounded-full sm:inline-flex" onClick={() => setAdvancedOpen(true)} aria-label="Video"><Video className="h-4 w-4" /></Button><ActionMenu label="Actions du groupe" items={groupMenu} /></>} />
            <div ref={messageListRef} className="min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
              {hasMore ? <div className="flex justify-center"><Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={() => void loadMessages(activeGroup.id, nextCursor)}>{loadingOlder ? "…" : userPreferences.locale === "en" ? "Older messages" : "Messages précédents"}</Button></div> : null}
              {messages.map((message) => <MessageBubble key={message.id} message={message} voice={voiceByMessage[message.id]} currentUserId={currentUserId} userPreferences={userPreferences} canManage={canManage} t={t} onReply={setReplyTo} onEdit={(item) => { setEditMessage(item); setEditContent(item.content); }} onDelete={(item) => void deleteMessage(item)} onInfo={(id) => void openReadInfo(id)} onMeetingChanged={() => loadMessages(activeGroup.id)} onError={setFeedback} />)}
              {!messages.length ? <p className="py-12 text-center text-sm font-semibold text-dtsc-muted">{t("noMessage")}</p> : null}
            </div>
            <VoiceConversationComposer value={content} onChange={setContent} onSendText={sendText} onSendVoice={sendVoice} sending={sending} placeholder={t("writeMessage")} onError={setFeedback} labels={{ record: t("record"), cancel: t("cancel"), send: t("send"), recording: t("recording") }} before={<>{replyTo ? <div className="mb-2 flex items-center gap-2 rounded-xl border border-cyan-300/50 bg-cyan-400/10 px-3 py-2 text-xs"><span className="min-w-0 flex-1"><strong>{t("reply")} · {replyTo.author.name}</strong><span className="block truncate text-dtsc-muted">{replyTo.deletedAt ? "—" : replyTo.content}</span></span><button type="button" onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></button></div> : null}{mentionSuggestions.length ? <div className="absolute bottom-20 left-3 z-20 w-[min(28rem,calc(100%-1.5rem))] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-xl">{mentionSuggestions.map((member) => <button key={member.id} type="button" onClick={() => insertMention(member)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-dtsc-soft"><ConversationAvatar title={member.user.name} avatarUrl={member.user.avatarUrl} className="h-8 w-8" /><span className="min-w-0"><strong className="block truncate text-sm text-dtsc-ink">{member.user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{member.user.jobTitle || member.user.email}</span></span></button>)}</div> : null}</>} className="relative" />
          </>
        ) : <div className="flex h-full items-center justify-center p-6 text-center"><div><UsersRound className="mx-auto h-12 w-12 text-cyan-600" /><p className="mt-4 font-black text-dtsc-ink">{t("noConversation")}</p></div></div>}
      </main>

      <Dialog open={groupDialog !== null} title={groupDialog === "edit" ? t("groupSettings") : t("newGroup")} onClose={() => setGroupDialog(null)}><form onSubmit={saveGroup} className="grid gap-4"><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("name")}<Input name="name" defaultValue={groupDialog === "edit" ? activeGroup?.name : ""} required /></label><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("description")}<textarea name="description" defaultValue={groupDialog === "edit" ? activeGroup?.description || "" : ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3" /></label><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("type")}<select name="groupType" defaultValue={groupDialog === "edit" ? activeGroup?.groupType : "PROJECT"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3">{GROUP_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("visibility")}<select name="visibility" defaultValue={groupDialog === "edit" ? activeGroup?.visibility || "PRIVATE" : "PRIVATE"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3"><option value="PRIVATE">PRIVATE</option><option value="COMPANY">COMPANY</option><option value="INTERNAL">INTERNAL</option></select></label><Button type="submit">{groupDialog === "edit" ? t("save") : t("create")}</Button></form></Dialog>

      <Dialog open={infoOpen} title={t("groupInfo")} onClose={() => setInfoOpen(false)}>{activeGroup ? <div className="grid gap-4"><div className="flex items-center gap-4"><ConversationAvatar title={activeGroup.name} avatarUrl={profiles[activeGroup.id]} type="group" className="h-16 w-16" /><div className="min-w-0"><h3 className="truncate text-xl font-black text-dtsc-ink">{activeGroup.name}</h3><p className="text-sm text-dtsc-muted">{activeGroup.description || activeGroup.groupType}</p></div></div><div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-wider text-dtsc-muted">{activeGroup.members.length} {t("members")}</p><div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{activeGroup.members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-dtsc-soft"><ConversationAvatar title={member.user.name} avatarUrl={member.user.avatarUrl} isOnline={isOnline(member.user.lastSeenAt)} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{member.user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{member.role} · {member.user.jobTitle || member.user.email}</span></span></div>)}</div></div></div> : null}</Dialog>

      <Dialog open={inviteOpen} title={t("invite")} onClose={() => setInviteOpen(false)}><form onSubmit={inviteMembers} className="grid gap-3"><SearchBar value={inviteSearch} onChange={setInviteSearch} placeholder={t("search")} /><div className="max-h-60 overflow-y-auto rounded-xl border border-dtsc-border p-2">{users.filter((user) => !activeGroup?.members.some((member) => member.userId === user.id)).filter((user) => `${user.name} ${user.email} ${user.jobTitle || ""}`.toLowerCase().includes(inviteSearch.toLowerCase())).slice(0, 80).map((user) => <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-dtsc-soft"><input type="checkbox" checked={selectedInviteUserIds.includes(user.id)} onChange={() => setSelectedInviteUserIds((current) => current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id])} /><ConversationAvatar title={user.name} avatarUrl={user.avatarUrl} className="h-8 w-8" /><span className="min-w-0"><strong className="block truncate text-sm">{user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{user.jobTitle || user.email}</span></span></label>)}</div><Input name="invitedEmails" placeholder="email@example.com, …" /><Input name="invitationMessage" placeholder={userPreferences.locale === "en" ? "Invitation message" : "Message d’invitation"} /><Button type="submit" disabled={!selectedInviteUserIds.length}>{t("invite")}</Button></form></Dialog>

      <Dialog open={photoOpen} title={t("groupPhoto")} onClose={() => setPhotoOpen(false)}><form onSubmit={uploadPhoto} className="grid gap-4"><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm text-dtsc-ink" /><p className="text-xs text-dtsc-muted">{t("photoHelp")}</p><Button type="submit"><ImagePlus className="h-4 w-4" />{t("save")}</Button></form></Dialog>
      <Dialog open={storyOpen} title={t("addStatus")} onClose={() => setStoryOpen(false)}><form onSubmit={publishStory} className="grid gap-4"><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm text-dtsc-ink" /><Input name="caption" maxLength={280} placeholder={t("statusCaption")} /><Button type="submit"><ImagePlus className="h-4 w-4" />{t("publishStatus")}</Button></form></Dialog>
      <Dialog open={Boolean(selectedStory)} title={t("status")} onClose={() => setSelectedStory(null)} className="h-[92dvh] max-w-xl">{selectedStory ? <div className="flex h-full min-h-[60dvh] flex-col"><div className="min-h-0 flex-1 rounded-2xl bg-black bg-contain bg-center bg-no-repeat" style={{ backgroundImage: selectedStory.imageUrl ? `url(${JSON.stringify(selectedStory.imageUrl).slice(1, -1)})` : undefined }} /><p className="mt-3 text-center text-sm font-semibold text-dtsc-ink">{selectedStory.caption || ""}</p></div> : null}</Dialog>

      <Dialog open={notificationsOpen} title={t("notifications")} onClose={() => setNotificationsOpen(false)}>{activeGroup && activePreference ? <div className="grid gap-2"><Button variant={activePreference.notifications === "ALL" ? "default" : "outline"} onClick={() => void updatePreference(activeGroup.id, { notifications: "ALL" })}>{t("allNotifications")}</Button><Button variant={activePreference.notifications === "MENTIONS" ? "default" : "outline"} onClick={() => void updatePreference(activeGroup.id, { notifications: "MENTIONS" })}>{t("mentionsNotifications")}</Button><Button variant={activePreference.notifications === "NONE" ? "default" : "outline"} onClick={() => void updatePreference(activeGroup.id, { notifications: "NONE" })}>{t("noNotifications")}</Button><div className="my-1 border-t border-dtsc-border" /><Button variant="outline" onClick={() => void updatePreference(activeGroup.id, { mutedUntil: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() } as Partial<Preference>)}><BellOff className="h-4 w-4" />{t("mute8h")}</Button><Button variant="outline" onClick={() => void updatePreference(activeGroup.id, { mutedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } as Partial<Preference>)}><BellOff className="h-4 w-4" />{t("muteWeek")}</Button><Button variant="outline" onClick={() => void updatePreference(activeGroup.id, { mutedUntil: null } as Partial<Preference>)}><Bell className="h-4 w-4" />{t("unmute")}</Button></div> : null}</Dialog>

      <Dialog open={Boolean(editMessage)} title={t("edit")} onClose={() => setEditMessage(null)}><form onSubmit={editCurrentMessage} className="grid gap-3"><Input value={editContent} onChange={(event) => setEditContent(event.target.value)} autoFocus /><Button type="submit">{t("save")}</Button></form></Dialog>
      <Dialog open={Boolean(readInfo)} title={userPreferences.locale === "en" ? "Message info" : "Infos du message"} onClose={() => setReadInfo(null)}>{readInfo ? <MessageReadInfo readInfo={readInfo} preferences={userPreferences} /> : null}</Dialog>
      {activeGroup && canManage ? <GroupPresenceJournalDialog open={presenceJournalOpen} groupId={activeGroup.id} groupName={activeGroup.name} locale={userPreferences.locale} userPreferences={userPreferences} onClose={() => setPresenceJournalOpen(false)} /> : null}
    </div>
  );
}

function MessageReadInfo({ readInfo, preferences }: { readInfo: ReadInfo; preferences: UserDatePreferences }) {
  const english = preferences.locale === "en";
  return <div className="grid gap-5"><section><strong className="text-sm text-dtsc-ink">{english ? "Read by" : "Lu par"}</strong><div className="mt-2 divide-y divide-dtsc-border rounded-xl border border-dtsc-border">{readInfo.readBy.length ? readInfo.readBy.map((item) => <div key={item.user.id} className="flex items-center gap-3 p-3"><ConversationAvatar title={item.user.name} avatarUrl={item.user.avatarUrl} isOnline={isOnline(item.user.lastSeenAt)} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{item.user.name}</strong><span className="block text-xs text-dtsc-muted">{english ? "Read at" : "Lu le"} {formatUserDateTime(item.readAt, preferences, { second: "2-digit" })}</span></span><OnlineBadge online={isOnline(item.user.lastSeenAt)} english={english} /></div>) : <p className="p-3 text-sm text-dtsc-muted">{english ? "No member has read this message yet." : "Aucun membre n’a encore lu ce message."}</p>}</div></section><section><strong className="text-sm text-dtsc-ink">{english ? "Not read" : "Non lu"}</strong><div className="mt-2 divide-y divide-dtsc-border rounded-xl border border-dtsc-border">{readInfo.unreadBy.length ? readInfo.unreadBy.map((item) => <div key={item.user.id} className="flex items-center gap-3 p-3"><ConversationAvatar title={item.user.name} avatarUrl={item.user.avatarUrl} isOnline={isOnline(item.user.lastSeenAt)} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{item.user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{item.user.jobTitle || item.user.email}</span></span><OnlineBadge online={isOnline(item.user.lastSeenAt)} english={english} /></div>) : <p className="p-3 text-sm text-dtsc-muted">{english ? "Read by every active member." : "Lu par tous les membres actifs."}</p>}</div></section></div>;
}

function OnlineBadge({ online, english }: { online: boolean; english: boolean }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-black", online ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-dtsc-soft text-dtsc-muted")}>{online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? (english ? "Online" : "En ligne") : (english ? "Offline" : "Hors ligne")}</span>;
}

function MessageReceiptIndicator({ summary, english }: { summary?: GroupMessage["receiptSummary"]; english: boolean }) {
  if (summary?.allRead) return <span className="inline-flex items-center text-emerald-300" title={english ? "Read by every active member" : "Lu par tous les membres actifs"} aria-label={english ? "Read by everyone" : "Lu par tous"}><CheckCheck className="h-3.5 w-3.5" /></span>;
  if (summary?.allDelivered) return <span className="inline-flex items-center text-white/75" title={english ? "Delivered to every active member" : "Reçu par tous les membres actifs"} aria-label={english ? "Delivered to everyone" : "Reçu par tous"}><CheckCheck className="h-3.5 w-3.5" /></span>;
  return <span className="inline-flex items-center text-white/65" title={english ? "Sent to the server" : "Envoyé au serveur"} aria-label={english ? "Sent" : "Envoyé"}><Check className="h-3.5 w-3.5" /></span>;
}

function MessageBubble({ message, voice, currentUserId, userPreferences, canManage, t, onReply, onEdit, onDelete, onInfo, onMeetingChanged, onError }: { message: GroupMessage; voice?: Voice; currentUserId: string; userPreferences: UserDatePreferences; canManage: boolean; t: (key: Parameters<typeof collaborationExperienceT>[1]) => string; onReply: (message: GroupMessage) => void; onEdit: (message: GroupMessage) => void; onDelete: (message: GroupMessage) => void; onInfo: (messageId: string) => void; onMeetingChanged: () => Promise<void> | void; onError: (message: string) => void }) {
  if (message.messageType === "SYSTEM") return <div className="flex justify-center py-1"><span className="max-w-[90%] rounded-full bg-dtsc-soft px-3 py-1 text-center text-[0.7rem] font-semibold text-dtsc-muted">{message.content}</span></div>;
  const mine = message.authorId === currentUserId;
  const meetingMessage = message.messageType === "MEETING_LINK" || message.messageType === "MEETING_MINUTES_PROMPT" || message.messageType === "MEETING_SUMMARY";
  const items: ActionMenuItem[] = [
    ...(!meetingMessage ? [{ key: "reply", label: t("reply"), icon: MessageCircle, onSelect: () => onReply(message) }] : []),
    { key: "copy", label: t("copy"), icon: Copy, onSelect: () => void navigator.clipboard?.writeText(message.content) },
    { key: "info", label: "Info", icon: Info, onSelect: () => onInfo(message.id) },
    ...(mine && message.messageType === "TEXT" && !message.deletedAt ? [{ key: "edit", label: t("edit"), icon: Pencil, onSelect: () => onEdit(message) }] : []),
    ...((mine || canManage) && !message.deletedAt && !meetingMessage ? [{ key: "delete", label: t("deleteMessage"), icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => onDelete(message) }] : []),
  ];
  return <div className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("group relative max-w-[88%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[72%]", mine ? "rounded-br-md bg-cyan-600 text-white" : "rounded-bl-md border border-dtsc-border bg-dtsc-surface text-dtsc-ink", meetingMessage && "border border-dtsc-border bg-dtsc-surface text-dtsc-ink")}><div className="flex items-start gap-2"><div className="min-w-0 flex-1">{!mine && !meetingMessage ? <p className="mb-1 text-[0.7rem] font-black text-cyan-700 dark:text-cyan-300">{message.author.name}</p> : null}{message.replyTo && !meetingMessage ? <button type="button" className={cn("mb-2 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[0.7rem]", mine ? "border-white/70 bg-white/10" : "border-cyan-500 bg-dtsc-page")}><strong className="block truncate">{message.replyTo.author.name}</strong><span className="block truncate opacity-75">{message.replyTo.deletedAt ? "—" : message.replyTo.content}</span></button> : null}{message.deletedAt ? <p className="italic opacity-70">{userPreferences.locale === "en" ? "Message deleted" : "Message supprimé"}</p> : meetingMessage ? <CollaborationMeetingMessageContent messageType={message.messageType} content={message.content} meetingLink={message.meetingLink} meetingFollowUp={message.meetingFollowUp} preferences={userPreferences} onChanged={onMeetingChanged} onError={onError} /> : message.messageType === "VOICE" ? <div className="min-w-[220px]"><p className="mb-1 text-xs font-bold">{t("messageVoice")}</p>{voice?.audioUrl ? <audio controls preload="none" src={voice.audioUrl} className="h-9 w-full max-w-[280px]" /> : <p className="text-xs opacity-70">Audio indisponible</p>}</div> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>}<p className={cn("mt-1 flex items-center justify-end gap-1 text-right text-[0.62rem] font-semibold", mine && !meetingMessage ? "text-white/70" : "text-dtsc-muted")}><span>{formatRelativeUserDateTime(message.createdAt, userPreferences)}{message.status === "EDITED" ? " · edit" : ""}</span>{mine && !meetingMessage ? <MessageReceiptIndicator summary={message.receiptSummary} english={userPreferences.locale === "en"} /> : null}</p></div><ActionMenu items={items} label="Message" orientation="horizontal" className={cn("-mr-1 -mt-1 scale-75 opacity-70 transition group-hover:opacity-100", mine && !meetingMessage ? "[&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white" : "")} /></div></div></div>;
}

function buildGroupMenu({ activeGroup, activePreference, canManage, isOwner, t, onInfo, onFavorite, onPin, onArchive, onNotifications, onPresenceJournal, onPhoto, onStory, onInvite, onSettings, onCalls, onLeave }: { activeGroup: Group; activePreference: Preference; canManage: boolean; isOwner: boolean; t: (key: Parameters<typeof collaborationExperienceT>[1]) => string; onInfo: () => void; onFavorite: () => void; onPin: () => void; onArchive: () => void; onNotifications: () => void; onPresenceJournal: () => void; onPhoto: () => void; onStory: () => void; onInvite: () => void; onSettings: () => void; onCalls: () => void; onLeave: () => void }): ActionMenuItem[] {
  return [
    { key: "info", label: `${t("groupInfo")} · ${activeGroup.name}`, icon: Info, onSelect: onInfo },
    { key: "favorite", label: activePreference.favorite ? t("removeFavorite") : t("addFavorite"), icon: Heart, onSelect: onFavorite },
    { key: "pin", label: activePreference.pinned ? t("unpin") : t("pin"), icon: Pin, onSelect: onPin },
    { key: "archive", label: activePreference.archived ? t("unarchive") : t("archive"), icon: Archive, onSelect: onArchive },
    { key: "notifications", label: t("notifications"), icon: Bell, onSelect: onNotifications },
    ...(canManage ? [{ key: "presence-journal", label: t("presenceJournal"), icon: History, onSelect: onPresenceJournal, separatorBefore: true }] : []),
    ...(canManage ? [{ key: "photo", label: t("groupPhoto"), icon: ImagePlus, onSelect: onPhoto }] : []),
    { key: "story", label: t("addStatus"), icon: Eye, onSelect: onStory },
    ...(canManage ? [{ key: "invite", label: t("invite"), icon: UserPlus, onSelect: onInvite }, { key: "settings", label: t("groupSettings"), icon: Settings, onSelect: onSettings }] : []),
    { key: "calls", label: t("calls"), icon: Phone, onSelect: onCalls, separatorBefore: true },
    { key: "leave", label: isOwner ? t("delete") : t("leave"), icon: Trash2, destructive: true, separatorBefore: true, onSelect: onLeave },
  ];
}

function defaultPreference(groupId: string, userId: string): Preference {
  return { groupId, userId, pinned: false, favorite: false, archived: false, notifications: "ALL", mutedUntil: null };
}

function isOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= 5 * 60 * 1000;
}
