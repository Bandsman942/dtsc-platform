import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const check = (condition, message) => { if (!condition) failures.push(message); };

const packageJson = JSON.parse(read("package.json"));
check(!Object.prototype.hasOwnProperty.call(packageJson, "prisma"), "Deprecated package.json Prisma config must stay removed.");

const prismaConfig = read("prisma.config.ts");
check(prismaConfig.includes('schema: "prisma"'), "Prisma config must keep the multi-file schema directory.");
check(prismaConfig.includes('path: "prisma/migrations"'), "Prisma migration path must remain explicit.");
check(!prismaConfig.includes('schema: "prisma/schema.prisma"'), "Prisma config must not narrow DTSC to the root schema file.");

const chat = read("components/chat/chat-workspace-v2.tsx");
check(chat.includes("const loadConversation = useCallback"), "Chat conversation loader must be stable.");
check(chat.includes("[activeConversationId, loadConversation]"), "Chat effect must depend on the stable loader.");

for (const file of [
  "components/enterprise/professional/enterprise-exchange-rates-workspace.tsx",
  "components/enterprise/professional/retail-daily-close-workspace.tsx",
  "components/enterprise/professional/retail-workspace-shared.tsx",
]) {
  const source = read(file);
  check(source.includes("[load, refreshKey]"), `${file}: refreshKey must explicitly drive the effect.`);
}

for (const file of [
  "app/ressources/[slug]/page.tsx",
  "app/ressources/page.tsx",
  "components/enterprise/enterprise-invitations-client.tsx",
  "components/layout/app-shell.tsx",
  "components/public/publication-engagement.tsx",
]) {
  const source = read(file);
  check(source.includes('from "next/image"'), `${file}: stable avatar/logo must use next/image.`);
  check(source.includes("<Image"), `${file}: expected a Next Image render.`);
}

const profile = read("components/profile/profile-editor.tsx");
check(profile.includes('import NextImage from "next/image"'), "Profile preview must alias next/image so the browser Image constructor remains available.");
check(profile.includes("const image = new Image()"), "Profile optimization must keep the browser Image constructor.");
check(profile.includes("<NextImage"), "Profile avatar preview must use the aliased Next Image component.");

const viewer = read("components/announcements/announcement-media-enhancer.tsx");
check(viewer.includes("Native image is intentional"), "Native announcement zoom image must be justified locally.");
check(viewer.includes("eslint-disable-next-line @next/next/no-img-element"), "Native announcement zoom image exception must stay local.");

if (failures.length) {
  console.error(`Build warning debt closure QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Build warning debt closure QA passed.");