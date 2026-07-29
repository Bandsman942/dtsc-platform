import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(content, from, to, label) {
  if (content.includes(to)) return content;
  const index = content.indexOf(from);
  if (index < 0) throw new Error(`Missing integration anchor: ${label}`);
  return content.slice(0, index) + to + content.slice(index + from.length);
}
function appendOnce(content, marker, block) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${block.trim()}\n`;
}

// Prisma: expand-only Sprint 4 models and inverse relations.
{
  const path = "prisma/schema.prisma";
  let content = read(path);
  const relationAnchor = "  payrolls            HrcfoPayroll[]\n";
  const relationBlock = `${relationAnchor}  workEntries         DtscWorkEntry[]            @relation("DtscWorkEntryEmployee")\n  workSubmissions     DtscWorkSubmission[]       @relation("DtscWorkSubmissionEmployee")\n  reviewedWorkSubmissions DtscWorkSubmission[]   @relation("DtscWorkSubmissionReviewer")\n  workSubmissionReviews DtscWorkSubmissionReview[] @relation("DtscWorkSubmissionReviewActor")\n`;
  if (!content.includes('workEntries         DtscWorkEntry[]')) {
    content = replaceOnce(content, relationAnchor, relationBlock, "HrcfoEmployee payroll relation");
  }
  if (!content.includes("model DtscWorkSubmission {")) {
    content = `${content.trimEnd()}\n\nmodel DtscWorkSubmission {\n  id                 String                     @id @default(cuid())\n  employeeId         String\n  periodStart        DateTime\n  periodEnd          DateTime\n  status             String                     @default("DRAFT")\n  declaredMinutes    Int                        @default(0)\n  validatedMinutes   Int?\n  submittedAt        DateTime?\n  reviewerEmployeeId String?\n  reviewedAt         DateTime?\n  reviewComment      String?\n  revision           Int                        @default(0)\n  createdById        String\n  createdAt          DateTime                   @default(now())\n  updatedAt          DateTime                   @updatedAt\n  employee           HrcfoEmployee              @relation("DtscWorkSubmissionEmployee", fields: [employeeId], references: [id], onDelete: Restrict)\n  reviewer           HrcfoEmployee?             @relation("DtscWorkSubmissionReviewer", fields: [reviewerEmployeeId], references: [id], onDelete: SetNull)\n  entries            DtscWorkEntry[]\n  reviews            DtscWorkSubmissionReview[]\n\n  @@unique([employeeId, periodStart, periodEnd])\n  @@index([status, periodStart])\n  @@index([reviewerEmployeeId, status])\n  @@index([employeeId, periodStart])\n}\n\nmodel DtscWorkEntry {\n  id                          String              @id @default(cuid())\n  employeeId                  String\n  workDate                    DateTime\n  startTime                   String\n  endTime                     String\n  breakMinutes                Int                 @default(0)\n  workedMinutes               Int\n  locationMode                String?\n  workType                    String              @default("NORMAL_WORK")\n  summary                     String\n  details                     String?\n  sourceType                  String?\n  sourceId                    String?\n  submissionId                String?\n  scheduleOutsideAvailability Boolean             @default(false)\n  scheduleBlockingCount       Int                 @default(0)\n  scheduleWarningCount        Int                 @default(0)\n  createdById                 String\n  createdAt                   DateTime            @default(now())\n  updatedAt                   DateTime            @updatedAt\n  deletedAt                   DateTime?\n  employee                    HrcfoEmployee       @relation("DtscWorkEntryEmployee", fields: [employeeId], references: [id], onDelete: Restrict)\n  submission                  DtscWorkSubmission? @relation(fields: [submissionId], references: [id], onDelete: Restrict)\n\n  @@index([employeeId, workDate, deletedAt])\n  @@index([submissionId, deletedAt])\n  @@index([sourceType, sourceId])\n}\n\nmodel DtscWorkSubmissionReview {\n  id              String             @id @default(cuid())\n  submissionId    String\n  actorEmployeeId String\n  action          String\n  comment         String?\n  createdAt       DateTime           @default(now())\n  submission      DtscWorkSubmission @relation(fields: [submissionId], references: [id], onDelete: Restrict)\n  actor           HrcfoEmployee      @relation("DtscWorkSubmissionReviewActor", fields: [actorEmployeeId], references: [id], onDelete: Restrict)\n\n  @@index([submissionId, createdAt])\n  @@index([actorEmployeeId, createdAt])\n}\n`;
  }
  write(path, content);
}

// QA package integration.
{
  const path = "package.json";
  const json = JSON.parse(read(path));
  json.scripts["qa:work-prestations"] = "node scripts/qa-work-prestations-checks.mjs";
  if (!json.scripts["qa:regression"].includes("qa-work-prestations-checks.mjs")) {
    json.scripts["qa:regression"] += " && node scripts/qa-work-prestations-checks.mjs";
  }
  write(path, `${JSON.stringify(json, null, 2)}\n`);
}

// I18N.
const dictionaries = {
  fr: {
    title: "Mes prestations", description: "Déclarez le travail réellement effectué, comparez-le à votre planning et soumettez votre semaine à une validation indépendante.",
    add: "Ajouter une prestation", loading: "Chargement…", loadError: "Impossible de charger vos prestations.", weeklySummary: "Résumé de la semaine",
    declaredTime: "Temps déclaré", validatedTime: "Temps validé", entries: "Prestations", workedDays: "Jours déclarés", scheduleIssues: "Écarts planning",
    revision: "Révision", availabilityDisclaimer: "Disponibilité ≠ temps travaillé. Seules les prestations explicitement déclarées puis validées pourront alimenter le Sprint 5.",
    reviewComment: "Commentaire de validation", submit: "Soumettre", resubmit: "Resoumettre", submitted: "Période soumise.", resubmitted: "Période resoumise.", submitError: "Soumission impossible.",
    deleted: "Prestation supprimée.", deleteError: "Suppression impossible.", actions: "Actions", edit: "Modifier", delete: "Supprimer", break: "Pause",
    locationUnknown: "Mode non défini", absenceConflict: "Conflit absence", outsideSchedule: "Hors planning", scheduleWarning: "Exception planning", scheduleOk: "Planning cohérent",
    noEntries: "Aucune prestation cette semaine", noEntriesDescription: "Ajoutez le travail réellement effectué avant de soumettre cette période.", unavailable: "Prestations indisponibles",
    history: "Historique", historyDescription: "Périodes récentes et décisions de validation.", historyItemDescription: "Aucun commentaire de review.",
    submitTitle: "Soumettre la semaine", resubmitTitle: "Resoumettre la semaine", submitDescription: "Le validateur verra les prestations déclarées, le planning effectif et les écarts détectés.",
    confirmSubmit: "Soumettre cette période pour validation ? Les lignes seront verrouillées jusqu’à une éventuelle demande de correction.", cancel: "Annuler",
    scheduleConflictTitle: "Conflit de planning détecté", conflictConfirmation: "La soumission reste possible si la déclaration est exacte, mais ce conflit sera clairement visible par le reviewer.", submitChecksReady: "Les contrôles de durée et de chevauchement seront recalculés côté serveur avant la soumission.",
    addTitle: "Ajouter une prestation", editTitle: "Modifier la prestation", entryFormDescription: "Décrivez le travail réellement effectué. Les minutes sont calculées côté serveur.", save: "Enregistrer", saveError: "Enregistrement impossible.", created: "Prestation enregistrée.", updated: "Prestation mise à jour.",
    date: "Date", start: "Début", end: "Fin", workType: "Type de travail", location: "Mode de travail", summary: "Résumé du travail réalisé", details: "Détails / résultat / livrable",
    reviewTitle: "Validation des prestations", reviewDescriptionCoo: "Examinez les soumissions nécessitant une validation COO, sans modifier directement les déclarations des collaborateurs.", reviewDescriptionCeo: "Examinez uniquement les soumissions du COO nécessitant une validation croisée CEO.",
    reviewMetrics: "File de validation", queueSubmitted: "À valider", queueChanges: "À corriger", queueApproved: "Validées", queueRejected: "Refusées", reviewFilters: "Filtres des prestations", search: "Rechercher", searchPlaceholder: "Collaborateur, poste, département, période…", allStatuses: "Tous les statuts", noActiveFilter: "Aucun filtre actif",
    reviewQueue: "Soumissions", reviewQueueDescription: "Une soumission est validée une seule fois et aucune auto-validation n’est autorisée.", review: "Examiner", noReviewItems: "Aucune soumission à afficher", noReviewItemsDescription: "La file correspondant aux filtres actuels est vide.", reviewLoadError: "Impossible de charger la file de validation.", reviewError: "Décision impossible.",
    reviewDetailDescription: "Comparez prestations, temps déclaré, planning et historique avant de décider.", requestChanges: "Demander correction", reject: "Refuser", approve: "Valider", approved: "Soumission validée.", changesRequested: "Correction demandée.", rejected: "Soumission refusée.",
    approveTitle: "Valider la soumission", changesTitle: "Demander une correction", rejectTitle: "Refuser la soumission", approveDescription: "La validation fixe les minutes validées au total déclaré recalculé côté serveur.", reviewReasonDescription: "Expliquez clairement le motif afin que l’historique reste compréhensible.", comment: "Motif / commentaire", approveConfirmation: "Confirmez la validation de cette période. Le collaborateur ne pourra plus modifier les prestations approuvées dans le workflow normal.",
    period: "Période", reviewSummaryDescription: "Synthèse de la période soumise.", planningComparison: "Comparaison au planning", planningComparisonDescription: "Les écarts servent d’aide à la décision et ne constituent ni fraude ni retenue automatique.", planningIssuesPresent: "Au moins une prestation présente un écart avec la disponibilité effective, une absence ou une exception de planning.", entriesDetailDescription: "Travail réellement déclaré pendant la période.",
    reviewHistory: "Historique des reviews", reviewHistoryDescription: "Soumissions, resoumissions et décisions conservées chronologiquement.", noReviewComment: "Aucun commentaire.", noReviewHistory: "Aucun historique", noReviewHistoryDescription: "Aucune action de review n’a encore été enregistrée.",
    status_DRAFT: "Brouillon", status_SUBMITTED: "Soumise", status_CHANGES_REQUESTED: "À corriger", status_APPROVED: "Validée", status_REJECTED: "Refusée", status_CANCELLED: "Annulée",
    type_NORMAL_WORK: "Travail normal", type_MEETING: "Réunion", type_MISSION: "Mission", type_PROJECT_WORK: "Travail projet", type_SUPPORT: "Support", type_TRAINING: "Formation", type_ADMINISTRATIVE: "Administratif", type_OTHER: "Autre",
    review_SUBMITTED: "Soumission", review_RESUBMITTED: "Resoumission", review_APPROVED: "Validation", review_CHANGES_REQUESTED: "Correction demandée", review_REJECTED: "Refus"
  },
  en: {
    title: "My work", description: "Declare work actually performed, compare it with your schedule, and submit the week for independent review.",
    add: "Add work entry", loading: "Loading…", loadError: "Unable to load your work entries.", weeklySummary: "Weekly summary",
    declaredTime: "Declared time", validatedTime: "Validated time", entries: "Work entries", workedDays: "Declared work days", scheduleIssues: "Schedule variances",
    revision: "Revision", availabilityDisclaimer: "Availability ≠ worked time. Only explicitly declared and approved work may feed Sprint 5.",
    reviewComment: "Review comment", submit: "Submit", resubmit: "Resubmit", submitted: "Period submitted.", resubmitted: "Period resubmitted.", submitError: "Submission failed.",
    deleted: "Work entry deleted.", deleteError: "Delete failed.", actions: "Actions", edit: "Edit", delete: "Delete", break: "Break",
    locationUnknown: "Mode not defined", absenceConflict: "Absence conflict", outsideSchedule: "Outside schedule", scheduleWarning: "Schedule exception", scheduleOk: "Schedule consistent",
    noEntries: "No work entry this week", noEntriesDescription: "Add work actually performed before submitting this period.", unavailable: "Work entries unavailable",
    history: "History", historyDescription: "Recent periods and review decisions.", historyItemDescription: "No review comment.",
    submitTitle: "Submit week", resubmitTitle: "Resubmit week", submitDescription: "The reviewer will see declared work, effective schedule, and detected variances.",
    confirmSubmit: "Submit this period for review? Entries will be locked until a correction is requested if needed.", cancel: "Cancel",
    scheduleConflictTitle: "Schedule conflict detected", conflictConfirmation: "Submission remains possible when the declaration is accurate, but the conflict will be clearly visible to the reviewer.", submitChecksReady: "Duration and overlap checks will be recalculated by the server before submission.",
    addTitle: "Add work entry", editTitle: "Edit work entry", entryFormDescription: "Describe work actually performed. Minutes are calculated by the server.", save: "Save", saveError: "Unable to save.", created: "Work entry saved.", updated: "Work entry updated.",
    date: "Date", start: "Start", end: "End", workType: "Work type", location: "Work mode", summary: "Work summary", details: "Details / result / deliverable",
    reviewTitle: "Work submission review", reviewDescriptionCoo: "Review submissions requiring COO validation without directly editing employees’ declarations.", reviewDescriptionCeo: "Review only COO submissions requiring CEO cross-validation.",
    reviewMetrics: "Review queue", queueSubmitted: "To review", queueChanges: "Needs correction", queueApproved: "Approved", queueRejected: "Rejected", reviewFilters: "Work submission filters", search: "Search", searchPlaceholder: "Employee, role, department, period…", allStatuses: "All statuses", noActiveFilter: "No active filter",
    reviewQueue: "Submissions", reviewQueueDescription: "A submission is approved once and self-approval is never allowed.", review: "Review", noReviewItems: "No submission to display", noReviewItemsDescription: "The current filtered queue is empty.", reviewLoadError: "Unable to load the review queue.", reviewError: "Review action failed.",
    reviewDetailDescription: "Compare work entries, declared time, schedule, and history before deciding.", requestChanges: "Request changes", reject: "Reject", approve: "Approve", approved: "Submission approved.", changesRequested: "Changes requested.", rejected: "Submission rejected.",
    approveTitle: "Approve submission", changesTitle: "Request changes", rejectTitle: "Reject submission", approveDescription: "Approval sets validated minutes to the server-recalculated declared total.", reviewReasonDescription: "Give a clear reason so the audit history remains understandable.", comment: "Reason / comment", approveConfirmation: "Confirm approval of this period. The employee will no longer be able to edit approved work in the normal workflow.",
    period: "Period", reviewSummaryDescription: "Submitted period summary.", planningComparison: "Schedule comparison", planningComparisonDescription: "Variances support review and do not automatically imply fraud or payroll deductions.", planningIssuesPresent: "At least one entry differs from effective availability or overlaps an absence/schedule exception.", entriesDetailDescription: "Work actually declared during the period.",
    reviewHistory: "Review history", reviewHistoryDescription: "Submissions, resubmissions and decisions kept chronologically.", noReviewComment: "No comment.", noReviewHistory: "No review history", noReviewHistoryDescription: "No review action has been recorded yet.",
    status_DRAFT: "Draft", status_SUBMITTED: "Submitted", status_CHANGES_REQUESTED: "Needs changes", status_APPROVED: "Approved", status_REJECTED: "Rejected", status_CANCELLED: "Cancelled",
    type_NORMAL_WORK: "Normal work", type_MEETING: "Meeting", type_MISSION: "Mission", type_PROJECT_WORK: "Project work", type_SUPPORT: "Support", type_TRAINING: "Training", type_ADMINISTRATIVE: "Administrative", type_OTHER: "Other",
    review_SUBMITTED: "Submitted", review_RESUBMITTED: "Resubmitted", review_APPROVED: "Approved", review_CHANGES_REQUESTED: "Changes requested", review_REJECTED: "Rejected"
  }
};
for (const locale of ["fr", "en"]) {
  const path = `locales/${locale}.json`;
  const json = JSON.parse(read(path));
  json.workPrestations = dictionaries[locale];
  write(path, `${JSON.stringify(json, null, 2)}\n`);
}

// Activities integration.
{
  const path = "components/activities/activities-dashboard.tsx";
  let content = read(path);
  content = replaceOnce(content,
    'import { ActivityDetail } from "@/components/activities/activity-detail";\n',
    'import { ActivityDetail } from "@/components/activities/activity-detail";\nimport { WorkPrestationsPanel } from "@/components/activities/work-prestations-panel";\n',
    "activities work panel import");
  content = replaceOnce(content,
    '  currentUserRole,\n  sections,\n',
    '  currentUserRole,\n  locale,\n  sections,\n',
    "activities locale destructuring");
  content = replaceOnce(content,
    '  currentUserRole: string;\n  sections: ActivitySection[];\n',
    '  currentUserRole: string;\n  locale?: string | null;\n  sections: ActivitySection[];\n',
    "activities locale type");
  content = replaceOnce(content,
    '      <ModuleContent>\n        {!hasAnyVisibleItem && hasFilters ? (\n',
    '      <ModuleContent>\n        <WorkPrestationsPanel locale={locale} />\n        {!hasAnyVisibleItem && hasFilters ? (\n',
    "activities work panel render");
  write(path, content);
}
{
  const path = "app/activities/page.tsx";
  let content = read(path);
  content = replaceOnce(content,
    '        currentUserRole={user.role}\n        sections={sections}\n',
    '        currentUserRole={user.role}\n        locale={user.locale}\n        sections={sections}\n',
    "activities page locale prop");
  write(path, content);
}

// Admin COO / CEO integration.
{
  const path = "app/admin/page.tsx";
  let content = read(path);
  content = replaceOnce(content,
    'import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";\n',
    'import { OperationsAdminPanel } from "@/components/admin/operations-admin-panel";\nimport { WorkSubmissionReviewPanel } from "@/components/admin/work-submission-review-panel";\n',
    "admin work review import");
  const cooOld = `        {activeSection === "coo" && canView("coo") && (\n          <OperationsAdminPanel\n            eyebrow="Chief Operating Officer"\n            title="Pilotage COO"\n            description="Organisez les opérations internes, distribuez les tâches, suivez les blocages, structurez les réunions et consolidez les rapports opérationnels DTSC."\n            playbook={["Opération cadrée", "Tâches assignées", "Coordination", "Blocages traités", "Validation", "Rapport opérationnel"]}\n            datasets={internalModulesDataset.cooDatasets}\n            canEdit={canView("coo")}\n          />\n        )}`;
  const cooNew = `        {activeSection === "coo" && canView("coo") && (\n          <div className="space-y-5">\n            <WorkSubmissionReviewPanel reviewerRole="COO" locale={user.locale} />\n            <OperationsAdminPanel\n              eyebrow="Chief Operating Officer"\n              title="Pilotage COO"\n              description="Organisez les opérations internes, distribuez les tâches, suivez les blocages, structurez les réunions et consolidez les rapports opérationnels DTSC."\n              playbook={["Opération cadrée", "Tâches assignées", "Coordination", "Blocages traités", "Validation", "Rapport opérationnel"]}\n              datasets={internalModulesDataset.cooDatasets}\n              canEdit={canView("coo")}\n            />\n          </div>\n        )}`;
  content = replaceOnce(content, cooOld, cooNew, "COO work review panel");
  content = replaceOnce(content,
    '            <CeoExecutiveSummary groups={internalModulesDataset.ceoExecutiveGroups} dateStart={selectedCeoStart} dateEnd={selectedCeoEnd} />\n            <OperationsAdminPanel\n',
    '            <CeoExecutiveSummary groups={internalModulesDataset.ceoExecutiveGroups} dateStart={selectedCeoStart} dateEnd={selectedCeoEnd} />\n            <WorkSubmissionReviewPanel reviewerRole="CEO" locale={user.locale} />\n            <OperationsAdminPanel\n',
    "CEO work review panel");
  write(path, content);
}

// System prompt: public-facing product awareness without sensitive implementation details.
{
  const path = "lib/openai.ts";
  let content = read(path);
  const anchor = '  "- Activites DTSC: les collaborateurs RH actifs peuvent creer des reunions COO et soumettre des dossiers, contrats, risques, litiges ou demandes juridiques au LA avec commentaires, mentions et notifications, sans acceder directement aux sections Administration sensibles.",\n';
  const inserted = `${anchor}  "- Prestations DTSC internes: les collaborateurs peuvent declarer le travail reel effectue par semaine, le soumettre a une validation operationnelle independante et recevoir une demande de correction, une validation ou un refus; le planning reste distinct du temps travaille et aucune paie n'est calculee directement depuis une disponibilite.",\n`;
  if (!content.includes("Prestations DTSC internes:")) content = replaceOnce(content, anchor, inserted, "system prompt work prestations");
  write(path, content);
}

// Public legal content impacted by employee work records and notifications.
{
  const path = "lib/public-content.ts";
  let content = read(path);
  content = content.replace(
    "disponibilités, absences, missions, conflits de planning, rapports,",
    "disponibilités, absences, missions, conflits de planning, prestations de travail déclarées, soumissions hebdomadaires, validations opérationnelles, rapports,"
  );
  content = content.replace(
    "présence sur site, conflits de planning, journaux d'audit de groupe,",
    "présence sur site, conflits de planning, prestations de travail déclarées, durées, pauses, statuts de soumission et historique de validation, journaux d'audit de groupe,"
  );
  content = content.replace(
    "coordination COO, calendrier interne, disponibilité des équipes, projets MPO,",
    "coordination COO, calendrier interne, disponibilité des équipes, déclaration et validation indépendante des prestations de travail, projets MPO,"
  );
  content = content.replace(
    "Sans ce cookie, les modules privés comme le dashboard, le chatbot, l'entreprise, les activités collaborateur, le support ou l'administration ne peuvent pas fonctionner correctement.",
    "Sans ce cookie, les modules privés comme le dashboard, le chatbot, l'entreprise, les activités collaborateur, la déclaration de prestations, le support ou l'administration ne peuvent pas fonctionner correctement. La fonctionnalité de prestations n'ajoute aucun cookie de suivi ou traceur publicitaire spécifique."
  );
  write(path, content);
}

const permanentRules = `<!-- SPRINT_04_WORK_PRESTATIONS_RULES -->\n## Règles permanentes — prestations réelles DTSC\n\n- DTSC work availability is planning data and must never be treated as worked time.\n- Worked time must come from explicit work entries submitted by the employee.\n- No employee, including CEO, COO or ADMIN, may approve their own work submission.\n- Regular DTSC work submissions are reviewed by COO; COO submissions are reviewed by CEO; CEO submissions are reviewed by COO.\n- HR & CFO work submissions are reviewed by COO.\n- Approved work submissions are immutable in normal workflows; corrections require a reviewer-driven correction cycle before resubmission.\n- Payroll must consume approved work only; it must never derive directly from availability or unapproved work entries.\n- Vercel deployments are production-only from main; feature branches must never enable or trigger preview deployments.\n- A work-entry duration is server-calculated in integer minutes from start/end minus break; client-provided worked totals are never authoritative.\n- Work-entry source references must be access-checked server-side and may not accept arbitrary cross-user objects.\n`;
{
  const path = "AGENTS.md";
  write(path, appendOnce(read(path), "SPRINT_04_WORK_PRESTATIONS_RULES", permanentRules));
}

