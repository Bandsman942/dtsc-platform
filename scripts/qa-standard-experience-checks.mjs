import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const standardPages = [
  "app/dashboard/page.tsx",
  "app/notifications/page.tsx",
  "app/announcements/page.tsx",
  "app/company/page.tsx",
  "app/billing/page.tsx",
  "app/support/page.tsx",
  "app/settings/page.tsx",
  "app/profile/page.tsx",
];

for (const page of standardPages) {
  const content = read(page);
  expect(content.includes("ModuleWorkspace"), `${page}: ModuleWorkspace absent`);
  expect(content.includes("ModuleHeader"), `${page}: ModuleHeader absent`);
  expect(content.includes("ModuleContent"), `${page}: ModuleContent absent`);
  expect(content.includes("ModuleSection"), `${page}: ModuleSection absent`);
}

const metrics = read("components/workspace/module-metrics.tsx");
for (const token of ["touch-pan-x", "snap-mandatory", "flex-nowrap", "overflow-x-auto", "lg:grid"]) {
  expect(metrics.includes(token), `ModuleMetrics: contrat mobile manquant ${token}`);
}
expect(!metrics.includes("sm:grid"), "ModuleMetrics: le rail mobile ne doit pas devenir une grille dès sm");

const notificationList = read("components/notifications/notification-list.tsx");
const notificationTargets = read("lib/notification-targets.ts");
const notificationService = read("lib/notifications.ts");
expect(notificationList.includes("activateNotification") && notificationList.includes("router.push(targetFor(notification))"), "Notifications: le clic principal doit ouvrir la cible");
expect(notificationList.includes("Ouvrir l&apos;élément"), "Notifications: libellé d’ouverture précise absent");
expect(notificationTargets.includes("announcementNotificationTarget") && notificationTargets.includes("supportNotificationTarget") && notificationTargets.includes("publicationNotificationTarget"), "Notifications: builders de cibles précises absents");
expect(notificationService.includes("normalizeNotificationTarget") && notificationService.includes("resolvedTargetUrl"), "Notifications: normalisation centrale des cibles absente");

const announcementRoute = read("app/api/announcements/route.ts");
const announcementComments = read("app/api/announcements/[id]/comments/route.ts");
const supportRoute = read("app/api/support/tickets/route.ts");
const supportMessages = read("app/api/support/tickets/[id]/messages/route.ts");
const publicationComments = read("app/api/publications/[id]/comments/route.ts");
expect(announcementRoute.includes("announcementNotificationTarget(announcement.id)"), "Annonce: notification de création non ciblée");
expect(announcementComments.includes("announcementNotificationTarget(announcement.id, comment.id)"), "Annonce: notification de commentaire non ciblée");
expect(supportRoute.includes("supportNotificationTarget(ticket.id)"), "Support: notification de ticket non ciblée");
expect(supportMessages.includes("supportNotificationTarget(ticket.id, message.id)"), "Support: notification de message non ciblée");
expect(publicationComments.includes("publicationNotificationTarget(publication.slug, comment.id)"), "Publication: notification de commentaire non ciblée");

const collapsibleThread = read("components/workspace/collapsible-thread.tsx");
const activityDetail = read("components/activities/activity-detail.tsx");
const enterpriseCore = read("components/enterprise/enterprise-core-workspace.tsx");
const announcementWall = read("components/announcements/announcement-wall.tsx");
const publicationEngagement = read("components/public/publication-engagement.tsx");
expect(collapsibleThread.includes("data-collapsible-thread") && collapsibleThread.includes("aria-expanded"), "Commentaires: primitive repliable accessible absente");
expect(activityDetail.includes("<CollapsibleThread"), "Commentaires Activités: repli absent");
expect(enterpriseCore.includes("<CollapsibleThread"), "Commentaires Enterprise Core: repli absent");
expect(announcementWall.includes("openCommentIds"), "Commentaires Annonces: repli existant perdu");
expect(publicationEngagement.includes("commentsOpen"), "Commentaires Publications: repli existant perdu");

const mediaEnhancer = read("components/announcements/announcement-media-enhancer.tsx");
const announcementsPage = read("app/announcements/page.tsx");
const announcementDetail = read("app/announcements/[id]/page.tsx");
expect(mediaEnhancer.includes("createPortal") && mediaEnhancer.includes("MAX_ZOOM") && mediaEnhancer.includes("object-contain"), "Annonces: visionneuse haute résolution absente");
expect(announcementsPage.includes("AnnouncementMediaEnhancer") && announcementsPage.includes("data-announcement-media-root"), "Annonces: visionneuse non montée dans le fil");
expect(announcementDetail.includes("AnnouncementDeepLinkActivator") && announcementDetail.includes("AnnouncementMediaEnhancer"), "Annonce ciblée: focus commentaire ou visionneuse absent");

const packageJson = read("package.json");
expect(packageJson.includes("qa:standard-experience"), "package.json: script qa:standard-experience absent");
expect(packageJson.includes("qa-standard-experience-checks.mjs"), "package.json: quality gate standard experience absent de qa:regression");

if (failures.length) {
  console.error(`Standard experience QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Standard experience QA passed: standard workspaces, horizontal KPI rail, exact notification targets, collapsible comments and announcement media viewer are guarded.");
