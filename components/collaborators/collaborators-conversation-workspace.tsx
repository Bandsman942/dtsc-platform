"use client";

import {
  Archive,
  AtSign,
  Bell,
  BellOff,
  BookOpen,
  Check,
  CheckCheck,
  Copy,
  Eye,
  Heart,
  History,
  ImagePlus,
  Info,
  ListFilter,
  MessageCircle,
  Paperclip,
  Flag,
  Pencil,
  Phone,
  Pin,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  UsersRound,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { GroupCallRoom } from "@/components/collaborators/collaborators-workspace";
import { playCallSound } from "@/components/calls/call-sounds";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { collaborationExperienceT } from "@/lib/collaboration-experience-i18n";
import { formatRelativeUserDateTime, formatUserDateTime, type UserDatePreferences } from "@/lib/user-format";
import { cn } from "@/lib/utils";

type UserOption = { id: string; name: string; email: string; avatarUrl?: string | null; jobTitle?: string | null; role?: string; lastSeenAt?: string | null; contactSince?: string | null };
type GroupMember = { id: string; role: string; status: string; userId: string; joinedAt: string; user: UserOption };
type GroupCallParticipant = { id: string; userId: string; status: string; joinedAt?: string | null; leftAt?: string | null; microphoneEnabled: boolean; cameraEnabled: boolean };
type GroupCall = { id: string; groupId: string; meetingId?: string | null; callType: "AUDIO" | "VIDEO"; status: string; startedById: string; startedAt: string; acceptedAt?: string | null; endedAt?: string | null; durationSeconds?: number | null; participants?: GroupCallParticipant[] };
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
type ContactRequest = { id: string; requesterId: string; targetUserId: string; message?: string | null; createdAt: string; requester: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null }; targetUser: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null } };
type ContactDirectoryUser = { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null; companyName?: string | null; maskedEmail: string; invitationLabel?: string | null };
type ConversationOption = { id: string; title: string; updatedAt: string; _count?: { messages: number } };
type JoinedCall = { call: GroupCall; token: string; livekitUrl: string };
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
type MessageReaction = { id: string; userId: string; reactionType: string; user?: { id: string; name: string } };
type MessageAttachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; status: string };
type GroupMessage = {
  id: string;
  content: string;
  messageType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  editedAt?: string | null;
  pinnedAt?: string | null;
  authorId: string;
  author: UserOption;
  replyTo?: { id: string; content: string; createdAt: string; deletedAt?: string | null; author: { id: string; name: string } } | null;
  mentions?: Array<{ mentionedUser: { id: string; name: string; email: string; jobTitle?: string | null } }>;
  mentionAll?: boolean;
  reads?: Array<{ userId: string; readAt: string }>;
  receiptSummary?: { recipientCount: number; deliveredCount: number; readCount: number; allDelivered: boolean; allRead: boolean };
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  meetingLink?: CollaborationMeetingLinkView | null;
  meetingFollowUp?: CollaborationMeetingFollowUpView | null;
};
type Preference = { groupId: string; userId: string; pinned: boolean; favorite: boolean; archived: boolean; notifications: "ALL" | "MENTIONS" | "NONE"; mutedUntil?: string | null };
type Story = { id: string; groupId: string; authorId: string; caption?: string | null; createdAt: string; expiresAt: string; imageUrl?: string | null };
type Voice = { id: string; messageId: string; authorId: string; durationMs: number; waveform?: unknown; createdAt: string; audioUrl?: string | null };
type BuiltInFilter = "ALL" | "DIRECT" | "UNREAD" | "FAVORITES" | "GROUPS" | "ARCHIVED";
type Filter = BuiltInFilter | `CUSTOM:${string}`;
type CustomFilterCriteria = {
  includeDirect: boolean;
  includeGroups: boolean;
  unreadOnly: boolean;
  mentionsOnly: boolean;
  favoritesOnly: boolean;
  selectedGroupIds: string[];
};
type CustomFilter = { id: string; name: string; position: number; criteriaJson: CustomFilterCriteria; createdAt: string; updatedAt: string };
type MentionAction = { kind: "USER"; user: UserOption } | { kind: "ALL"; memberCount: number };
type ReadInfo = {
  readBy: Array<{ user: UserOption; readAt: string }>;
  unreadBy: Array<{ user: UserOption }>;
};
type Props = {
  currentUserId: string;
  currentUserRole: string;
  initialActiveGroupId?: string | null;
  initialJoinCallId?: string | null;
  initialMessageId?: string | null;
  userPreferences: UserDatePreferences;
  initialGroups: Group[];
  initialInvitations: Invitation[];
  users: UserOption[];
  initialContacts: UserOption[];
  conversations: ConversationOption[];
  callPreferences: CallPreferences;
};

const GROUP_TYPES = ["COMPANY", "PROJECT", "INTERNAL", "CLIENT", "CROSS_ORGANIZATION", "PRIVATE_NETWORK", "OTHER"];
const LEGACY_CALL_EXPERIENCE_COMPATIBILITY = "CollaboratorsWorkspace";

