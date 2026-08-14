from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}")
    file.write_text(source.replace(old, new, 1))


collab = "components/collaborators/collaborators-conversation-workspace.tsx"
replace_once(
    collab,
    'import { collaborationExperienceT } from "@/lib/collaboration-experience-i18n";',
    'import { confirmSensitiveAction } from "@/lib/client-confirmation";\nimport { collaborationExperienceT } from "@/lib/collaboration-experience-i18n";',
)
replace_once(
    collab,
    '''  async function deleteCustomFilter(item: CustomFilter) {\n    if (!window.confirm(collaborationExperienceT(userPreferences.locale, "conversationUiDeleteFilter", { v0: item.name }))) return;\n    const response = await fetch(`/api/collaborators/filters/${item.id}`, { method: "DELETE" });''',
    '''  async function deleteCustomFilter(item: CustomFilter) {\n    const confirmation = await confirmSensitiveAction({\n      title: t("conversationUiDeleteFilter2"),\n      description: collaborationExperienceT(userPreferences.locale, "conversationUiDeleteFilter", { v0: item.name }),\n      confirmLabel: t("conversationUiDeleteFilter2"),\n      cancelLabel: t("cancel"),\n      tone: "danger",\n    });\n    if (!confirmation.confirmed) return;\n    const response = await fetch(`/api/collaborators/filters/${item.id}`, { method: "DELETE" });''',
)
replace_once(
    collab,
    '''  async function deleteMessage(message: GroupMessage) {\n    if (!window.confirm(collaborationExperienceT(userPreferences.locale, "conversationUiDeleteThisMessage"))) return;\n    const response = await fetch(`/api/collaborators/messages/${message.id}`, { method: "DELETE" });''',
    '''  async function deleteMessage(message: GroupMessage) {\n    const confirmation = await confirmSensitiveAction({\n      title: t("deleteMessage"),\n      description: t("conversationUiDeleteThisMessage"),\n      confirmLabel: t("deleteMessage"),\n      cancelLabel: t("cancel"),\n      tone: "danger",\n    });\n    if (!confirmation.confirmed) return;\n    const response = await fetch(`/api/collaborators/messages/${message.id}`, { method: "DELETE" });''',
)
replace_once(
    collab,
    '''    const destructive = action === "REMOVE" || action === "TRANSFER_OWNER";\n    if (destructive && !window.confirm(action === "REMOVE" ? collaborationExperienceT(userPreferences.locale, "conversationUiMemberRemoveConfirm", { v0: member.user.name }) : collaborationExperienceT(userPreferences.locale, "conversationUiMemberTransferConfirm", { v0: member.user.name }))) return;\n    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/members/${member.id}`, {''',
    '''    const destructive = action === "REMOVE" || action === "TRANSFER_OWNER";\n    if (destructive) {\n      const removingMember = action === "REMOVE";\n      const confirmation = await confirmSensitiveAction({\n        title: removingMember ? t("conversationUiRemove") : t("conversationUiTransfer"),\n        description: removingMember\n          ? collaborationExperienceT(userPreferences.locale, "conversationUiMemberRemoveConfirm", { v0: member.user.name })\n          : collaborationExperienceT(userPreferences.locale, "conversationUiMemberTransferConfirm", { v0: member.user.name }),\n        confirmLabel: removingMember ? t("conversationUiRemove") : t("conversationUiTransfer"),\n        cancelLabel: t("cancel"),\n        tone: removingMember ? "danger" : "warning",\n      });\n      if (!confirmation.confirmed) return;\n    }\n    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}/members/${member.id}`, {''',
)
replace_once(
    collab,
    '''    const action = directBlock.blockedByMe ? "UNBLOCK" : "BLOCK";\n    if (action === "BLOCK" && !window.confirm(collaborationExperienceT(userPreferences.locale, "conversationUiBlockConfirm", { v0: directPeer.user.name }))) return;\n    const response = await fetch("/api/collaborators/blocks", {''',
    '''    const action = directBlock.blockedByMe ? "UNBLOCK" : "BLOCK";\n    if (action === "BLOCK") {\n      const confirmation = await confirmSensitiveAction({\n        title: t("conversationUiBlock"),\n        description: collaborationExperienceT(userPreferences.locale, "conversationUiBlockConfirm", { v0: directPeer.user.name }),\n        confirmLabel: t("conversationUiBlock"),\n        cancelLabel: t("cancel"),\n        tone: "warning",\n      });\n      if (!confirmation.confirmed) return;\n    }\n    const response = await fetch("/api/collaborators/blocks", {''',
)
replace_once(
    collab,
    '''  async function leaveOrDeleteGroup() {\n    if (!activeGroup) return;\n    const prompt = isOwner ? (collaborationExperienceT(userPreferences.locale, "conversationUiDeleteThisGroup")) : (collaborationExperienceT(userPreferences.locale, "conversationUiLeaveThisGroup"));\n    if (!window.confirm(prompt)) return;\n    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}`, { method: "DELETE" });''',
    '''  async function leaveOrDeleteGroup() {\n    if (!activeGroup) return;\n    const prompt = isOwner ? collaborationExperienceT(userPreferences.locale, "conversationUiDeleteThisGroup") : collaborationExperienceT(userPreferences.locale, "conversationUiLeaveThisGroup");\n    const confirmation = await confirmSensitiveAction({\n      title: isOwner ? t("delete") : t("leave"),\n      description: prompt,\n      confirmLabel: isOwner ? t("delete") : t("leave"),\n      cancelLabel: t("cancel"),\n      tone: isOwner ? "danger" : "warning",\n    });\n    if (!confirmation.confirmed) return;\n    const response = await fetch(`/api/collaborators/groups/${activeGroup.id}`, { method: "DELETE" });''',
)

