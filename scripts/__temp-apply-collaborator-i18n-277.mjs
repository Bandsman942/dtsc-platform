import fs from "node:fs";
import ts from "typescript";

const componentPath = "components/collaborators/collaborators-conversation-workspace.tsx";
const frPath = "locales/collaboration-experience.fr.json";
const enPath = "locales/collaboration-experience.en.json";
const helperPath = "lib/collaboration-experience-i18n.ts";
const qaPath = "scripts/qa-collaborator-dialog-i18n-277.mjs";
const docPath = "docs/I18N_SHARED_WORK_CONVERGENCE_266.md";

let source = fs.readFileSync(componentPath, "utf8");
const fr = JSON.parse(fs.readFileSync(frPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`Replacement source absent (${label}): ${from}`);
  source = source.replace(from, to);
}

function replaceIfPresent(from, to) {
  if (source.includes(from)) source = source.replace(from, to);
}

replaceExact("describeCustomFilter(item.criteriaJson, userPreferences.locale === \"en\")", "describeCustomFilter(item.criteriaJson, userPreferences.locale)", "custom filter caller");
replaceExact("function describeCustomFilter(value: CustomFilterCriteria, english: boolean)", "function describeCustomFilter(value: CustomFilterCriteria, locale: string)", "custom filter signature");
replaceExact("const english = preferences.locale === \"en\";", "const locale = preferences.locale;", "read info locale");
replaceExact("function OnlineBadge({ online, english }: { online: boolean; english: boolean })", "function OnlineBadge({ online, locale }: { online: boolean; locale: string })", "online badge signature");
replaceExact("function MessageReceiptIndicator({ summary, english }: { summary?: GroupMessage[\"receiptSummary\"]; english: boolean })", "function MessageReceiptIndicator({ summary, locale }: { summary?: GroupMessage[\"receiptSummary\"]; locale: string })", "receipt signature");
source = source.replaceAll("english={english}", "locale={preferences.locale}");
source = source.replaceAll("english={userPreferences.locale === \"en\"}", "locale={userPreferences.locale}");
source = source.replaceAll("english ?", "locale === \"en\" ?");

const reversePair = new Map();
for (const key of Object.keys(fr)) {
  if (typeof fr[key] === "string" && typeof en[key] === "string") reversePair.set(`${en[key]}\u0000${fr[key]}`, key);
}

function addTranslation(preferredKey, enValue, frValue) {
  const pair = `${enValue}\u0000${frValue}`;
  const reused = reversePair.get(pair);
  if (reused) return reused;
  let key = preferredKey;
  let suffix = 2;
  while ((key in fr || key in en) && (fr[key] !== frValue || en[key] !== enValue)) key = `${preferredKey}${suffix++}`;
  fr[key] = frValue;
  en[key] = enValue;
  reversePair.set(pair, key);
  return key;
}

function semanticKey(text) {
  const normalized = text
    .replace(/\{\{v\d+\}\}/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean).slice(0, 14);
  const camel = words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");
  const base = camel || "localizedText";
  return `conversationUi${base.charAt(0).toUpperCase()}${base.slice(1)}`;
}

