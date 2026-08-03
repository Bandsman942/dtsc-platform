import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

function expect(errors, condition, message) {
  if (!condition) errors.push(message);
}

function source(files) {
  return files.map((file) => read(file)).join("\n");
}

const scopes = {
  model: () => {
    const errors = [];
    const schema = source(["prisma/schema.prisma", "prisma/standard-collaboration.prisma"]);
    const migration = read("prisma/migrations/20260803124500_professionalize_standard_collaboration/migration.sql");
    for (const token of ["contextType", "directKey", "clientMessageId", "CollaborationMessageReaction", "CollaborationMessageAttachment", "CollaborationUserBlock", "CollaborationModerationAction", "AnnouncementCommentReaction", "AnnouncementCommentReport"]) {
      expect(errors, schema.includes(token), `Schéma collaboration: élément absent ${token}`);
      expect(errors, migration.includes(token), `Migration collaboration: élément absent ${token}`);
    }
    expect(errors, !/DROP\s+(TABLE|COLUMN)/i.test(migration), "Migration collaboration: opération destructive interdite");
    return errors;
  },
  access: () => {
    const errors = [];
    const page = read("app/collaborators/page.tsx");
    const service = read("lib/standard-collaboration.ts");
    const collaboration = read("lib/collaboration.ts");
    expect(errors, !page.includes("take: 500"), "Mes collaborateurs ne doit plus charger un annuaire global de 500 utilisateurs");
    expect(errors, service.includes("authorizedCollaboratorIds") && service.includes("organizationMember.findMany"), "Recherche collaborateurs: périmètre autorisé absent");
    expect(errors, service.includes("resolveDirectConversation") && service.includes("directKey"), "Conversation directe idempotente absente");
    expect(errors, !collaboration.includes("role === UserRole.ADMIN || member?.role"), "Un rôle global ne doit pas gérer implicitement un groupe");
    return errors;
  },
  idempotency: () => {
    const errors = [];
    const messages = read("app/api/collaborators/groups/[id]/messages/route.ts");
    const validators = read("lib/validators.ts");
    expect(errors, validators.includes("clientMessageId"), "Validation clientMessageId absente");
    expect(errors, messages.includes("clientMessageId") && messages.includes("findFirst"), "Réutilisation idempotente du message absente");
    expect(errors, messages.includes("cross_group_reply") || messages.includes("replyTo"), "Contrôle de réponse dans le même groupe absent");
    return errors;
  },
  deepLinks: () => {
    const errors = [];
    const messages = read("app/api/collaborators/groups/[id]/messages/route.ts");
    const page = read("app/collaborators/page.tsx");
    const announcementPage = read("app/announcements/[id]/page.tsx");
    expect(errors, messages.includes("messageId"), "Chargement du message ciblé absent");
    expect(errors, page.includes("initialMessageId"), "Message profond non transmis à l’interface");
    expect(errors, announcementPage.includes("commentId") && announcementPage.includes("targetedComment"), "Commentaire profond non chargé");
    return errors;
  },
  notifications: () => {
    const errors = [];
    const messages = read("app/api/collaborators/groups/[id]/messages/route.ts");
    const announcements = read("app/api/announcements/route.ts");
    expect(errors, messages.includes("idempotencyKey") && messages.includes("collaboratorsNotificationTarget"), "Notification message précise/dédupliquée absente");
    expect(errors, announcements.includes("idempotencyKey") && announcements.includes("announcementNotificationTarget"), "Notification annonce précise/dédupliquée absente");
    return errors;
  },
  media: () => {
    const errors = [];
    const media = read("lib/collaboration-media.ts");
    const upload = read("app/api/collaborators/groups/[id]/attachments/route.ts");
    const download = read("app/api/collaborators/attachments/[attachmentId]/route.ts");
    for (const token of ["checksum", "createSignedUrl", "ATTACHMENT_MAX_BYTES", "ATTACHMENT_TYPES"]) expect(errors, media.includes(token), `Média: contrôle absent ${token}`);
    expect(errors, upload.includes("assertGroupMemberForSession") && upload.includes("isSameOriginRequest"), "Upload pièce jointe non protégé");
    expect(errors, download.includes("assertGroupMemberForSession"), "Téléchargement pièce jointe non protégé");
    return errors;
  },
  comments: () => {
    const errors = [];
    const collection = read("app/api/announcements/[id]/comments/route.ts");
    const item = read("app/api/announcements/comments/[id]/route.ts");
    expect(errors, collection.includes("cursor") && collection.includes("take"), "Commentaires non paginés");
    expect(errors, collection.includes("parentId") && collection.includes("mentionedUserIds"), "Réponse/mention commentaire absente");
    expect(errors, item.includes("deletedAt") && item.includes("RESTORE"), "Suppression logique/restauration commentaire absente");
    return errors;
  },
  presence: () => {
    const errors = [];
    const service = read("lib/standard-collaboration.ts");
    expect(errors, service.includes("CollaborationPresenceSession") || service.includes("collaborationPresenceSession"), "Présence persistée absente");
    expect(errors, service.includes("lastHeartbeatAt") && service.includes("90"), "Expiration honnête de présence absente");
    return errors;
  },
  calls: () => {
    const errors = [];
    const start = read("app/api/collaborators/groups/[id]/calls/route.ts");
    const join = read("app/api/collaborators/calls/[id]/join/route.ts");
    const end = read("app/api/collaborators/calls/[id]/end/route.ts");
    const reject = read("app/api/collaborators/calls/[id]/reject/route.ts");
    const expiry = read("lib/collaboration-calls.ts");
    expect(errors, start.includes("CALL_NOT_AVAILABLE") && start.includes("ringExpiresAt"), "Disponibilité/délai appel absent");
    expect(errors, join.includes("acceptedAt"), "Date d’acceptation serveur absente");
    expect(errors, reject.includes("CALL_REJECTED"), "Refus d’appel absent");
    expect(errors, end.includes("CANCELLED") && end.includes("acceptedAt"), "Annulation/durée serveur absente");
    expect(errors, expiry.includes("MISSED") && expiry.includes("CALL_MISSED"), "Appel manqué serveur absent");
    return errors;
  },
  announcements: () => {
    const errors = [];
    const create = read("app/api/announcements/route.ts");
    const access = read("lib/announcement-access.ts");
    const page = read("app/announcements/page.tsx");
    expect(errors, create.includes("publicationMode") && create.includes("SCHEDULING_NOT_AVAILABLE"), "Brouillon/programmation honnête absents");
    expect(errors, create.includes("resolveAnnouncementScope") && access.includes("announcementVisibilityWhere"), "Audience serveur absente");
    expect(errors, page.includes("take: 50") && page.includes("_count"), "Fil d’annonces non borné");
    return errors;
  },
  moderation: () => {
    const errors = [];
    const group = read("app/api/collaborators/groups/[id]/moderation/route.ts");
    const report = read("app/api/announcements/[id]/report/route.ts");
    expect(errors, group.includes("CollaborationModerationAction") || group.includes("collaborationModerationAction"), "Audit de modération groupe absent");
    expect(errors, group.includes("canManageGroup") && group.includes("writeAuditLog"), "Permission/audit modération groupe absent");
    expect(errors, report.includes("organizationMemberships") && report.includes("idempotencyKey"), "Modération d’annonce non contextualisée/dédupliquée");
    return errors;
  },
  guides: () => {
    const errors = [];
    for (const file of ["COLLABORATORS.md", "DIRECT_CONVERSATIONS.md", "GROUP_CONVERSATIONS.md", "CALLS.md", "ANNOUNCEMENTS.md", "COMMENTS_AND_REACTIONS.md", "COLLABORATION_MODERATION.md"]) {
      expect(errors, exists(`docs/user-guides/${file}`), `Guide utilisateur absent ${file}`);
    }
    const runtime = read("lib/account/standard-guides.ts");
    expect(errors, runtime.includes('"collaborators"') && runtime.includes('"announcements"') && runtime.includes('"calls"'), "Guides non exposés dans l’aide standard");
    return errors;
  },
};

export function runStandardCollaborationAudit(scope = "all") {
  const selected = scope === "all" ? Object.keys(scopes) : [scope];
  const errors = [];
  for (const key of selected) {
    if (!scopes[key]) errors.push(`Audit inconnu: ${key}`);
    else errors.push(...scopes[key]());
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