calendar = "components/calendar/internal-calendar/workspace.tsx"
replace_once(
    calendar,
    'import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";',
    'import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";\nimport { confirmSensitiveAction } from "@/lib/client-confirmation";',
)
replace_once(
    calendar,
    '''      const hasBlocking = body.conflicts.some((conflict) => conflict.severity === "Bloquant");\n      const conflictDetails = body.conflicts.map((conflict) => `• ${serverFallback(locale, conflict.message, text.slotWarning)}`).join("\\n");\n      const prompt = `${serverFallback(locale, body.message, text.conflictsExist)}\\n\\n${conflictDetails}\\n\\n${text.confirmAcceptance}`;\n      if (!hasBlocking && window.confirm(prompt)) await respondToInvitation(event, responseValue, true);\n      else setMessage(serverFallback(locale, body.message, text.blockingConflictAcceptance));\n      return;''',
    '''      const hasBlocking = body.conflicts.some((conflict) => conflict.severity === "Bloquant");\n      if (hasBlocking) {\n        setMessage(serverFallback(locale, body.message, text.blockingConflictAcceptance));\n        return;\n      }\n      const conflictDetails = body.conflicts.map((conflict) => `• ${serverFallback(locale, conflict.message, text.slotWarning)}`).join("\\n");\n      const confirmation = await confirmSensitiveAction({\n        title: text.conflictsExist,\n        description: `${serverFallback(locale, body.message, text.conflictsExist)}\\n\\n${conflictDetails}\\n\\n${text.confirmAcceptance}`,\n        confirmLabel: text.accept,\n        cancelLabel: text.cancel,\n        tone: "warning",\n      });\n      if (confirmation.confirmed) await respondToInvitation(event, responseValue, true);\n      return;''',
)

cross = Path("scripts/qa-cross-app-ux-integrity-hotfix.mjs")
source = cross.read_text()
start = source.index("const legacyConfirmAllowlist = new Set([")
end = source.index('for (const file of [\n  "components/admin/billing-reconciliation-control.tsx",', start)
replacement = '''for (const file of walkFiles("components")) {\n  const source = read(file);\n  expect(!/\\bwindow\\.confirm\\s*\\(/.test(source), `Native browser confirmation is forbidden; use confirmSensitiveAction instead: ${file}`);\n}\nfor (const file of [\n  "components/calendar/internal-calendar/workspace.tsx",\n  "components/collaborators/collaborators-conversation-workspace.tsx",\n]) {\n  const source = read(file);\n  expect(source.includes("confirmSensitiveAction"), `${file} must use the explicit async DTSC confirmation contract`);\n}\n'''
source = source[:start] + replacement + source[end:]
source = source.replace(
    "// 3. Sensitive actions: the explicit async API uses the DTSC Dialog. Legacy\n// synchronous window.confirm callsites keep native browser semantics until migrated;\n// the provider must never monkey-patch the browser API or replay a detached DOM click.",
    "// 3. Sensitive actions: every component uses the explicit async DTSC Dialog API.\n// Native window.confirm is forbidden; the provider must never monkey-patch the browser API\n// or replay a detached DOM click.",
)
cross.write_text(source)

runner = Path("scripts/run-regression-qa-ci.mjs")
source = runner.read_text()
marker = 'commands.unshift("node scripts/qa-hotfix-303-crud-shop-onboarding.mjs");'
if marker not in source:
    raise SystemExit("Regression runner marker missing")
runner.write_text(source.replace(marker, marker + '\ncommands.unshift("node scripts/qa-305-async-confirmation-convergence.mjs");', 1))

