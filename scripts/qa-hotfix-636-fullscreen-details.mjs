import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function requireToken(relativePath, source, token, label) {
  if (!source.includes(token)) failures.push(`${relativePath}: ${label}`);
}

function forbidToken(relativePath, source, token, label) {
  if (source.includes(token)) failures.push(`${relativePath}: ${label}`);
}

const detailPath = "components/workspace/fullscreen-entity-detail.tsx";
const reportsPath = "components/enterprise/core-v2/enterprise-reports-workspace.tsx";
const identityPath = "components/enterprise/identity-links/enterprise-identity-user-panel.tsx";
const decisionRoutePath = "app/api/account/identity-links/decision/route.ts";
const accountDecisionPath = "lib/enterprise/identity-links/account-invitation-decision-service.ts";
const accountingPath = "components/enterprise/professional/enterprise-finance-accounting-workspace-v3.tsx";
const accountingDetailPath = "components/enterprise/professional/accounting-record-detail.tsx";

for (const relativePath of [detailPath, reportsPath, identityPath, decisionRoutePath, accountDecisionPath, accountingPath, accountingDetailPath]) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Fichier requis absent: ${relativePath}`);
}

const detail = read(detailPath);
requireToken(detailPath, detail, 'presentation="editor"', "le détail transverse doit utiliser la présentation editor");
requireToken(detailPath, detail, 'data-dtsc-fullscreen-detail', "le détail transverse doit être identifiable par le contrat responsive");
requireToken(detailPath, detail, 'h-[100dvh] w-screen max-w-none rounded-none', "le détail doit être plein écran sur mobile");
requireToken(detailPath, detail, '<ContextActions', "le détail doit exposer le menu contextuel …");

const reports = read(reportsPath);
requireToken(reportsPath, reports, 'onOpen={() => setCatalogDetail(item)}', "les éléments du catalogue doivent être ouvrables");
requireToken(reportsPath, reports, '<FullscreenEntityDetail', "catalogue et rapports doivent utiliser le détail plein écran partagé");
for (const token of ["downloadProfessionalCsv", "downloadProfessionalXlsx", "downloadProfessionalPdfV2"]) {
  requireToken(reportsPath, reports, token, `l’action d’export ${token} doit rester accessible`);
}
requireToken(reportsPath, reports, 'generateFromCatalog(catalogDetail)', "la fiche du catalogue doit pouvoir lancer la génération réelle");

const identity = read(identityPath);
requireToken(identityPath, identity, '<FullscreenEntityDetail', "les relations doivent s’ouvrir en détail plein écran");
requireToken(identityPath, identity, 'onOpen={() => setDetailTarget({ kind: "link", link })}', "les lignes de relation doivent ouvrir leur fiche");
requireToken(identityPath, identity, 'linkId: selectedLink.id, revision: selectedLink.revision', "une invitation liée au compte doit être décidée depuis sa fiche");
requireToken(identityPath, identity, 'action: "REVOKE"', "la révocation d’une relation active doit rester disponible");
forbidToken(identityPath, identity, 'Ouvrez la notification privée reçue pour retrouver l’action sécurisée', "la liste ne doit plus imposer de retrouver le token URL pour agir");

const decisionRoute = read(decisionRoutePath);
requireToken(decisionRoutePath, decisionRoute, 'acceptAccountBoundEnterpriseIdentityInvitation', "la route doit supporter l’acceptation liée au compte");
requireToken(decisionRoutePath, decisionRoute, 'refuseAccountBoundEnterpriseIdentityInvitation', "la route doit supporter le refus lié au compte");
requireToken(decisionRoutePath, decisionRoute, 'parsed.data.linkId && parsed.data.revision', "la décision sans token doit rester versionnée");

const accountDecision = read(accountDecisionPath);
for (const token of [
  'where: { id: linkId, userId, origin: "ENTERPRISE" }',
  'invitationEmailDigest',
  'digest(normalizeEmail(user.email))',
  'status !== "INVITATION_PENDING"',
  'expiresAt && link.expiresAt <= new Date()',
  'revision: link.revision',
]) {
  requireToken(accountDecisionPath, accountDecision, token, `garde de sécurité absente: ${token}`);
}

const accounting = read(accountingPath);
requireToken(accountingPath, accounting, 'data-horizontal-rail', "les rails Comptabilité doivent déclarer leur scroll horizontal local");
requireToken(accountingPath, accounting, 'min-w-[8.5rem] shrink-0 snap-start whitespace-normal', "les boutons Configurer doivent conserver une largeur mobile lisible");
requireToken(accountingPath, accounting, 'onRowClick={(row) => setDetailEntryId(row.id)}', "les écritures compactes doivent ouvrir leur détail");
requireToken(accountingPath, accounting, 'onRowClick={(row) => setRecordDetail({ kind: configureView as AccountingRecordDetailKind, row })}', "les objets de configuration doivent ouvrir leur détail");
requireToken(accountingPath, accounting, '<AccountingRecordDetail', "les fiches de configuration doivent utiliser le détail plein écran");
requireToken(accountingPath, accounting, 'FULLSCREEN_FORM_CLASS', "les formulaires comptables doivent utiliser le contrat plein écran mobile");
requireToken(accountingPath, accounting, '<Field label=', "les formulaires comptables doivent utiliser le champ guidé DTSC");
forbidToken(accountingPath, accounting, 'key: "actions"', "les actions d’écriture ne doivent plus être empilées dans une cellule compacte");

const accountingDetail = read(accountingDetailPath);
requireToken(accountingDetailPath, accountingDetail, '/fiscal-years/${record.id}/open', "la fiche exercice doit utiliser la route canonique d’ouverture");
requireToken(accountingDetailPath, accountingDetail, 'status === "DRAFT"', "l’action d’ouverture doit être bornée aux exercices brouillon");
requireToken(accountingDetailPath, accountingDetail, 'canManage', "l’ouverture d’exercice doit respecter la permission manage");
requireToken(accountingDetailPath, accountingDetail, '<FullscreenEntityDetail', "les objets comptables doivent être plein écran");

if (failures.length) {
  for (const failure of failures) console.error(`❌ ${failure}`);
  process.exit(1);
}
console.log("✅ Hotfix #636: détails plein écran, actions contextuelles, consentement lié au compte et rail Comptabilité vérifiés.");