function unwrap(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function literalTemplate(node, sf) {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { value: node.text, exprs: [] };
  if (!ts.isTemplateExpression(node)) return null;
  let value = node.head.text;
  const exprs = [];
  node.templateSpans.forEach((span, index) => {
    exprs.push(span.expression.getText(sf));
    value += `{{v${index}}}${span.literal.text}`;
  });
  return { value, exprs };
}

function localeExpr(condition, sf) {
  condition = unwrap(condition);
  if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null;
  const left = unwrap(condition.left);
  const right = unwrap(condition.right);
  if (ts.isStringLiteral(right) && right.text === "en") return left.getText(sf);
  if (ts.isStringLiteral(left) && left.text === "en") return right.getText(sf);
  return null;
}

const sf = ts.createSourceFile(componentPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const replacements = [];
function visit(node) {
  if (ts.isConditionalExpression(node)) {
    const locale = localeExpr(node.condition, sf);
    if (locale) {
      const english = literalTemplate(node.whenTrue, sf);
      const french = literalTemplate(node.whenFalse, sf);
      if (!english || !french) throw new Error(`Unsupported locale ternary: ${node.getText(sf).slice(0, 220)}`);
      if (english.exprs.length !== french.exprs.length || english.exprs.some((expr, i) => expr !== french.exprs[i])) {
        throw new Error(`Locale template expressions diverge: ${node.getText(sf).slice(0, 220)}`);
      }
      const key = addTranslation(semanticKey(english.value), english.value, french.value);
      const vars = english.exprs.length
        ? `, { ${english.exprs.map((expr, i) => `v${i}: ${expr}`).join(", ")} }`
        : "";
      replacements.push({ start: node.getStart(sf), end: node.end, text: `collaborationExperienceT(${locale}, ${JSON.stringify(key)}${vars})` });
      return;
    }
  }
  ts.forEachChild(node, visit);
}
visit(sf);
replacements.sort((a, b) => b.start - a.start);
for (const replacement of replacements) source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);

function key(enValue, frValue, preferred) {
  return addTranslation(preferred || semanticKey(enValue), enValue, frValue);
}

const uploadFallback = key("Unable to upload the file.", "Téléversement impossible.", "conversationUiUploadFallback");
replaceIfPresent('setFeedback(error instanceof Error ? error.message : "Téléversement impossible.");', `setFeedback(error instanceof Error ? error.message : t(${JSON.stringify(uploadFallback)}));`);

const blocked = key("Collaborator blocked.", "Collaborateur bloqué.", "conversationUiCollaboratorBlocked");
const unblocked = key("Collaborator unblocked.", "Collaborateur débloqué.", "conversationUiCollaboratorUnblocked");
replaceIfPresent('setFeedback(action === "BLOCK" ? "Collaborateur bloqué." : "Collaborateur débloqué.");', `setFeedback(action === "BLOCK" ? t(${JSON.stringify(blocked)}) : t(${JSON.stringify(unblocked)}));`);

const groupActions = key("Group actions", "Actions du groupe", "conversationUiGroupActions");
replaceIfPresent('label="Actions du groupe"', `label={t(${JSON.stringify(groupActions)})}`);

const video = key("Video", "Vidéo", "conversationUiVideo");
const audio = key("Audio", "Audio", "conversationUiAudio");
replaceIfPresent('`${activeCall.callType === "VIDEO" ? "Vidéo" : "Audio"} · ${t("online")}`', '`${activeCall.callType === "VIDEO" ? t("' + video + '") : t("' + audio + '")} · ${t("online")}`');

const audioUnavailable = key("Audio unavailable", "Audio indisponible", "conversationUiAudioUnavailable");
replaceIfPresent('>Audio indisponible</p>', `>{t(${JSON.stringify(audioUnavailable)})}</p>`);

const groupProjection = key("GROUP", "GROUPE", "conversationUiGroupProjection");
replaceIfPresent('group.groupType === "DIRECT" ? "DIRECT" : "GROUPE"', `group.groupType === "DIRECT" ? "DIRECT" : t(${JSON.stringify(groupProjection)})`);

const memberRemoveConfirm = key("Remove {{v0}} from the group?", "Retirer {{v0}} du groupe ?", "conversationUiMemberRemoveConfirm");
const memberTransferConfirm = key("Transfer ownership to {{v0}}?", "Transférer la propriété à {{v0}} ?", "conversationUiMemberTransferConfirm");
replaceIfPresent('action === "REMOVE" ? `Retirer ${member.user.name} du groupe ?` : `Transférer la propriété à ${member.user.name} ?`', `action === "REMOVE" ? collaborationExperienceT(userPreferences.locale, ${JSON.stringify(memberRemoveConfirm)}, { v0: member.user.name }) : collaborationExperienceT(userPreferences.locale, ${JSON.stringify(memberTransferConfirm)}, { v0: member.user.name })`);
const memberUpdateFailed = key("Unable to update this member.", "Impossible de modifier ce membre.", "conversationUiMemberUpdateFailed");
replaceIfPresent('body?.message || "Impossible de modifier ce membre."', `body?.message || t(${JSON.stringify(memberUpdateFailed)})`);

const blockConfirm = key("Block {{v0}}? New messages and calls will be rejected.", "Bloquer {{v0}} ? Les nouveaux messages et appels seront refusés.", "conversationUiBlockConfirm");
replaceIfPresent('window.confirm(`Bloquer ${directPeer.user.name} ? Les nouveaux messages et appels seront refusés.`)', `window.confirm(collaborationExperienceT(userPreferences.locale, ${JSON.stringify(blockConfirm)}, { v0: directPeer.user.name }))`);
const blockUpdateFailed = key("Unable to update blocking.", "Impossible de modifier le blocage.", "conversationUiBlockUpdateFailed");
replaceIfPresent('setFeedback("Impossible de modifier le blocage.")', `setFeedback(t(${JSON.stringify(blockUpdateFailed)}))`);

const privacyTitle = key("Conversation privacy", "Confidentialité de la conversation", "conversationUiPrivacyTitle");
const privacyLimited = key("This collaborator has limited new interactions.", "Ce collaborateur a limité les nouvelles interactions.", "conversationUiPrivacyLimited");
const privacyBlocked = key("New messages and calls are blocked.", "Les nouveaux messages et appels sont bloqués.", "conversationUiPrivacyBlocked");
const privacyAllowed = key("Messages and calls are allowed.", "Les messages et appels sont autorisés.", "conversationUiPrivacyAllowed");
const unblock = key("Unblock", "Débloquer", "conversationUiUnblock");
const block = key("Block", "Bloquer", "conversationUiBlock");
replaceIfPresent('>Confidentialité de la conversation</p>', `>{t(${JSON.stringify(privacyTitle)})}</p>`);
replaceIfPresent('directBlock.blockedMe ? "Ce collaborateur a limité les nouvelles interactions." : directBlock.blockedByMe ? "Les nouveaux messages et appels sont bloqués." : "Les messages et appels sont autorisés."', `directBlock.blockedMe ? t(${JSON.stringify(privacyLimited)}) : directBlock.blockedByMe ? t(${JSON.stringify(privacyBlocked)}) : t(${JSON.stringify(privacyAllowed)})`);
replaceIfPresent('directBlock.blockedByMe ? "Débloquer" : "Bloquer"', `directBlock.blockedByMe ? t(${JSON.stringify(unblock)}) : t(${JSON.stringify(block)})`);

const demote = key("Demote", "Rétrograder", "conversationUiDemote");
const administrator = key("Administrator", "Administrateur", "conversationUiAdministrator");
const transfer = key("Transfer", "Transférer", "conversationUiTransfer");
const remove = key("Remove", "Retirer", "conversationUiRemove");
replaceIfPresent('member.role === "ADMIN" ? "Rétrograder" : "Administrateur"', `member.role === "ADMIN" ? t(${JSON.stringify(demote)}) : t(${JSON.stringify(administrator)})`);
replaceIfPresent('>Transférer</Button>', `>{t(${JSON.stringify(transfer)})}</Button>`);
replaceIfPresent('>Retirer</Button>', `>{t(${JSON.stringify(remove)})}</Button>`);

const kb = key("KB", "Ko", "conversationUiKilobytesShort");
replaceIfPresent('{Math.ceil(attachment.sizeBytes / 1024)} Ko</span>', `{Math.ceil(attachment.sizeBytes / 1024)} {t(${JSON.stringify(kb)})}</span>`);

if (/\b(?:userPreferences|preferences)\.locale\s*===\s*["']en["']/.test(source)) throw new Error("Remaining direct locale ternary/comparison in collaborator workspace");
if (/\benglish\s*\?/.test(source)) throw new Error("Remaining english ternary in collaborator workspace");
if (source.includes('const english = preferences.locale === "en"')) throw new Error("Remaining legacy english flag");

fs.writeFileSync(componentPath, source);
fs.writeFileSync(frPath, JSON.stringify(fr, null, 2) + "\n");
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");

let helper = fs.readFileSync(helperPath, "utf8");
helper = helper.replace(
  'export function collaborationExperienceT(locale: string | null | undefined, key: CollaborationExperienceKey) {\n  return translateCollaborationExperience(locale, key);\n}',
  'export function collaborationExperienceT(locale: string | null | undefined, key: CollaborationExperienceKey, vars?: Record<string, string | number>) {\n  const template = translateCollaborationExperience(locale, key);\n  if (!vars) return template;\n  return template.replace(/\\{\\{(\\w+)\\}\\}/g, (_match, name: string) => String(vars[name] ?? ""));\n}'
);
if (!helper.includes("vars?: Record<string, string | number>")) throw new Error("Failed to enable canonical interpolation helper");
fs.writeFileSync(helperPath, helper);

const qa = `import fs from "node:fs";\n\nconst componentPath = "components/collaborators/collaborators-conversation-workspace.tsx";\nconst component = fs.readFileSync(componentPath, "utf8");\nconst helper = fs.readFileSync("lib/collaboration-experience-i18n.ts", "utf8");\nconst fr = JSON.parse(fs.readFileSync("locales/collaboration-experience.fr.json", "utf8"));\nconst en = JSON.parse(fs.readFileSync("locales/collaboration-experience.en.json", "utf8"));\nconst failures = [];\nconst expect = (condition, message) => { if (!condition) failures.push(message); };\n\nexpect(!/\\b(?:userPreferences|preferences)\\.locale\\s*===\\s*["']en["']/.test(component), "#277: comparaison locale FR/EN résiduelle dans le workspace");\nexpect(!/\\benglish\\s*\\?/.test(component), "#277: ternaire legacy english résiduel");\nexpect(!component.includes('const english = preferences.locale === "en"'), "#277: drapeau english local résiduel");\nfor (const forbidden of ["Téléversement impossible.", "Collaborateur bloqué.", "Collaborateur débloqué.", 'label="Actions du groupe"', ">Audio indisponible</p>", "Confidentialité de la conversation", "Impossible de modifier ce membre.", "Impossible de modifier le blocage."]) {\n  expect(!component.includes(forbidden), \`#277: copie UI locale résiduelle: \${forbidden}\`);\n}\nexpect(component.includes("collaborationExperienceT"), "#277: moteur canonique collaborationExperienceT absent");\nexpect(helper.includes("translateCollaborationExperience") && helper.includes("vars?: Record<string, string | number>"), "#277: helper canonique/interpolation absent");\nconst frKeys = Object.keys(fr).sort();\nconst enKeys = Object.keys(en).sort();\nexpect(JSON.stringify(frKeys) === JSON.stringify(enKeys), "#277: parité de clés collaboration-experience FR/EN rompue");\nfor (const key of frKeys) expect(typeof fr[key] === "string" && fr[key].length > 0 && typeof en[key] === "string" && en[key].length > 0, \`#277: traduction vide ou non textuelle: \${key}\`);\nfor (const marker of [\n  "JSON.stringify({ targetUserId })",\n  "startingDirectUserId",\n  "summary?.allRead",\n  "onJumpToMessage",\n  "focusMessageById",\n  "containsMentionAllText",\n  "selectedGroupIds",\n  "/api/collaborators/messages/",\n  "/api/collaborators/contact-requests",\n  "/api/collaborators/calls/",\n  "normalizeMessageExternalUrl",\n]) expect(component.includes(marker), \`#277: invariant Collaboration absent: \${marker}\`);\n\nif (failures.length) {\n  console.error(\`Collaborator dialog i18n #277 QA failed:\\n- \${failures.join("\\n- ")}\`);\n  process.exit(1);\n}\nconsole.log("Collaborator dialog i18n #277 QA passed.");\n`;
fs.writeFileSync(qaPath, qa);

let doc = fs.readFileSync(docPath, "utf8");
if (!doc.includes("## Lot #277 — dialogues Collaborateurs")) {
  doc += `\n\n## Lot #277 — dialogues Collaborateurs\n\n- Périmètre : copie FR/EN résiduelle, prompts, erreurs, filtres, mentions, appels et informations de lecture dans \`collaborators-conversation-workspace.tsx\`.\n- Moteur : \`collaborationExperienceT\` / \`translateCollaborationExperience\` uniquement ; interpolation canonique ajoutée sans second moteur.\n- Données métier : aucune traduction ni mutation des valeurs persistées ; endpoints et contrats Collaboration conservés.\n- Exception comportementale explicite : \`@tous\` / \`@all\` reste un jeton de mention reconnu par le parser, sans mutation des messages utilisateur.\n- QA ciblée : \`scripts/qa-collaborator-dialog-i18n-277.mjs\`.\n- État au commit d’implémentation : CI de PR, OWNER_E2E et Production restent \`NOT_EXECUTED\` jusqu’aux preuves correspondantes.\n`;
  fs.writeFileSync(docPath, doc);
}

await import(`./qa-collaborator-dialog-i18n-277.mjs?run=${Date.now()}`);

function dump(path, label) {
  const encoded = fs.readFileSync(path).toString("base64");
  console.log(`DTSC277_BEGIN ${label} ${encoded.length}`);
  for (let index = 0; index < encoded.length; index += 8000) {
    console.log(`DTSC277_${label}_${String(index / 8000).padStart(3, "0")}=${encoded.slice(index, index + 8000)}`);
  }
  console.log(`DTSC277_END ${label}`);
}

for (const [label, path] of [
  ["component", componentPath],
  ["fr", frPath],
  ["en", enPath],
  ["helper", helperPath],
  ["qa", qaPath],
  ["doc", docPath],
]) dump(path, label);

console.log(`Applied #277 canonicalization: ${replacements.length} locale conditional expressions migrated; ${Object.keys(fr).length} canonical collaboration keys.`);