Path("scripts/qa-305-async-confirmation-convergence.mjs").write_text(r'''import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
function walk(directory) {
  const absolute = path.join(root, directory);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(relative) : entry.name.endsWith(".tsx") ? [relative] : [];
  });
}

const collaboration = read("components/collaborators/collaborators-conversation-workspace.tsx");
const calendar = read("components/calendar/internal-calendar/workspace.tsx");
const provider = read("components/ui/sensitive-action-confirmation-provider.tsx");
const frCollaboration = read("locales/collaboration-experience.fr.json");
const enCollaboration = read("locales/collaboration-experience.en.json");
const frCalendar = read("locales/calendar-workspace.fr.json");
const enCalendar = read("locales/calendar-workspace.en.json");
const runner = read("scripts/run-regression-qa-ci.mjs");

for (const file of walk("components")) expect(!/\bwindow\.confirm\s*\(/.test(read(file)), `window.confirm remains in ${file}`);
expect(collaboration.includes('import { confirmSensitiveAction } from "@/lib/client-confirmation";'), "Collaboration must import confirmSensitiveAction");
expect((collaboration.match(/confirmSensitiveAction\s*\(\{/g) || []).length >= 5, "All five audited Collaboration confirmations must use confirmSensitiveAction");
for (const key of ["conversationUiDeleteFilter", "conversationUiDeleteThisMessage", "conversationUiMemberRemoveConfirm", "conversationUiMemberTransferConfirm", "conversationUiBlockConfirm", "conversationUiDeleteThisGroup", "conversationUiLeaveThisGroup"]) {
  expect(frCollaboration.includes(`"${key}"`), `French Collaboration confirmation key missing: ${key}`);
  expect(enCollaboration.includes(`"${key}"`), `English Collaboration confirmation key missing: ${key}`);
}
expect(calendar.includes('import { confirmSensitiveAction } from "@/lib/client-confirmation";'), "Calendar must import confirmSensitiveAction");
expect(calendar.includes("if (hasBlocking)"), "Blocking calendar conflicts must stop before confirmation");
expect(calendar.includes("conflictDetails"), "Calendar confirmation must show conflict details");
expect(calendar.includes("confirmLabel: text.accept"), "Calendar confirmation must use localized accept label");
expect(calendar.includes("cancelLabel: text.cancel"), "Calendar confirmation must use localized cancel label");
for (const key of ["conflictsExist", "confirmAcceptance", "accept", "cancel", "blockingConflictAcceptance"]) {
  expect(frCalendar.includes(`"${key}"`), `French Calendar confirmation key missing: ${key}`);
  expect(enCalendar.includes(`"${key}"`), `English Calendar confirmation key missing: ${key}`);
}
for (const forbidden of ["window.confirm =", "origin.click()", "approvedReplay", "replaying = true"]) expect(!provider.includes(forbidden), `Confirmation provider must not reintroduce ${forbidden}`);
expect(runner.includes("qa-305-async-confirmation-convergence.mjs"), "Issue 305 QA must run in regression CI");

if (failures.length) {
  console.error("Issue 305 async confirmation convergence QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("issue-305-async-confirmation-convergence: OK");
''')

Path("docs/ISSUE_305_ASYNC_CONFIRMATION_CONVERGENCE.md").write_text('''# Issue 305 — Convergence des confirmations asynchrones DTSC

## Objectif

Supprimer les derniers usages natifs de `window.confirm()` dans les composants et faire de `confirmSensitiveAction(...)` l’unique contrat de confirmation explicite côté client, sans monkey-patch global ni replay de clic DOM.

## Audit réel sur `main`

L’allowlist #303 couvrait deux fichiers, mais l’audit du fichier Collaboration a révélé cinq actions natives dans `Mes Collaborateurs` : suppression de filtre, suppression de message, retrait/transfert de membre, blocage d’un collaborateur et suppression/quittage d’un groupe. Le Calendrier contenait une sixième confirmation native pour l’acceptation malgré conflit non bloquant. Les six parcours sont migrés ensemble afin de satisfaire le critère opposable « aucun `window.confirm()` dans `components/**` ».

## Contrat livré

- toutes les confirmations Collaboration utilisent les libellés FR/EN canoniques du domaine ;
- le DELETE/PATCH/POST n’est exécuté qu’après `{ confirmed: true }` ;
- le Calendrier affiche les détails des conflits non bloquants dans le dialogue DTSC ;
- un conflit bloquant arrête le parcours sans proposer de confirmation contournable ;
- annuler une confirmation de conflit non bloquant ne produit plus un faux message de conflit bloquant ;
- l’allowlist native est supprimée de la QA transverse ;
- une QA #305 dédiée est intégrée au runner de régression.

## Données, sécurité et rollback

Aucune migration Prisma, aucun backfill et aucune variable d’environnement. Les routes, RBAC, ownership et contrôles multi-tenant existants ne changent pas. Rollback : revert applicatif de la PR #305, sans rollback de données.

## Politique de livraison

Aucun Preview Vercel de branche. Les commits intermédiaires restent sur GitHub ; seul le commit fusionné sur `main` est destiné à Vercel Production.
''')
