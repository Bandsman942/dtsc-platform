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

const announcementWall = read("components/announcements/announcement-wall.tsx");
check(announcementWall.includes('from "next/image"'), "Announcement author/recipient avatars must use next/image.");
check(announcementWall.includes("<Image src={avatarUrl}"), "Announcement AuthorAvatar must render through Next Image.");
check(!announcementWall.includes("<img src={avatarUrl}"), "Announcement AuthorAvatar must not regress to a native img.");

const collaborators = read("components/collaborators/collaborators-workspace.tsx");
check(collaborators.includes("const callShell = callShellRef.current;"), "Fullscreen call cleanup must snapshot the mutable shell ref.");
check(collaborators.includes('const root = callShell?.querySelector<HTMLElement>(".dtsc-livekit-room");'), "Fullscreen call focus must use the stable shell snapshot.");
check(!collaborators.includes('const root = callShellRef.current?.querySelector<HTMLElement>(".dtsc-livekit-room");'), "Fullscreen call effect must not dereference callShellRef.current during cleanup.");

const enterpriseAi = read("components/enterprise/enterprise-ai-workspace-v2.tsx");
check(enterpriseAi.includes("useCallback"), "Enterprise AI loaders must use stable callbacks.");
check(enterpriseAi.includes("const refreshAll = useCallback"), "Enterprise AI refreshAll must be stable.");
check(enterpriseAi.includes("const activeConversationIdRef = useRef<string | null>(null);"), "Enterprise AI must preserve the selected conversation across stable refreshes.");
check(enterpriseAi.includes("[loadGroups, refreshAll]"), "Enterprise AI initialization effect must depend on stable callbacks.");
check(!enterpriseAi.includes("useEffect(() => { void refreshAll(); void loadGroups(); }, [organizationId]);"), "Enterprise AI must not restore the stale organization-only effect dependency.");

const finance = read("components/enterprise/professional/enterprise-advanced-finance-workspace.tsx");
check(finance.includes("const EMPTY_SECTIONS: SectionDefinition[] = [];"), "Advanced finance must use a stable empty sections fallback.");
check(finance.includes("const EMPTY_ITEMS: Item[] = [];"), "Advanced finance must use a stable empty items fallback.");
check(finance.includes("SECTIONS[definition.code] || EMPTY_SECTIONS"), "Advanced finance sections fallback must be referentially stable.");
check(finance.includes("payload.items || EMPTY_ITEMS"), "Advanced finance items fallback must be referentially stable.");
check(!finance.includes("SECTIONS[definition.code] || []"), "Advanced finance must not recreate an empty sections array on render.");
check(!finance.includes("payload.items || []"), "Advanced finance must not recreate an empty items array on render.");

if (failures.length) {
  console.error(`Build warning debt closure QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Build warning debt closure QA passed.");