import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const privateActions = read("lib/private-chat-actions.ts");
const executors = read("lib/ai/tools/executors/private-actions.ts");
const confirmRoute = read("app/api/ai/tools/confirm/route.ts");
const pendingRoute = read("app/api/ai/tools/pending/route.ts");

for (const forbidden of ["prisma.supportTicket.create", "prisma.contactMessage.create", "sendZohoOutboundMail", "confirmationPattern"]) {
  if (privateActions.includes(forbidden)) failures.push(`private chat bypass remains: ${forbidden}`);
}
if (!privateActions.includes("executeAiTool")) failures.push("private action preparation must use Tool Gateway");
if (!privateActions.includes("CONFIRMATION_REQUIRED")) failures.push("private action must stop at structured confirmation");
if (!privateActions.includes("Une réponse comme « oui » ou « vas-y » dans le chat ne déclenche pas l’action")) failures.push("natural-language confirmation must be explicitly non-authoritative");
if (!executors.includes("SUPPORT_TICKET_CREATE")) failures.push("support ticket executor missing");
if (!executors.includes("DTSC_CONTACT_EMAIL_SEND")) failures.push("contact email executor missing");
if (!confirmRoute.includes("getPendingAiToolConfirmation")) failures.push("confirm route must load server-stored pending action");
if (!confirmRoute.includes("confirmAiToolConfirmation")) failures.push("confirm route must explicitly confirm before execution");
if (!confirmRoute.includes("executeAiTool")) failures.push("confirm route must execute through Gateway");
if (!pendingRoute.includes('"status" = \'PENDING\'')) failures.push("pending route must expose only pending confirmations");
if (!pendingRoute.includes('"userId" = ${session.userId}')) failures.push("pending confirmations must be user scoped");
if (pendingRoute.includes("message: typeof value.message")) failures.push("pending confirmation API must not expose full mutation message body");

if (failures.length) {
  console.error("AI private tool action QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI private tool action QA passed");
}