const technical = `<!-- SPRINT_04_WORK_PRESTATIONS -->\n## Sprint 4 — prestations réelles et validation opérationnelle\n\nDTSC internal dispose désormais d'entrées de travail réelles (`DtscWorkEntry`) regroupées en soumissions hebdomadaires (`DtscWorkSubmission`) et d'un historique de review append-only (`DtscWorkSubmissionReview`). L'identité d'écriture vient du dossier `HrcfoEmployee` lié à la session. Les minutes sont calculées côté serveur, les overlaps sont refusés, et le resolver du Sprint 3 est utilisé uniquement pour produire des indicateurs de comparaison au planning.\n\nLa matrice de review est centralisée : COO soumet au CEO ; tous les autres collaborateurs, CEO et HR_CFO compris, soumettent au COO. Une égalité reviewer/submission.employeeId retourne un refus serveur. Une validation simple fixe `validatedMinutes = declaredMinutes`; une correction ou un refus exige un motif et reste historisé.\n\nAucun calcul salarial n'est déclenché. Le helper `getApprovedWorkForPayroll()` est uniquement une frontière de lecture pour le Sprint 5. Le workflow Vercel demeure Production Only depuis `main`.\n`;
const qa = `<!-- SPRINT_04_WORK_PRESTATIONS_QA -->\n## Sprint 4 — QA prestations DTSC\n\n- [ ] création d'une entrée personnelle et refus d'un employeeId tiers ;\n- [ ] calcul 08:00-17:00 moins 60 min = 480 min ;\n- [ ] calcul 09:00-12:30 = 210 min ;\n- [ ] chevauchement d'entrées refusé ;\n- [ ] indicateur hors disponibilité et conflit absence via resolver Sprint 3 ;\n- [ ] DRAFT → SUBMITTED → APPROVED ;\n- [ ] SUBMITTED → CHANGES_REQUESTED → édition → RESUBMITTED ;\n- [ ] SUBMITTED → REJECTED avec commentaire obligatoire ;\n- [ ] APPROVED non modifiable ;\n- [ ] COO approuve standard/HR_CFO/CEO mais jamais sa propre soumission ;\n- [ ] CEO approuve COO mais jamais sa propre soumission ;\n- [ ] notifications de soumission/correction/validation/refus passent par le système central Web Push ;\n- [ ] aucune mutation `HrcfoPayroll` depuis le Sprint 4 ;\n- [ ] `pnpm qa:work-schedule`, `pnpm qa:work-prestations`, `pnpm qa:regression`, typecheck, lint, build et migration PostgreSQL+pgvector passent avant merge ;\n- [ ] aucun Vercel Preview n'est créé sur la feature branch.\n`;
const changelog = `<!-- SPRINT_04_WORK_PRESTATIONS_CHANGELOG -->\n## 2026-07-29 — Sprint 4 : prestations réelles DTSC\n\n- Ajout des prestations réelles self-service, durées serveur et contrôle des chevauchements.\n- Ajout des soumissions hebdomadaires, cycles de correction/resoumission et verrouillage des périodes validées.\n- Ajout de la validation indépendante COO/CEO avec interdiction absolue de l'auto-validation.\n- Réutilisation du planning effectif Sprint 3 pour signaler les écarts et conflits d'absence sans transformer le planning en temps travaillé.\n- Ajout des notifications/Web Push, audits, API logs, UI workspace mobile-first et frontière de lecture Sprint 5 sans calcul de paie.\n- Maintien du déploiement Vercel Production Only depuis `main`.\n`;
for (const [path, marker, block] of [
  ["docs/TECHNICAL_DOCUMENTATION.md", "SPRINT_04_WORK_PRESTATIONS", technical],
  ["docs/QA_REGRESSION_CHECKLIST.md", "SPRINT_04_WORK_PRESTATIONS_QA", qa],
  ["docs/CHANGELOG.md", "SPRINT_04_WORK_PRESTATIONS_CHANGELOG", changelog],
]) {
  write(path, appendOnce(read(path), marker, block));
}

console.log("Sprint 4 structural integration applied.");
