import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const registry = read("lib/ai/tool-registry.ts");
const confirmation = read("lib/ai/tools/confirmation.ts");
const confirmRoute = read("app/api/ai/tools/confirm/route.ts");
const pendingRoute = read("app/api/ai/tools/pending/route.ts");
const dock = read("components/chat/ai-tool-confirmation-dock.tsx");

for (const code of ["SUPPORT_TICKET_CREATE", "DTSC_CONTACT_EMAIL_SEND"]) {
  const start = registry.indexOf(`code: \"${code}\"`);
  const block = start >= 0 ? registry.slice(start, start + 900) : "";
  if (!block.includes("requiresConfirmation: true")) failures.push(`${code} must require structural confirmation`);
}
for (const binding of ["userId", "organizationId", "conversationId", "turnId", "toolCode", "argumentsHash", "expiresAt"]) {
  if (!confirmation.includes(binding)) failures.push(`confirmation binding missing ${binding}`);
}
if (!confirmRoute.includes("getPendingAiToolConfirmation")) failures.push("confirmation API must reload server-stored pending arguments");
if (!confirmRoute.includes("confirmAiToolConfirmation")) failures.push("confirmation API must transition the structural confirmation before execution");
if (!confirmRoute.includes("executeAiTool")) failures.push("confirmation API must execute only through Tool Gateway");
if (!pendingRoute.includes("preview(row.toolCode, row.argumentsJson)")) failures.push("pending confirmation API must expose sanitized preview only");
if (pendingRoute.includes("argumentsJson: row.argumentsJson")) failures.push("raw pending arguments must never be returned to browser");
if (!dock.includes("Typing yes in the chat never authorizes this action")) failures.push("confirmation UI must make natural-language non-authority explicit");

if (failures.length) {
  console.error("AI tool confirmation QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool confirmation QA passed");
}