export function CollaboratorsConversationWorkspace(props: Props) {
  const { currentUserId, currentUserRole, initialActiveGroupId, initialJoinCallId, initialMessageId, userPreferences, users, initialContacts } = props;
  const t = useCallback((key: Parameters<typeof collaborationExperienceT>[1]) => collaborationExperienceT(userPreferences.locale, key), [userPreferences.locale]);
  const [groups, setGroups] = useState(props.initialGroups);
  const [invitations, setInvitations] = useState(props.initialInvitations);
  const [activeGroupId, setActiveGroupId] = useState(initialActiveGroupId && props.initialGroups.some((group) => group.id === initialActiveGroupId) ? initialActiveGroupId : "");
  const [mobileListOpen, setMobileListOpen] = useState(!initialActiveGroupId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [editingCustomFilter, setEditingCustomFilter] = useState<CustomFilter | null>(null);
  const [mentionAction, setMentionAction] = useState<MentionAction | null>(null);
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
  const [directOpen, setDirectOpen] = useState(false);
  const [directSearch, setDirectSearch] = useState("");
  const [startingDirectUserId, setStartingDirectUserId] = useState<string | null>(null);
  const [incomingContactRequests, setIncomingContactRequests] = useState<ContactRequest[]>([]);
  const [outgoingContactRequests, setOutgoingContactRequests] = useState<ContactRequest[]>([]);
  const [contactDirectoryUsers, setContactDirectoryUsers] = useState<ContactDirectoryUser[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [contactRequestBusyId, setContactRequestBusyId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [presenceJournalOpen, setPresenceJournalOpen] = useState(false);
  const [joinedCall, setJoinedCall] = useState<JoinedCall | null>(null);
  const [callJoining, setCallJoining] = useState(false);
  const initialJoinHandledRef = useRef(false);
  const [editMessage, setEditMessage] = useState<GroupMessage | null>(null);
  const [editContent, setEditContent] = useState("");
  const [readInfo, setReadInfo] = useState<ReadInfo | null>(null);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [directBlock, setDirectBlock] = useState<{ blockedByMe: boolean; blockedMe: boolean } | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const historyExpandedRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTextClientIdRef = useRef<string | null>(null);
  useToastMessage(feedback);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const activeMembership = activeGroup?.members.find((member) => member.userId === currentUserId) || null;
  const canManage = Boolean(activeMembership && (activeMembership.role === "OWNER" || activeMembership.role === "ADMIN"));
  const isOwner = activeMembership?.role === "OWNER";
  const activePreference = activeGroup ? preferences[activeGroup.id] || defaultPreference(activeGroup.id, currentUserId) : null;
  const directPeer = activeGroup?.groupType === "DIRECT" ? activeGroup.members.find((member) => member.userId !== currentUserId) || null : null;
  const voiceByMessage = voices;

  const refreshGroups = useCallback(async () => {
    const response = await fetch("/api/collaborators/groups", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { groups?: Group[]; invitations?: Invitation[] };
    setGroups(body.groups || []);
    setInvitations(body.invitations || []);
  }, []);

  const loadContactRequests = useCallback(async () => {
    const response = await fetch("/api/collaborators/contact-requests", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { incoming?: ContactRequest[]; outgoing?: ContactRequest[] };
    setIncomingContactRequests(body.incoming || []);
    setOutgoingContactRequests(body.outgoing || []);
  }, []);

  const loadExperience = useCallback(async () => {
    const response = await fetch("/api/collaborators/groups/experience", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { profiles?: Array<{ groupId: string; avatarUrl?: string | null }>; preferences?: Preference[]; stories?: Story[]; filters?: CustomFilter[] };
    setProfiles(Object.fromEntries((body.profiles || []).map((item) => [item.groupId, item.avatarUrl || null])));
    setPreferences(Object.fromEntries((body.preferences || []).map((item) => [item.groupId, item])));
    setStories(body.stories || []);
    setCustomFilters(body.filters || []);
  }, []);

  const loadMessages = useCallback(async (groupId: string, cursor?: string | null, focusedMessageId?: string | null, preserveHistory = false) => {
    if (!groupId) return;
    const list = messageListRef.current;
    const previousHeight = list?.scrollHeight || 0;
    const previousTop = list?.scrollTop || 0;
    if (cursor) setLoadingOlder(true);
    const params = new URLSearchParams({ limit: "30" });
    if (cursor) params.set("cursor", cursor);
    const targetMessageId = focusedMessageId || initialMessageId;
    if (!cursor && targetMessageId) params.set("messageId", targetMessageId);
    const response = await fetch(`/api/collaborators/groups/${groupId}/messages?${params.toString()}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { messages?: GroupMessage[]; nextCursor?: string | null; hasMore?: boolean } | null;
    if (response.ok && body) {
      const incoming = body.messages || [];
      setMessages((current) => cursor
        ? mergeMessages(incoming, current)
        : preserveHistory || historyExpandedRef.current
          ? mergeMessages(current, incoming)
          : incoming);
      if (cursor) historyExpandedRef.current = true;
      setNextCursor(body.nextCursor || null);
      setHasMore(Boolean(body.hasMore));
      if (cursor) {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          const element = messageListRef.current;
          if (element) element.scrollTop = previousTop + (element.scrollHeight - previousHeight);
        }));
      } else setGroups((current) => current.map((group) => group.id === groupId ? { ...group, unreadMessageCount: 0, unreadMentionCount: 0, unreadMentionPreview: null } : group));
    }
    setLoadingOlder(false);
  }, [initialMessageId]);

  const loadVoices = useCallback(async (groupId: string) => {
    if (!groupId) return setVoices({});
    const response = await fetch(`/api/collaborators/groups/${groupId}/voice`, { cache: "no-store" });
    if (!response.ok) return setVoices({});
    const body = await response.json() as { voices?: Voice[] };
    setVoices(Object.fromEntries((body.voices || []).map((voice) => [voice.messageId, voice])));
  }, []);

  useEffect(() => { void loadExperience(); }, [loadExperience]);
  useEffect(() => { void loadContactRequests(); }, [loadContactRequests]);
  useEffect(() => {
    if (!directOpen || directSearch.trim().length < 3) { setContactDirectoryUsers([]); setContactSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setContactSearching(true);
      const response = await fetch(`/api/collaborators/contact-directory?query=${encodeURIComponent(directSearch.trim())}`, { cache: "no-store", signal: controller.signal }).catch(() => null);
      if (response?.ok) {
        const body = await response.json() as { users?: ContactDirectoryUser[] };
        setContactDirectoryUsers(body.users || []);
      }
      setContactSearching(false);
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [directOpen, directSearch]);
  useEffect(() => {
    if (!activeGroupId) { setMessages([]); setVoices({}); return; }
    setNextCursor(null);
    setHasMore(false);
    historyExpandedRef.current = false;
    void Promise.all([loadMessages(activeGroupId), loadVoices(activeGroupId)]);
  }, [activeGroupId, loadMessages, loadVoices]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshGroups();
      if (activeGroupId) void Promise.all([loadMessages(activeGroupId, null, null, true), loadVoices(activeGroupId)]);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [activeGroupId, loadMessages, loadVoices, refreshGroups]);
  useEffect(() => {
    if (!infoOpen || !directPeer) {
      setDirectBlock(null);
      return;
    }
    let active = true;
    void fetch(`/api/collaborators/blocks?targetUserId=${encodeURIComponent(directPeer.userId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { blockedByMe?: boolean; blockedMe?: boolean } | null) => {
        if (active && body) setDirectBlock({ blockedByMe: Boolean(body.blockedByMe), blockedMe: Boolean(body.blockedMe) });
      });
    return () => { active = false; };
  }, [directPeer, infoOpen]);

  const focusMessageById = useCallback((messageId: string, behavior: ScrollBehavior = "smooth") => {
    const target = messageListRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!target) return false;
    target.scrollIntoView({ behavior, block: "center" });
    target.focus({ preventScroll: true });
    return true;
  }, []);

  useEffect(() => {
    const element = messageListRef.current;
    if (!element || !messages.length) return;
    if (initialMessageId && focusMessageById(initialMessageId, "auto")) return;
    element.scrollTop = element.scrollHeight;
  }, [activeGroupId, focusMessageById, initialMessageId, messages.length]);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const selectedCustomFilter = filter.startsWith("CUSTOM:") ? customFilters.find((item) => `CUSTOM:${item.id}` === filter) || null : null;
    return groups
      .filter((group) => {
        const preference = preferences[group.id] || defaultPreference(group.id, currentUserId);
        const direct = group.groupType === "DIRECT";
        const unread = Boolean(group.unreadMessageCount || group.unreadMentionCount);
        if (filter === "ARCHIVED") return preference.archived;
        if (preference.archived) return false;
        if (filter === "DIRECT" && !direct) return false;
        if (filter === "UNREAD" && !unread) return false;
        if (filter === "FAVORITES" && !preference.favorite) return false;
        if (filter === "GROUPS" && direct) return false;
        if (selectedCustomFilter) {
          const criteria = normalizeCustomFilterCriteria(selectedCustomFilter.criteriaJson);
          if (direct && !criteria.includeDirect) return false;
          if (!direct && !criteria.includeGroups) return false;
          if (criteria.unreadOnly && !unread) return false;
          if (criteria.mentionsOnly && !(group.unreadMentionCount || 0)) return false;
          if (criteria.favoritesOnly && !preference.favorite) return false;
          if (criteria.selectedGroupIds.length && !criteria.selectedGroupIds.includes(group.id)) return false;
        }
        if (!needle) return true;
        return `${group.name} ${group.description || ""} ${group.members.map((member) => member.user.name).join(" ")}`.toLowerCase().includes(needle);
      })
      .sort((left, right) => Number(Boolean(preferences[right.id]?.pinned)) - Number(Boolean(preferences[left.id]?.pinned)));
  }, [currentUserId, customFilters, filter, groups, preferences, query]);

  const activeStories = useMemo(() => {
    const firstByGroup = new Map<string, Story>();
    for (const story of stories) if (!firstByGroup.has(story.groupId)) firstByGroup.set(story.groupId, story);
    return [...firstByGroup.values()].filter((story) => groups.some((group) => group.id === story.groupId));
  }, [groups, stories]);

  const mentionSuggestions = useMemo(() => {
    if (!activeGroup) return [] as Array<{ kind: "ALL" } | { kind: "USER"; member: GroupMember }>;
    const match = content.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) return [] as Array<{ kind: "ALL" } | { kind: "USER"; member: GroupMember }>;
    const value = match[1].trim().toLowerCase();
    const suggestions: Array<{ kind: "ALL" } | { kind: "USER"; member: GroupMember }> = [];
    if (canManage && activeGroup.groupType !== "DIRECT" && ("tous".startsWith(value) || "all".startsWith(value))) suggestions.push({ kind: "ALL" });
    suggestions.push(...activeGroup.members
      .filter((member) => member.userId !== currentUserId)
      .filter((member) => member.user.name.toLowerCase().includes(value) || member.user.email.toLowerCase().includes(value))
      .slice(0, Math.max(0, 6 - suggestions.length))
      .map((member) => ({ kind: "USER" as const, member })));
    return suggestions;
  }, [activeGroup, canManage, content, currentUserId]);

  async function sendText() {
    if (!activeGroup || !content.trim() || sending) return;
    const clientMessageId = pendingTextClientIdRef.current || crypto.randomUUID();
    pendingTextClientIdRef.current = clientMessageId;
    setSending(true);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim(), mentionedUserIds: resolveMentionedUserIds(content), messageType: "TEXT", replyToId: replyTo?.id || "", clientMessageId }),
    });
    setSending(false);
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToSendMessageRetryWillNotDuplicateIt"));
    pendingTextClientIdRef.current = null;
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

  async function startDirectConversation(targetUserId: string) {
    if (startingDirectUserId) return;
    setStartingDirectUserId(targetUserId);
    try {
      const response = await fetch("/api/collaborators/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const body = await response.json().catch(() => null) as { group?: { id: string }; message?: string } | null;
      if (!response.ok || !body?.group?.id) {
        setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToStartConversation")));
        return;
      }
      setDirectOpen(false);
      setDirectSearch("");
      await refreshGroups();
      selectGroup(body.group.id);
    } finally {
      setStartingDirectUserId(null);
    }
  }

  async function jumpToMessage(messageId: string) {
    if (focusMessageById(messageId)) return;
    if (!activeGroup) return;
    await loadMessages(activeGroup.id, null, messageId);
    window.setTimeout(() => {
      if (!focusMessageById(messageId)) {
        setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiOriginalMessageIsUnavailable"));
      }
    }, 0);
  }

  async function uploadAttachment(file: File) {
    if (!activeGroup || sending) return;
    setSending(true);
    const form = new FormData();
    form.append("file", file);
    form.append("clientMessageId", crypto.randomUUID());
    try {
      const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/attachments`, { method: "POST", body: form });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToUploadFile")));
      await Promise.all([loadMessages(activeGroup.id), refreshGroups()]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("conversationUiUploadFallback"));
    } finally {
      setSending(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  async function toggleReaction(message: GroupMessage, reactionType = "LIKE") {
    const mine = message.reactions?.some((reaction) => reaction.userId === currentUserId && reaction.reactionType === reactionType);
    const response = await fetch(`/api/collaborators/messages/${message.id}/reactions`, {
      method: mine ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactionType }),
    });
    if (response.ok && activeGroup) await loadMessages(activeGroup.id);
  }

  async function togglePin(message: GroupMessage) {
    const response = await fetch(`/api/collaborators/messages/${message.id}/pin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: message.pinnedAt ? "UNPIN" : "PIN" }),
    });
    if (response.ok && activeGroup) await loadMessages(activeGroup.id);
  }

  async function reportMessage(message: GroupMessage) {
    const description = window.prompt(collaborationExperienceT(userPreferences.locale, "conversationUiWhyAreYouReportingThisMessage"));
    if (description === null) return;
    const response = await fetch(`/api/collaborators/messages/${message.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "OTHER", description }),
    });
    setFeedback(response.ok ? (collaborationExperienceT(userPreferences.locale, "conversationUiReportSubmitted")) : (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToReportMessage")));
  }

  async function openAttachment(attachmentId: string) {
    const response = await fetch(`/api/collaborators/attachments/${attachmentId}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { url?: string; message?: string } | null;
    if (!response.ok || !body?.url) return setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiFileUnavailable")));
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  function resolveMentionedUserIds(value: string) {
    if (!activeGroup) return [] as string[];
    if (containsMentionAllText(value) && canManage && activeGroup.groupType !== "DIRECT") {
      return activeGroup.members.map((member) => member.userId).filter((userId) => userId !== currentUserId);
    }
    const lower = value.toLocaleLowerCase();
    return [...new Set(mentionedUserIds.filter((userId) => {
      const member = activeGroup.members.find((item) => item.userId === userId);
      return member ? lower.includes(`@${member.user.name.toLocaleLowerCase()}`) : false;
    }))];
  }

  function insertMentionSuggestion(suggestion: { kind: "ALL" } | { kind: "USER"; member: GroupMember }) {
    if (suggestion.kind === "ALL") {
      setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, "@tous "));
      setMentionedUserIds(activeGroup?.members.map((member) => member.userId).filter((userId) => userId !== currentUserId) || []);
      return;
    }
    setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${suggestion.member.user.name} `));
    setMentionedUserIds((current) => [...new Set([...current, suggestion.member.userId])]);
  }

  async function saveCustomFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      position: editingCustomFilter?.position || customFilters.length,
      criteria: {
        includeDirect: form.get("includeDirect") === "on",
        includeGroups: form.get("includeGroups") === "on",
        unreadOnly: form.get("unreadOnly") === "on",
        mentionsOnly: form.get("mentionsOnly") === "on",
        favoritesOnly: form.get("favoritesOnly") === "on",
        selectedGroupIds: form.getAll("selectedGroupIds").map(String),
      },
    };
    if (!payload.criteria.includeDirect && !payload.criteria.includeGroups) {
      setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiSelectDirectConversationsGroupsOrBoth"));
      return;
    }
    const endpoint = editingCustomFilter ? `/api/collaborators/filters/${editingCustomFilter.id}` : "/api/collaborators/filters";
    const response = await fetch(endpoint, { method: editingCustomFilter ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null) as { error?: string; filter?: CustomFilter } | null;
    if (!response.ok) {
      setFeedback(body?.error || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToSaveFilter")));
      return;
    }
    setEditingCustomFilter(null);
    await loadExperience();
    if (body?.filter?.id) setFilter(`CUSTOM:${body.filter.id}`);
  }

  async function deleteCustomFilter(item: CustomFilter) {
    if (!window.confirm(collaborationExperienceT(userPreferences.locale, "conversationUiDeleteFilter", { v0: item.name }))) return;
    const response = await fetch(`/api/collaborators/filters/${item.id}`, { method: "DELETE" });
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToDeleteFilter"));
    if (filter === `CUSTOM:${item.id}`) setFilter("ALL");
    if (editingCustomFilter?.id === item.id) setEditingCustomFilter(null);
    await loadExperience();
  }

  async function updatePreference(groupId: string, patch: Partial<Preference>) {
    const response = await fetch(`/api/collaborators/groups/${groupId}/preferences`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToUpdateSettings"));
    await loadExperience();
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endpoint = groupDialog === "edit" && activeGroup ? `/api/collaborators/groups/${activeGroup.id}` : "/api/collaborators/groups";
    const response = await fetch(endpoint, { method: groupDialog === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => null) as { group?: { id: string }; message?: string } | null;
    if (!response.ok) return setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToSaveGroup")));
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
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToSendInvitations"));
    setInviteOpen(false); setSelectedInviteUserIds([]); setInviteSearch("");
    await refreshGroups();
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/profile-photo`, { method: "POST", body: form });
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToUpdateGroupPhoto"));
    setPhotoOpen(false);
    await Promise.all([loadExperience(), loadMessages(activeGroup.id)]);
  }

  async function publishStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeGroup) return;
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/stories`, { method: "POST", body: new FormData(event.currentTarget) });
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToPublishStatus"));
    setStoryOpen(false);
    await loadExperience();
  }

  async function editCurrentMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editMessage || !editContent.trim()) return;
    const response = await fetch(`/api/collaborators/messages/${editMessage.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editContent.trim(), status: "EDITED", mentionedUserIds: resolveMentionedUserIds(editContent) }) });
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToEditMessage"));
    setEditMessage(null); setEditContent("");
    if (activeGroup) await loadMessages(activeGroup.id);
  }

  async function deleteMessage(message: GroupMessage) {
    if (!window.confirm(collaborationExperienceT(userPreferences.locale, "conversationUiDeleteThisMessage"))) return;
    const response = await fetch(`/api/collaborators/messages/${message.id}`, { method: "DELETE" });
    if (response.ok && activeGroup) await Promise.all([loadMessages(activeGroup.id), refreshGroups()]);
  }

  async function openReadInfo(messageId: string) {
    const response = await fetch(`/api/collaborators/messages/${messageId}/reads`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { readBy?: Array<{ user: UserOption; readAt: string }>; unreadBy?: Array<{ user: UserOption }> } | null;
    if (response.ok && body) setReadInfo({ readBy: body.readBy || [], unreadBy: body.unreadBy || [] });
  }

  async function sendContactRequest(targetUserId: string) {
    setContactRequestBusyId(targetUserId);
    const response = await fetch("/api/collaborators/contact-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId }) });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setContactRequestBusyId(null);
    setFeedback(response.ok ? (collaborationExperienceT(userPreferences.locale, "conversationUiInvitationSent")) : body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToSendInvitation")));
    if (response.ok) { setContactDirectoryUsers((current) => current.filter((user) => user.id !== targetUserId)); await loadContactRequests(); }
  }

  async function respondContactRequest(requestId: string, action: "ACCEPT" | "DECLINE" | "CANCEL") {
    setContactRequestBusyId(requestId);
    const response = await fetch(`/api/collaborators/contact-requests/${requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json().catch(() => null) as { groupId?: string; message?: string } | null;
    setContactRequestBusyId(null);
    if (!response.ok) return setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToUpdateInvitation")));
    await Promise.all([loadContactRequests(), refreshGroups()]);
    if (body?.groupId) selectGroup(body.groupId);
  }

  async function startGroupCall(callType: "AUDIO" | "VIDEO") {
    if (!activeGroup || callJoining) return;
    setCallJoining(true);
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callType, meetingId: "" }),
    });
    const body = await response.json().catch(() => null) as { call?: GroupCall; activeCall?: GroupCall; message?: string } | null;
    setCallJoining(false);
    if (!response.ok) return setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToStartTheCall")));
    const nextCall = body?.call || body?.activeCall;
    await refreshGroups();
    if (nextCall) await joinGroupCall(nextCall);
  }

  const joinGroupCall = useCallback(async (call: GroupCall) => {
    if (callJoining) return;
    setCallJoining(true);
    const response = await fetch(`/api/collaborators/calls/${call.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        microphoneEnabled: props.callPreferences.startMutedByDefault !== true,
        cameraEnabled: call.callType === "VIDEO" && props.callPreferences.startCameraOffByDefault !== true,
      }),
    });
    const body = await response.json().catch(() => null) as { token?: string; livekitUrl?: string; message?: string } | null;
    setCallJoining(false);
    if (!response.ok || !body?.token || !body.livekitUrl) return setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToJoinTheCall")));
    setJoinedCall({ call, token: body.token, livekitUrl: body.livekitUrl });
    if (props.callPreferences.callSoundsEnabled !== false) void playCallSound("connected", props.callPreferences.callSoundVolume ?? 45);
    await refreshGroups();
  }, [callJoining, props.callPreferences.callSoundVolume, props.callPreferences.callSoundsEnabled, props.callPreferences.startCameraOffByDefault, props.callPreferences.startMutedByDefault, refreshGroups, userPreferences.locale]);

  useEffect(() => {
    if (!initialJoinCallId || initialJoinHandledRef.current) return;
    const targetGroup = groups.find((group) => (group.calls || []).some((call) => call.id === initialJoinCallId && (call.status === "RINGING" || call.status === "ACTIVE")));
    const targetCall = targetGroup?.calls?.find((call) => call.id === initialJoinCallId);
    if (!targetGroup || !targetCall) return;
    initialJoinHandledRef.current = true;
    setActiveGroupId(targetGroup.id);
    setMobileListOpen(false);
    void joinGroupCall(targetCall);
  }, [groups, initialJoinCallId, joinGroupCall]);

  async function rejectGroupCall(call: GroupCall) {
    const response = await fetch(`/api/collaborators/calls/${call.id}/reject`, { method: "POST" });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setFeedback(response.ok ? (collaborationExperienceT(userPreferences.locale, "conversationUiCallDeclined")) : body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToDeclineTheCall")));
    if (response.ok) await refreshGroups();
  }

  async function leaveJoinedCall() {
    if (!joinedCall) return;
    await fetch(`/api/collaborators/calls/${joinedCall.call.id}/leave`, { method: "POST" }).catch(() => null);
    setJoinedCall(null);
    await refreshGroups();
  }

  async function endGroupCall(call: GroupCall) {
    const response = await fetch(`/api/collaborators/calls/${call.id}/end`, { method: "POST" });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) return setFeedback(body?.message || (collaborationExperienceT(userPreferences.locale, "conversationUiUnableToEndTheCall")));
    if (joinedCall?.call.id === call.id) setJoinedCall(null);
    await refreshGroups();
  }

  async function manageGroupMember(member: GroupMember, action: "PROMOTE_ADMIN" | "DEMOTE_ADMIN" | "REMOVE" | "TRANSFER_OWNER") {
    if (!activeGroup) return;
    const destructive = action === "REMOVE" || action === "TRANSFER_OWNER";
    if (destructive && !window.confirm(action === "REMOVE" ? collaborationExperienceT(userPreferences.locale, "conversationUiMemberRemoveConfirm", { v0: member.user.name }) : collaborationExperienceT(userPreferences.locale, "conversationUiMemberTransferConfirm", { v0: member.user.name }))) return;
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) return setFeedback(body?.message || t("conversationUiMemberUpdateFailed"));
    await refreshGroups();
  }

  async function toggleDirectBlock() {
    if (!directPeer || !directBlock) return;
    const action = directBlock.blockedByMe ? "UNBLOCK" : "BLOCK";
    if (action === "BLOCK" && !window.confirm(collaborationExperienceT(userPreferences.locale, "conversationUiBlockConfirm", { v0: directPeer.user.name }))) return;
    const response = await fetch("/api/collaborators/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: directPeer.userId, action }),
    });
    if (!response.ok) return setFeedback(t("conversationUiBlockUpdateFailed"));
    setDirectBlock((current) => current ? { ...current, blockedByMe: action === "BLOCK" } : current);
    setFeedback(action === "BLOCK" ? t("conversationUiCollaboratorBlocked") : t("conversationUiCollaboratorUnblocked"));
  }

  async function leaveOrDeleteGroup() {
    if (!activeGroup) return;
    const prompt = isOwner ? (collaborationExperienceT(userPreferences.locale, "conversationUiDeleteThisGroup")) : (collaborationExperienceT(userPreferences.locale, "conversationUiLeaveThisGroup"));
    if (!window.confirm(prompt)) return;
    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}`, { method: "DELETE" });
    if (!response.ok) return setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiUnableToApplyAction"));
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
    onCalls: () => {
      const activeCall = activeGroup.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE");
      if (activeCall) void joinGroupCall(activeCall);
      else void startGroupCall("AUDIO");
    },
    onLeave: () => void leaveOrDeleteGroup(),
  }) : [];



  return (
    <div className="relative grid h-[calc(100dvh-7.25rem)] min-w-0 overflow-hidden bg-dtsc-surface sm:h-[calc(100dvh-8rem)] lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className={cn("relative h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-dtsc-border bg-dtsc-surface", activeGroup && !mobileListOpen ? "hidden lg:flex" : "flex")}>
        <div className="shrink-0 px-3 pb-2 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">{t("title")}</p><h2 className="truncate text-xl font-black text-dtsc-ink">{t("groups")}</h2></div>
            <div className="flex gap-2"><Button asChild type="button" size="icon" variant="outline" className="h-11 w-11 rounded-full" aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiUserGuide")}><Link href="/help/standard?guide=collaborators"><BookOpen className="h-5 w-5" /></Link></Button><Button type="button" size="icon" variant="outline" onClick={() => setDirectOpen(true)} className="h-11 w-11 rounded-full lg:hidden" aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiNewDirectConversation")}><UserPlus className="h-5 w-5" /></Button><Button type="button" size="icon" onClick={() => setGroupDialog("create")} className="h-11 w-11 rounded-full bg-[#002b5b] text-white lg:hidden" aria-label={t("newGroup")}><MessageCircle className="h-5 w-5" /></Button></div>
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
            {(["ALL", "DIRECT", "UNREAD", "FAVORITES", "GROUPS", "ARCHIVED"] as BuiltInFilter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition", filter === item ? "border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft")}>{item === "ALL" ? t("all") : item === "DIRECT" ? (collaborationExperienceT(userPreferences.locale, "conversationUiDirect")) : item === "UNREAD" ? t("unread") : item === "FAVORITES" ? t("favorites") : item === "GROUPS" ? t("groupsFilter") : t("archived")}</button>)}
            {customFilters.map((item) => <button key={item.id} type="button" onClick={() => setFilter(`CUSTOM:${item.id}`)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition", filter === `CUSTOM:${item.id}` ? "border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft")}>{item.name}</button>)}
            <button type="button" onClick={() => setFilterDialogOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-cyan-500 px-3 py-1.5 text-xs font-black text-cyan-700 dark:text-cyan-200"><ListFilter className="h-3.5 w-3.5" />{collaborationExperienceT(userPreferences.locale, "conversationUiFilters")}</button>
          </div>
        </div>

        {invitations.length ? <div className="mx-3 mb-2 max-h-36 shrink-0 overflow-y-auto rounded-2xl border border-cyan-300/60 bg-cyan-400/10 p-2 sm:mx-4">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-2 py-1.5 text-xs"><span className="min-w-0 flex-1"><strong className="block truncate text-dtsc-ink">{invitation.group.name}</strong><span className="text-dtsc-muted">{t("invitation")} · {invitation.invitedBy.name}</span></span><Button type="button" size="icon" className="h-8 w-8 rounded-full" onClick={() => void respondInvitation(invitation.id, "ACCEPT")} aria-label={t("accept")}><Check className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => void respondInvitation(invitation.id, "DECLINE")} aria-label={t("decline")}><X className="h-3.5 w-3.5" /></Button></div>)}</div> : null}
        {incomingContactRequests.length ? <div className="mx-3 mb-2 max-h-40 shrink-0 overflow-y-auto rounded-2xl border border-blue-300/60 bg-blue-400/10 p-2 sm:mx-4"><p className="px-1 pb-1 text-[0.65rem] font-black uppercase tracking-wide text-blue-700 dark:text-blue-200">{collaborationExperienceT(userPreferences.locale, "conversationUiContactInvitations")}</p>{incomingContactRequests.map((request) => <div key={request.id} className="flex items-center gap-2 py-1.5 text-xs"><ConversationAvatar title={request.requester.name} avatarUrl={request.requester.avatarUrl} className="h-8 w-8" /><span className="min-w-0 flex-1"><strong className="block truncate text-dtsc-ink">{request.requester.name}</strong><span className="block truncate text-dtsc-muted">{request.requester.jobTitle || (collaborationExperienceT(userPreferences.locale, "conversationUiWantsToConnect"))}</span></span><Button type="button" size="icon" disabled={contactRequestBusyId === request.id} className="h-8 w-8 rounded-full" onClick={() => void respondContactRequest(request.id, "ACCEPT")} aria-label={t("accept")}><Check className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" disabled={contactRequestBusyId === request.id} variant="outline" className="h-8 w-8 rounded-full" onClick={() => void respondContactRequest(request.id, "DECLINE")} aria-label={t("decline")}><X className="h-3.5 w-3.5" /></Button></div>)}</div> : null}
        <section className="mx-3 mb-2 shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-2 sm:mx-4" aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiMyAcceptedContacts")}>
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <div className="min-w-0"><p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-200">{collaborationExperienceT(userPreferences.locale, "conversationUiMyContacts")}</p><p className="truncate text-xs text-dtsc-muted">{initialContacts.length ? (collaborationExperienceT(userPreferences.locale, "conversationUiAcceptedContactS", { v0: initialContacts.length })) : (collaborationExperienceT(userPreferences.locale, "conversationUiNoAcceptedContactYet"))}</p></div>
            <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={() => setDirectOpen(true)}><UserPlus className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiAdd")}</Button>
          </div>
          {initialContacts.length ? <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{initialContacts.map((contact) => <button key={contact.id} type="button" onClick={() => void startDirectConversation(contact.id)} disabled={Boolean(startingDirectUserId)} className="w-20 shrink-0 rounded-xl p-2 text-center transition hover:bg-dtsc-soft disabled:opacity-60"><ConversationAvatar title={contact.name} avatarUrl={contact.avatarUrl} isOnline={isOnline(contact.lastSeenAt)} className="mx-auto h-10 w-10" /><span className="mt-1 block truncate text-xs font-black text-dtsc-ink">{contact.name}</span><span className="block truncate text-[0.62rem] text-dtsc-muted">{contact.jobTitle || (collaborationExperienceT(userPreferences.locale, "conversationUiContact"))}</span></button>)}</div> : null}
        </section>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-20 sm:px-3 lg:pb-3">
          {visibleGroups.map((group) => {
            const latest = group.messages[0];
            const preference = preferences[group.id] || defaultPreference(group.id, currentUserId);
            const activeCall = group.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE");
            const preview = activeCall ? `${activeCall.callType === "VIDEO" ? t("conversationUiVideo") : t("conversationUiAudio")} · ${t("online")}` : group.unreadMentionPreview || (latest ? `${latest.author.name}: ${latest.content}` : group.description || t("noMessage"));
            return <div key={group.id} className="relative"><ConversationListItem id={group.id} title={`${preference.pinned ? "📌 " : ""}${group.name}`} preview={preview} timestamp={latest ? formatRelativeUserDateTime(latest.createdAt, userPreferences) : undefined} avatarUrl={profiles[group.id]} unreadCount={group.unreadMessageCount} mentionCount={group.unreadMentionCount} isActive={activeGroupId === group.id} type="group" onClick={() => selectGroup(group.id)} />{preference.favorite ? <Heart className="pointer-events-none absolute right-2 top-9 h-3 w-3 fill-current text-cyan-600" /> : null}</div>;
          })}
          {!visibleGroups.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-dtsc-muted">{t("noGroup")}</p> : null}
        </div>
        <div className="absolute bottom-5 right-5 hidden items-center gap-2 lg:flex"><Button type="button" variant="outline" className="rounded-full shadow-lg" onClick={() => setDirectOpen(true)}><UserPlus className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiDirect2")}</Button><FloatingActionButton label={t("newGroup")} onClick={() => setGroupDialog("create")} className="static" /></div>
      </aside>

      <main className={cn("h-full min-h-0 min-w-0 flex-col overflow-hidden bg-dtsc-page", activeGroup && !mobileListOpen ? "flex" : "hidden lg:flex")}>
        {activeGroup ? (
          <>
            <ConversationHeader title={activeGroup.name} subtitle={`${activeGroup.members.length} ${t("members")} · ${activeGroup.groupType.replaceAll("_", " ")}`} avatarUrl={profiles[activeGroup.id]} type="group" onBack={() => setMobileListOpen(true)} onTitleClick={() => setInfoOpen(true)} actions={<><Button type="button" variant="outline" size="icon" className="rounded-full" disabled={callJoining} onClick={() => void startGroupCall("AUDIO")} aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiStartAudioCall")}><Phone className="h-4 w-4" /></Button><Button type="button" variant="outline" size="icon" className="rounded-full" disabled={callJoining} onClick={() => void startGroupCall("VIDEO")} aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiStartVideoCall")}><Video className="h-4 w-4" /></Button><ActionMenu label={t("conversationUiGroupActions")} items={groupMenu} /></>} />
            {activeGroup.calls?.find((call) => call.status === "RINGING" || call.status === "ACTIVE") ? (() => {
              const activeCall = activeGroup.calls!.find((call) => call.status === "RINGING" || call.status === "ACTIVE")!;
              return <div className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/50 bg-cyan-400/10 px-3 py-2 text-sm sm:mx-5"><span className="min-w-0 flex-1 font-bold text-dtsc-ink">{activeCall.callType === "VIDEO" ? (collaborationExperienceT(userPreferences.locale, "conversationUiVideoCallInProgress")) : (collaborationExperienceT(userPreferences.locale, "conversationUiAudioCallInProgress"))}</span><Button type="button" size="sm" disabled={callJoining} onClick={() => void joinGroupCall(activeCall)} className="rounded-full">{callJoining ? "…" : collaborationExperienceT(userPreferences.locale, "conversationUiJoin")}</Button>{activeCall.startedById === currentUserId || canManage ? <Button type="button" size="sm" variant="outline" onClick={() => void endGroupCall(activeCall)} className="rounded-full">{collaborationExperienceT(userPreferences.locale, "conversationUiEnd")}</Button> : <Button type="button" size="sm" variant="outline" onClick={() => void rejectGroupCall(activeCall)} className="rounded-full">{collaborationExperienceT(userPreferences.locale, "decline")}</Button>}</div>;
            })() : null}
            <div ref={messageListRef} onScroll={(event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 80) historyExpandedRef.current = false; }} className="min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
              {hasMore ? <div className="flex justify-center"><Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={() => void loadMessages(activeGroup.id, nextCursor)}>{loadingOlder ? "…" : collaborationExperienceT(userPreferences.locale, "conversationUiOlderMessages")}</Button></div> : null}
              {messages.map((message) => <MessageBubble key={message.id} message={message} voice={voiceByMessage[message.id]} currentUserId={currentUserId} userPreferences={userPreferences} canManage={canManage} t={t} onReply={setReplyTo} onEdit={(item) => { setEditMessage(item); setEditContent(item.content); }} onDelete={(item) => void deleteMessage(item)} onInfo={(id) => void openReadInfo(id)} onReact={(item) => void toggleReaction(item)} onPin={(item) => void togglePin(item)} onReport={(item) => void reportMessage(item)} onAttachment={(id) => void openAttachment(id)} onJumpToMessage={(id) => void jumpToMessage(id)} onMention={setMentionAction} onMeetingChanged={() => loadMessages(activeGroup.id)} onError={setFeedback} />)}
              {!messages.length ? <p className="py-12 text-center text-sm font-semibold text-dtsc-muted">{t("noMessage")}</p> : null}
            </div>
            <VoiceConversationComposer value={content} onChange={setContent} onSendText={sendText} onSendVoice={sendVoice} sending={sending} placeholder={t("writeMessage")} onError={setFeedback} labels={{ record: t("record"), cancel: t("cancel"), send: t("send"), recording: t("recording") }} before={<><input ref={attachmentInputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} /><div className="mb-2 flex justify-end"><Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => attachmentInputRef.current?.click()}><Paperclip className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiAttach")}</Button></div>{replyTo ? <div className="mb-2 flex items-center gap-2 rounded-xl border border-cyan-300/50 bg-cyan-400/10 px-3 py-2 text-xs"><span className="min-w-0 flex-1"><strong>{t("reply")} · {replyTo.author.name}</strong><span className="block truncate text-dtsc-muted">{replyTo.deletedAt ? "—" : replyTo.content}</span></span><button type="button" onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></button></div> : null}{mentionSuggestions.length ? <div className="absolute bottom-20 left-3 z-20 w-[min(28rem,calc(100%-1.5rem))] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-xl">{mentionSuggestions.map((suggestion) => suggestion.kind === "ALL" ? <button key="mention-all" type="button" onClick={() => insertMentionSuggestion(suggestion)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-dtsc-soft"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-700"><AtSign className="h-4 w-4" /></span><span><strong className="block text-sm text-dtsc-ink">@tous</strong><span className="block text-xs text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiNotifyEveryActiveMember")}</span></span></button> : <button key={suggestion.member.id} type="button" onClick={() => insertMentionSuggestion(suggestion)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-dtsc-soft"><ConversationAvatar title={suggestion.member.user.name} avatarUrl={suggestion.member.user.avatarUrl} className="h-8 w-8" /><span className="min-w-0"><strong className="block truncate text-sm text-dtsc-ink">{suggestion.member.user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{suggestion.member.user.jobTitle || suggestion.member.user.email}</span></span></button>)}</div> : null}</>} className="relative" />
          </>
        ) : <div className="flex h-full items-center justify-center p-6 text-center"><div><UsersRound className="mx-auto h-12 w-12 text-cyan-600" /><p className="mt-4 font-black text-dtsc-ink">{t("noConversation")}</p></div></div>}
      </main>

      <Dialog open={filterDialogOpen} title={collaborationExperienceT(userPreferences.locale, "conversationUiConversationFilters")} onClose={() => { setFilterDialogOpen(false); setEditingCustomFilter(null); }}>
        <div className="grid gap-5">
          <form key={editingCustomFilter?.id || "new-filter"} onSubmit={saveCustomFilter} className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm text-dtsc-ink">{editingCustomFilter ? (collaborationExperienceT(userPreferences.locale, "conversationUiEditList")) : (collaborationExperienceT(userPreferences.locale, "conversationUiNewCustomList"))}</strong>{editingCustomFilter ? <Button type="button" size="sm" variant="outline" onClick={() => setEditingCustomFilter(null)}>{collaborationExperienceT(userPreferences.locale, "conversationUiNew")}</Button> : null}</div>
            <Input name="name" required maxLength={40} defaultValue={editingCustomFilter?.name || ""} placeholder={collaborationExperienceT(userPreferences.locale, "conversationUiClientsProjectTeam")} />
            <div className="grid grid-cols-2 gap-2 text-sm text-dtsc-ink">
              <label className="flex items-center gap-2"><input type="checkbox" name="includeDirect" defaultChecked={editingCustomFilter ? normalizeCustomFilterCriteria(editingCustomFilter.criteriaJson).includeDirect : true} />{collaborationExperienceT(userPreferences.locale, "conversationUiDirectChats")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="includeGroups" defaultChecked={editingCustomFilter ? normalizeCustomFilterCriteria(editingCustomFilter.criteriaJson).includeGroups : true} />{collaborationExperienceT(userPreferences.locale, "groupsFilter")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="unreadOnly" defaultChecked={editingCustomFilter ? normalizeCustomFilterCriteria(editingCustomFilter.criteriaJson).unreadOnly : false} />{collaborationExperienceT(userPreferences.locale, "conversationUiUnreadOnly")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="mentionsOnly" defaultChecked={editingCustomFilter ? normalizeCustomFilterCriteria(editingCustomFilter.criteriaJson).mentionsOnly : false} />{collaborationExperienceT(userPreferences.locale, "mentionsNotifications")}</label>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" name="favoritesOnly" defaultChecked={editingCustomFilter ? normalizeCustomFilterCriteria(editingCustomFilter.criteriaJson).favoritesOnly : false} />{collaborationExperienceT(userPreferences.locale, "conversationUiFavoritesOnly")}</label>
            </div>
            <div><p className="mb-2 text-xs font-black uppercase tracking-wide text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiSpecificConversationsOptional")}</p><div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-surface p-2">{groups.map((group) => <label key={group.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-dtsc-ink hover:bg-dtsc-soft"><input type="checkbox" name="selectedGroupIds" value={group.id} defaultChecked={editingCustomFilter ? normalizeCustomFilterCriteria(editingCustomFilter.criteriaJson).selectedGroupIds.includes(group.id) : false} /><span className="min-w-0 flex-1 truncate">{group.name}</span><span className="text-[0.65rem] font-black text-dtsc-muted">{group.groupType === "DIRECT" ? "DIRECT" : t("conversationUiGroupProjection")}</span></label>)}</div></div>
            <Button type="submit"><Plus className="h-4 w-4" />{editingCustomFilter ? (collaborationExperienceT(userPreferences.locale, "conversationUiSaveList")) : (collaborationExperienceT(userPreferences.locale, "conversationUiCreateList"))}</Button>
          </form>
          {customFilters.length ? <div className="grid gap-2"><strong className="text-sm text-dtsc-ink">{collaborationExperienceT(userPreferences.locale, "conversationUiMyLists")}</strong>{customFilters.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-dtsc-border p-2"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setFilter(`CUSTOM:${item.id}`); setFilterDialogOpen(false); }}><strong className="block truncate text-sm text-dtsc-ink">{item.name}</strong><span className="block truncate text-xs text-dtsc-muted">{describeCustomFilter(item.criteriaJson, userPreferences.locale)}</span></button><Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => setEditingCustomFilter(item)} aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiEditFilter")}><Pencil className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" className="h-9 w-9 text-red-700" onClick={() => void deleteCustomFilter(item)} aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiDeleteFilter2")}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : null}
        </div>
      </Dialog>

      <Dialog open={Boolean(mentionAction)} title={mentionAction?.kind === "ALL" ? "@tous" : mentionAction?.user.name || "Mention"} onClose={() => setMentionAction(null)}>
        {mentionAction?.kind === "USER" ? <div className="grid gap-3"><div className="flex items-center gap-3"><ConversationAvatar title={mentionAction.user.name} avatarUrl={mentionAction.user.avatarUrl} className="h-12 w-12" /><div className="min-w-0"><strong className="block truncate text-dtsc-ink">{mentionAction.user.name}</strong><span className="block truncate text-sm text-dtsc-muted">{mentionAction.user.jobTitle || mentionAction.user.email}</span></div></div><Button type="button" onClick={() => { const user = mentionAction.user; setMentionAction(null); void startDirectConversation(user.id); }}><MessageCircle className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiStartDirectConversation")}</Button><Button type="button" variant="outline" onClick={() => { const member = activeGroup?.members.find((item) => item.userId === mentionAction.user.id); if (member) insertMentionSuggestion({ kind: "USER", member }); setMentionAction(null); }}><AtSign className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiMentionAgain")}</Button><Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(mentionAction.user.email); setFeedback(collaborationExperienceT(userPreferences.locale, "conversationUiEmailCopied")); }}><Copy className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiCopyEmail")}</Button><Button asChild type="button" variant="outline"><a href={`mailto:${mentionAction.user.email}`}>{collaborationExperienceT(userPreferences.locale, "conversationUiSendAnEmail")}</a></Button></div> : mentionAction?.kind === "ALL" ? <div className="grid gap-3"><p className="text-sm leading-6 text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiThisMentionTargetsActiveMembersAndCreatesAnUnreadMentionForEachRecipient", { v0: mentionAction.memberCount })}</p>{canManage ? <Button type="button" onClick={() => { insertMentionSuggestion({ kind: "ALL" }); setMentionAction(null); }}><AtSign className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiMentionEveryoneAgain")}</Button> : null}</div> : null}
      </Dialog>

      <Dialog open={directOpen} title={collaborationExperienceT(userPreferences.locale, "conversationUiNewDirectConversation")} onClose={() => setDirectOpen(false)}>
        <div className="grid gap-4">
          <SearchBar value={directSearch} onChange={setDirectSearch} placeholder={currentUserRole === "ADMIN" ? (collaborationExperienceT(userPreferences.locale, "conversationUiSearchAnyPlatformEmail")) : (collaborationExperienceT(userPreferences.locale, "conversationUiSearchAuthorizedOrDiscoverableCollaborators"))} />
          <section>
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiAuthorizedCollaborators")}</p>
            <div className="max-h-[32dvh] overflow-y-auto rounded-xl border border-dtsc-border p-2">
              {users.filter((user) => user.id !== currentUserId).filter((user) => `${user.name} ${user.email} ${user.jobTitle || ""}`.toLowerCase().includes(directSearch.trim().toLowerCase())).slice(0, 60).map((user) => (
                <button key={user.id} type="button" disabled={Boolean(startingDirectUserId)} aria-busy={startingDirectUserId === user.id} onClick={() => void startDirectConversation(user.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-dtsc-soft disabled:cursor-wait disabled:opacity-60">
                  <ConversationAvatar title={user.name} avatarUrl={user.avatarUrl} isOnline={isOnline(user.lastSeenAt)} className="h-10 w-10" />
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{user.jobTitle || user.email}</span></span>
                  {startingDirectUserId === user.id ? <span className="text-xs font-black text-cyan-600">…</span> : <MessageCircle className="h-4 w-4 text-cyan-600" />}
                </button>
              ))}
              {!users.filter((user) => user.id !== currentUserId).length ? <p className="p-4 text-center text-sm text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiNoAuthorizedCollaboratorYet")}</p> : null}
            </div>
          </section>
          <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-200">{collaborationExperienceT(userPreferences.locale, "conversationUiDiscoverAndInvite")}</p>
            <p className="mt-1 text-xs leading-5 text-dtsc-muted">{currentUserRole === "ADMIN" ? (collaborationExperienceT(userPreferences.locale, "conversationUiAdminMaySearchAnyExactPlatformEmailInvitationsAreVisiblyLabeledAdminDtsc")) : (collaborationExperienceT(userPreferences.locale, "conversationUiSearchIsLimitedToAuthorizedCollaboratorsAndProfilesThatOptedIntoDiscovery"))}</p>
            <div className="mt-2 max-h-52 overflow-y-auto">
              {contactSearching ? <p className="p-3 text-center text-sm text-dtsc-muted">…</p> : contactDirectoryUsers.map((user) => <div key={user.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-dtsc-soft"><ConversationAvatar title={user.name} avatarUrl={user.avatarUrl} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{user.jobTitle || user.companyName || user.maskedEmail}</span>{user.invitationLabel ? <span className="mt-1 inline-flex rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-black text-cyan-700 dark:text-cyan-200">{user.invitationLabel}</span> : null}</span><Button type="button" size="sm" disabled={contactRequestBusyId === user.id} onClick={() => void sendContactRequest(user.id)} className="rounded-full"><UserPlus className="h-4 w-4" />{collaborationExperienceT(userPreferences.locale, "conversationUiInvite")}</Button></div>)}
              {!contactSearching && directSearch.trim().length >= 3 && !contactDirectoryUsers.length ? <p className="p-3 text-center text-xs text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiNoNewProfileFound")}</p> : null}
            </div>
            {outgoingContactRequests.length ? <div className="mt-3 border-t border-dtsc-border pt-3"><p className="text-xs font-black text-dtsc-muted">{collaborationExperienceT(userPreferences.locale, "conversationUiPendingInvitations")}</p>{outgoingContactRequests.slice(0, 10).map((request) => <div key={request.id} className="mt-2 flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate font-bold text-dtsc-ink">{request.targetUser.name}</span><Button type="button" size="sm" variant="outline" disabled={contactRequestBusyId === request.id} onClick={() => void respondContactRequest(request.id, "CANCEL")} className="h-8 rounded-full">{collaborationExperienceT(userPreferences.locale, "cancel")}</Button></div>)}</div> : null}
          </section>
        </div>
      </Dialog>

      <Dialog open={groupDialog !== null} title={groupDialog === "edit" ? t("groupSettings") : t("newGroup")} onClose={() => setGroupDialog(null)}><form onSubmit={saveGroup} className="grid gap-4"><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("name")}<Input name="name" defaultValue={groupDialog === "edit" ? activeGroup?.name : ""} required /></label><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("description")}<textarea name="description" defaultValue={groupDialog === "edit" ? activeGroup?.description || "" : ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3" /></label><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("type")}<select name="groupType" defaultValue={groupDialog === "edit" ? activeGroup?.groupType : "PROJECT"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3">{GROUP_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("visibility")}<select name="visibility" defaultValue={groupDialog === "edit" ? activeGroup?.visibility || "PRIVATE" : "PRIVATE"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3"><option value="PRIVATE">PRIVATE</option><option value="COMPANY">COMPANY</option><option value="INTERNAL">INTERNAL</option></select></label><Button type="submit">{groupDialog === "edit" ? t("save") : t("create")}</Button></form></Dialog>

      <Dialog open={infoOpen} title={t("groupInfo")} onClose={() => setInfoOpen(false)}>
        {activeGroup ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <ConversationAvatar title={activeGroup.name} avatarUrl={profiles[activeGroup.id]} type={activeGroup.groupType === "DIRECT" ? "collaborator" : "group"} className="h-16 w-16" />
              <div className="min-w-0"><h3 className="truncate text-xl font-black text-dtsc-ink">{activeGroup.name}</h3><p className="text-sm text-dtsc-muted">{activeGroup.description || activeGroup.groupType}</p></div>
            </div>
            {directPeer && directBlock ? (
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
                <p className="text-sm font-bold text-dtsc-ink">{t("conversationUiPrivacyTitle")}</p>
                <p className="mt-1 text-xs text-dtsc-muted">{directBlock.blockedMe ? t("conversationUiPrivacyLimited") : directBlock.blockedByMe ? t("conversationUiPrivacyBlocked") : t("conversationUiPrivacyAllowed")}</p>
                <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={() => void toggleDirectBlock()}>{directBlock.blockedByMe ? t("conversationUiUnblock") : t("conversationUiBlock")}</Button>
              </div>
            ) : null}
            <div className="border-y border-dtsc-border py-3">
              <p className="text-xs font-black uppercase tracking-wider text-dtsc-muted">{activeGroup.members.length} {t("members")}</p>
              <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                {activeGroup.members.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2 hover:bg-dtsc-soft">
                    <ConversationAvatar title={member.user.name} avatarUrl={member.user.avatarUrl} isOnline={isOnline(member.user.lastSeenAt)} className="h-9 w-9" />
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{member.user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{member.role} · {member.user.jobTitle || member.user.email}</span></span>
                    {isOwner && member.userId !== currentUserId && activeGroup.groupType !== "DIRECT" ? (
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-2 text-xs" onClick={() => void manageGroupMember(member, member.role === "ADMIN" ? "DEMOTE_ADMIN" : "PROMOTE_ADMIN")}>{member.role === "ADMIN" ? t("conversationUiDemote") : t("conversationUiAdministrator")}</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-2 text-xs" onClick={() => void manageGroupMember(member, "TRANSFER_OWNER")}>{t("conversationUiTransfer")}</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-2 text-xs text-red-700" onClick={() => void manageGroupMember(member, "REMOVE")}>{t("conversationUiRemove")}</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={inviteOpen} title={t("invite")} onClose={() => setInviteOpen(false)}><form onSubmit={inviteMembers} className="grid gap-3"><SearchBar value={inviteSearch} onChange={setInviteSearch} placeholder={t("search")} /><div className="max-h-60 overflow-y-auto rounded-xl border border-dtsc-border p-2">{users.filter((user) => !activeGroup?.members.some((member) => member.userId === user.id)).filter((user) => `${user.name} ${user.email} ${user.jobTitle || ""}`.toLowerCase().includes(inviteSearch.toLowerCase())).slice(0, 80).map((user) => <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-dtsc-soft"><input type="checkbox" checked={selectedInviteUserIds.includes(user.id)} onChange={() => setSelectedInviteUserIds((current) => current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id])} /><ConversationAvatar title={user.name} avatarUrl={user.avatarUrl} className="h-8 w-8" /><span className="min-w-0"><strong className="block truncate text-sm">{user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{user.jobTitle || user.email}</span></span></label>)}</div><Input name="invitedEmails" placeholder="email@example.com, …" /><Input name="invitationMessage" placeholder={collaborationExperienceT(userPreferences.locale, "conversationUiInvitationMessage")} /><Button type="submit" disabled={!selectedInviteUserIds.length}>{t("invite")}</Button></form></Dialog>

      <Dialog open={photoOpen} title={t("groupPhoto")} onClose={() => setPhotoOpen(false)}><form onSubmit={uploadPhoto} className="grid gap-4"><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm text-dtsc-ink" /><p className="text-xs text-dtsc-muted">{t("photoHelp")}</p><Button type="submit"><ImagePlus className="h-4 w-4" />{t("save")}</Button></form></Dialog>
      <Dialog open={storyOpen} title={t("addStatus")} onClose={() => setStoryOpen(false)}><form onSubmit={publishStory} className="grid gap-4"><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm text-dtsc-ink" /><Input name="caption" maxLength={280} placeholder={t("statusCaption")} /><Button type="submit"><ImagePlus className="h-4 w-4" />{t("publishStatus")}</Button></form></Dialog>
      <Dialog open={Boolean(selectedStory)} title={t("status")} onClose={() => setSelectedStory(null)} className="h-[92dvh] max-w-xl">{selectedStory ? <div className="flex h-full min-h-[60dvh] flex-col"><div className="min-h-0 flex-1 rounded-2xl bg-black bg-contain bg-center bg-no-repeat" style={{ backgroundImage: selectedStory.imageUrl ? `url(${JSON.stringify(selectedStory.imageUrl).slice(1, -1)})` : undefined }} /><p className="mt-3 text-center text-sm font-semibold text-dtsc-ink">{selectedStory.caption || ""}</p></div> : null}</Dialog>

      <Dialog open={notificationsOpen} title={t("notifications")} onClose={() => setNotificationsOpen(false)}>{activeGroup && activePreference ? <div className="grid gap-2"><Button variant={activePreference.notifications === "ALL" ? "default" : "outline"} onClick={() => void updatePreference(activeGroup.id, { notifications: "ALL" })}>{t("allNotifications")}</Button><Button variant={activePreference.notifications === "MENTIONS" ? "default" : "outline"} onClick={() => void updatePreference(activeGroup.id, { notifications: "MENTIONS" })}>{t("mentionsNotifications")}</Button><Button variant={activePreference.notifications === "NONE" ? "default" : "outline"} onClick={() => void updatePreference(activeGroup.id, { notifications: "NONE" })}>{t("noNotifications")}</Button><div className="my-1 border-t border-dtsc-border" /><Button variant="outline" onClick={() => void updatePreference(activeGroup.id, { mutedUntil: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() } as Partial<Preference>)}><BellOff className="h-4 w-4" />{t("mute8h")}</Button><Button variant="outline" onClick={() => void updatePreference(activeGroup.id, { mutedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } as Partial<Preference>)}><BellOff className="h-4 w-4" />{t("muteWeek")}</Button><Button variant="outline" onClick={() => void updatePreference(activeGroup.id, { mutedUntil: null } as Partial<Preference>)}><Bell className="h-4 w-4" />{t("unmute")}</Button></div> : null}</Dialog>

      <Dialog open={Boolean(editMessage)} title={t("edit")} onClose={() => setEditMessage(null)}><form onSubmit={editCurrentMessage} className="grid gap-3"><Input value={editContent} onChange={(event) => setEditContent(event.target.value)} autoFocus /><Button type="submit">{t("save")}</Button></form></Dialog>
      <Dialog open={Boolean(readInfo)} title={collaborationExperienceT(userPreferences.locale, "conversationUiMessageInfo")} onClose={() => setReadInfo(null)}>{readInfo ? <MessageReadInfo readInfo={readInfo} preferences={userPreferences} /> : null}</Dialog>
      <Dialog open={Boolean(joinedCall)} title={joinedCall?.call.callType === "VIDEO" ? (collaborationExperienceT(userPreferences.locale, "conversationUiVideoCall")) : (collaborationExperienceT(userPreferences.locale, "conversationUiAudioCall"))} onClose={() => void leaveJoinedCall()} className="h-[96dvh] max-w-[96vw] overflow-hidden p-0">
        {joinedCall ? <div data-call-experience={LEGACY_CALL_EXPERIENCE_COMPATIBILITY} className="h-full overflow-y-auto p-2 sm:p-4"><GroupCallRoom joinedCall={joinedCall} group={activeGroup} messages={messages.map((message) => ({ ...message, mentions: message.mentions || [] }))} currentUserId={currentUserId} userPreferences={userPreferences} callPreferences={props.callPreferences} canEnd={joinedCall.call.startedById === currentUserId || canManage} onLeave={leaveJoinedCall} onEnd={() => endGroupCall(joinedCall.call)} onMessageSent={async () => { if (activeGroup) await loadMessages(activeGroup.id); }} /></div> : null}
      </Dialog>

      {activeGroup && canManage ? <GroupPresenceJournalDialog open={presenceJournalOpen} groupId={activeGroup.id} groupName={activeGroup.name} locale={userPreferences.locale} userPreferences={userPreferences} onClose={() => setPresenceJournalOpen(false)} /> : null}
    </div>
  );
}

function normalizeCustomFilterCriteria(value: CustomFilterCriteria | null | undefined): CustomFilterCriteria {
  return {
    includeDirect: value?.includeDirect !== false,
    includeGroups: value?.includeGroups !== false,
    unreadOnly: Boolean(value?.unreadOnly),
    mentionsOnly: Boolean(value?.mentionsOnly),
    favoritesOnly: Boolean(value?.favoritesOnly),
    selectedGroupIds: Array.isArray(value?.selectedGroupIds) ? value.selectedGroupIds.filter((item): item is string => typeof item === "string") : [],
  };
}

function describeCustomFilter(value: CustomFilterCriteria, locale: string | null | undefined) {
  const criteria = normalizeCustomFilterCriteria(value);
  const labels = [
    criteria.includeDirect && (collaborationExperienceT(locale, "conversationUiDirect3")),
    criteria.includeGroups && (collaborationExperienceT(locale, "conversationUiGroups")),
    criteria.unreadOnly && (collaborationExperienceT(locale, "conversationUiUnread")),
    criteria.mentionsOnly && (collaborationExperienceT(locale, "conversationUiMentions")),
    criteria.favoritesOnly && (collaborationExperienceT(locale, "conversationUiFavorites")),
    criteria.selectedGroupIds.length && `${criteria.selectedGroupIds.length} ${collaborationExperienceT(locale, "conversationUiSelected")}`,
  ].filter(Boolean);
  return labels.join(" · ") || (collaborationExperienceT(locale, "conversationUiAllConversations"));
}

function containsMentionAllText(content: string) {
  return /(^|\s)@(tous|all)(?=\s|[.,;:!?…]|$)/iu.test(content);
}

function ProfessionalMessageContent({ message, currentUserId, mine, onMention }: { message: GroupMessage; currentUserId: string; mine: boolean; onMention: (mention: MentionAction) => void }) {
  const mentionedUsers = (message.mentions || []).map((item) => item.mentionedUser);
  const mentionByLabel = new Map(mentionedUsers.map((user) => [`@${user.name}`.toLocaleLowerCase(), user]));
  const mentionLabels = [...mentionByLabel.keys()].sort((left, right) => right.length - left.length).map(escapeRegExp);
  const mentionSource = [message.mentionAll ? "@(?:tous|all)" : "", ...mentionLabels].filter(Boolean).join("|");
  const externalSource = "(?:https?:\\/\\/|www\\.)[^\\s<]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,24}(?:\\/[^\\s<]*)?";
  const matcher = new RegExp(`(${externalSource}${mentionSource ? `|${mentionSource}` : ""})`, "giu");
  const parts: Array<ReactNode> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(message.content)) !== null) {
    if (match.index > cursor) parts.push(message.content.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("@")) {
      const all = /^@(tous|all)$/iu.test(token);
      const user = mentionByLabel.get(token.toLocaleLowerCase());
      if (all) {
        parts.push(<button key={`${match.index}-all`} type="button" onClick={() => onMention({ kind: "ALL", memberCount: mentionedUsers.length })} className={cn("inline rounded px-1 font-black underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", mine ? "bg-white/15 text-white" : "bg-cyan-500/12 text-cyan-700 dark:text-cyan-200")}>@tous</button>);
      } else if (user) {
        parts.push(<button key={`${match.index}-${user.id}`} type="button" onClick={() => onMention({ kind: "USER", user })} className={cn("inline rounded px-1 font-black underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", user.id === currentUserId ? "bg-amber-300/25 text-amber-900 dark:text-amber-200" : mine ? "bg-white/15 text-white" : "bg-cyan-500/12 text-cyan-700 dark:text-cyan-200")}>{token}</button>);
      } else parts.push(token);
    } else {
      if (match.index > 0 && message.content[match.index - 1] === "@") {
        parts.push(token);
        cursor = match.index + token.length;
        continue;
      }
      const trailing = token.match(/[.,;:!?…)}\]]+$/u)?.[0] || "";
      const clean = trailing ? token.slice(0, -trailing.length) : token;
      const href = normalizeMessageExternalUrl(clean);
      parts.push(href ? <a key={`${match.index}-link`} href={href} target="_blank" rel="noopener noreferrer nofollow" className={cn("font-bold underline underline-offset-2", mine ? "text-white" : "text-cyan-700 dark:text-cyan-200")}>{clean}</a> : clean);
      if (trailing) parts.push(trailing);
    }
    cursor = match.index + token.length;
  }
  if (cursor < message.content.length) parts.push(message.content.slice(cursor));
  return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{parts}</p>;
}

function normalizeMessageExternalUrl(value: string) {
  const candidate = /^(?:https?:\/\/)/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function MessageReadInfo({ readInfo, preferences }: { readInfo: ReadInfo; preferences: UserDatePreferences }) {
  const locale = preferences.locale;
  return <div className="grid gap-5"><section><strong className="text-sm text-dtsc-ink">{collaborationExperienceT(locale, "conversationUiReadBy")}</strong><div className="mt-2 divide-y divide-dtsc-border rounded-xl border border-dtsc-border">{readInfo.readBy.length ? readInfo.readBy.map((item) => <div key={item.user.id} className="flex items-center gap-3 p-3"><ConversationAvatar title={item.user.name} avatarUrl={item.user.avatarUrl} isOnline={isOnline(item.user.lastSeenAt)} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{item.user.name}</strong><span className="block text-xs text-dtsc-muted">{collaborationExperienceT(locale, "conversationUiReadAt")} {formatUserDateTime(item.readAt, preferences, { second: "2-digit" })}</span></span><OnlineBadge online={isOnline(item.user.lastSeenAt)} locale={preferences.locale} /></div>) : <p className="p-3 text-sm text-dtsc-muted">{collaborationExperienceT(locale, "conversationUiNoMemberHasReadThisMessageYet")}</p>}</div></section><section><strong className="text-sm text-dtsc-ink">{collaborationExperienceT(locale, "conversationUiNotRead")}</strong><div className="mt-2 divide-y divide-dtsc-border rounded-xl border border-dtsc-border">{readInfo.unreadBy.length ? readInfo.unreadBy.map((item) => <div key={item.user.id} className="flex items-center gap-3 p-3"><ConversationAvatar title={item.user.name} avatarUrl={item.user.avatarUrl} isOnline={isOnline(item.user.lastSeenAt)} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-dtsc-ink">{item.user.name}</strong><span className="block truncate text-xs text-dtsc-muted">{item.user.jobTitle || item.user.email}</span></span><OnlineBadge online={isOnline(item.user.lastSeenAt)} locale={preferences.locale} /></div>) : <p className="p-3 text-sm text-dtsc-muted">{collaborationExperienceT(locale, "conversationUiReadByEveryActiveMember")}</p>}</div></section></div>;
}

function OnlineBadge({ online, locale }: { online: boolean; locale: string | null | undefined }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-black", online ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-dtsc-soft text-dtsc-muted")}>{online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? (collaborationExperienceT(locale, "conversationUiOnline")) : (collaborationExperienceT(locale, "conversationUiOffline"))}</span>;
}

function MessageReceiptIndicator({ summary, locale }: { summary?: GroupMessage["receiptSummary"]; locale: string | null | undefined }) {
  if (summary?.allRead) {
    return <span className="inline-flex items-center text-emerald-300" title={collaborationExperienceT(locale, "conversationUiReadByEveryActiveRecipient")} aria-label={collaborationExperienceT(locale, "conversationUiReadByAll")}><CheckCheck className="h-4 w-4 stroke-[2.5]" /></span>;
  }
  if ((summary?.readCount || 0) > 0) {
    return <span className="inline-flex items-center text-cyan-200" title={collaborationExperienceT(locale, "conversationUiReadByAtLeastOneRecipient")} aria-label={collaborationExperienceT(locale, "conversationUiRead")}><CheckCheck className="h-4 w-4 stroke-[2.5]" /></span>;
  }
  if (summary?.allDelivered) {
    return <span className="inline-flex items-center text-white/80" title={collaborationExperienceT(locale, "conversationUiDeliveredToEveryActiveMember")} aria-label={collaborationExperienceT(locale, "conversationUiDelivered")}><CheckCheck className="h-4 w-4 stroke-[2.5]" /></span>;
  }
  return <span className="inline-flex items-center text-white/65" title={collaborationExperienceT(locale, "conversationUiSentToTheServer")} aria-label={collaborationExperienceT(locale, "conversationUiSent")}><Check className="h-4 w-4 stroke-[2.5]" /></span>;
}

function MessageBubble({ message, voice, currentUserId, userPreferences, canManage, t, onReply, onEdit, onDelete, onInfo, onReact, onPin, onReport, onAttachment, onJumpToMessage, onMention, onMeetingChanged, onError }: { message: GroupMessage; voice?: Voice; currentUserId: string; userPreferences: UserDatePreferences; canManage: boolean; t: (key: Parameters<typeof collaborationExperienceT>[1]) => string; onReply: (message: GroupMessage) => void; onEdit: (message: GroupMessage) => void; onDelete: (message: GroupMessage) => void; onInfo: (messageId: string) => void; onReact: (message: GroupMessage) => void; onPin: (message: GroupMessage) => void; onReport: (message: GroupMessage) => void; onAttachment: (attachmentId: string) => void; onJumpToMessage: (messageId: string) => void; onMention: (mention: MentionAction) => void; onMeetingChanged: () => Promise<void> | void; onError: (message: string) => void }) {
  if (message.messageType === "SYSTEM") return <div className="flex justify-center py-1"><span className="max-w-[90%] rounded-full bg-dtsc-soft px-3 py-1 text-center text-[0.7rem] font-semibold text-dtsc-muted">{message.content}</span></div>;
  const mine = message.authorId === currentUserId;
  const meetingMessage = message.messageType === "MEETING_LINK" || message.messageType === "MEETING_MINUTES_PROMPT" || message.messageType === "MEETING_SUMMARY";
  const items: ActionMenuItem[] = [
    ...(!meetingMessage ? [{ key: "reply", label: t("reply"), icon: MessageCircle, onSelect: () => onReply(message) }] : []),
    { key: "copy", label: t("copy"), icon: Copy, onSelect: () => void navigator.clipboard?.writeText(message.content) },
    { key: "react", label: collaborationExperienceT(userPreferences.locale, "conversationUiLike"), icon: Heart, onSelect: () => onReact(message) },
    { key: "info", label: "Info", icon: Info, onSelect: () => onInfo(message.id) },
    ...(canManage && !meetingMessage ? [{ key: "pin-message", label: message.pinnedAt ? (collaborationExperienceT(userPreferences.locale, "unpin")) : (collaborationExperienceT(userPreferences.locale, "pin")), icon: Pin, onSelect: () => onPin(message) }] : []),
    ...(!mine && !meetingMessage ? [{ key: "report", label: collaborationExperienceT(userPreferences.locale, "conversationUiReport"), icon: Flag, onSelect: () => onReport(message) }] : []),
    ...(mine && message.messageType === "TEXT" && !message.deletedAt ? [{ key: "edit", label: t("edit"), icon: Pencil, onSelect: () => onEdit(message) }] : []),
    ...((mine || canManage) && !message.deletedAt && !meetingMessage ? [{ key: "delete", label: t("deleteMessage"), icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => onDelete(message) }] : []),
  ];
  return <div data-message-id={message.id} tabIndex={-1} className={cn("flex scroll-mt-20 outline-none focus:[&>div]:ring-2 focus:[&>div]:ring-cyan-400", mine ? "justify-end" : "justify-start")}><div className={cn("group relative max-w-[88%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[72%]", mine ? "rounded-br-md bg-cyan-600 text-white" : "rounded-bl-md border border-dtsc-border bg-dtsc-surface text-dtsc-ink", meetingMessage && "border border-dtsc-border bg-dtsc-surface text-dtsc-ink")}><div className="flex items-start gap-2"><div className="min-w-0 flex-1">{!mine && !meetingMessage ? <p className="mb-1 text-[0.7rem] font-black text-cyan-700 dark:text-cyan-300">{message.author.name}</p> : null}{message.replyTo && !meetingMessage ? <button type="button" onClick={() => onJumpToMessage(message.replyTo!.id)} aria-label={collaborationExperienceT(userPreferences.locale, "conversationUiGoToOriginalMessage")} className={cn("mb-2 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[0.7rem]", mine ? "border-white/70 bg-white/10" : "border-cyan-500 bg-dtsc-page")}><strong className="block truncate">{message.replyTo.author.name}</strong><span className="block truncate opacity-75">{message.replyTo.deletedAt ? "—" : message.replyTo.content}</span></button> : null}{message.deletedAt ? <p className="italic opacity-70">{collaborationExperienceT(userPreferences.locale, "conversationUiMessageDeleted")}</p> : meetingMessage ? <CollaborationMeetingMessageContent messageType={message.messageType} content={message.content} meetingLink={message.meetingLink} meetingFollowUp={message.meetingFollowUp} preferences={userPreferences} onChanged={onMeetingChanged} onError={onError} /> : message.messageType === "VOICE" ? <div className="min-w-[220px]"><p className="mb-1 text-xs font-bold">{t("messageVoice")}</p>{voice?.audioUrl ? <audio controls preload="none" src={voice.audioUrl} className="h-9 w-full max-w-[280px]" /> : <p className="text-xs opacity-70">{t("conversationUiAudioUnavailable")}</p>}</div> : <ProfessionalMessageContent message={message} currentUserId={currentUserId} mine={mine} onMention={onMention} />}{message.attachments?.length ? <div className="mt-2 grid gap-1">{message.attachments.map((attachment) => <button key={attachment.id} type="button" onClick={() => onAttachment(attachment.id)} className={cn("flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs", mine ? "border-white/25 bg-white/10" : "border-dtsc-border bg-dtsc-page")}><Paperclip className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{attachment.originalName}</span><span className="shrink-0 opacity-70">{Math.ceil(attachment.sizeBytes / 1024)} {t("conversationUiKilobytesShort")}</span></button>)}</div> : null}{message.reactions?.length ? <div className="mt-2 flex flex-wrap gap-1">{Object.entries(message.reactions.reduce<Record<string, number>>((acc, reaction) => ({ ...acc, [reaction.reactionType]: (acc[reaction.reactionType] || 0) + 1 }), {})).map(([reaction, count]) => <button key={reaction} type="button" onClick={() => onReact(message)} className={cn("rounded-full border px-2 py-0.5 text-[0.68rem] font-bold", mine ? "border-white/25 bg-white/10" : "border-dtsc-border bg-dtsc-page")}>♥ {count}</button>)}</div> : null}<p className={cn("mt-1 flex items-center justify-end gap-1 text-right text-[0.62rem] font-semibold", mine && !meetingMessage ? "text-white/70" : "text-dtsc-muted")}><span>{formatRelativeUserDateTime(message.createdAt, userPreferences)}{message.editedAt || message.status === "EDITED" ? (collaborationExperienceT(userPreferences.locale, "conversationUiEdited")) : ""}{message.pinnedAt ? (collaborationExperienceT(userPreferences.locale, "conversationUiPinned")) : ""}</span>{mine && !meetingMessage ? <MessageReceiptIndicator summary={message.receiptSummary} locale={userPreferences.locale} /> : null}</p></div><ActionMenu items={items} label="Message" orientation="horizontal" className={cn("-mr-1 -mt-1 scale-75 opacity-70 transition group-hover:opacity-100", mine && !meetingMessage ? "[&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white" : "")} /></div></div></div>;
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

function mergeMessages(left: GroupMessage[], right: GroupMessage[]) {
  const map = new Map<string, GroupMessage>();
  for (const message of [...left, ...right]) map.set(message.id, { ...(map.get(message.id) || {}), ...message } as GroupMessage);
  return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}
