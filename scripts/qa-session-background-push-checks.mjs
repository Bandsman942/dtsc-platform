import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Fichier introuvable: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
};
const check = (label, condition, hint = "") => {
  if (condition) console.log(`PASS ${label}`);
  else {
    failures.push(`${label}${hint ? `\n  ${hint}` : ""}`);
    console.error(`FAIL ${label}`);
  }
};
const all = (source, values) => values.every((value) => source.includes(value));

const packageJson = read("package.json");
const sessionConfig = read("lib/session-config.ts");
const sessionPolicy = read("lib/session-policy.ts");
const session = read("lib/session.ts");
const auth = read("lib/auth.ts");
const preference = read("lib/session-preference.ts");
const middleware = read("middleware.ts");
const heartbeat = read("app/api/auth/heartbeat/route.ts");
const contextRoute = read("app/api/account/context/route.ts");
const policyRoute = read("app/api/account/session-policy/route.ts");
const guard = read("components/auth/session-timeout-guard.tsx");
const settings = read("components/settings/session-and-push-settings.tsx");
const settingsPage = read("app/settings/page.tsx");
const legacySettingsCss = read("components/settings/legacy-settings-panel.module.css");
const migration = read("prisma/migrations/20260728113000_session_idle_timeout_policy/migration.sql");
const repairMigration = read("prisma/migrations/20260728153000_repair_session_preference_storage/migration.sql");
const sessionSchema = read("prisma/session-policy.prisma");
const baseSchema = read("prisma/schema.prisma");
const pushApi = read("app/api/push/subscriptions/route.ts");
const currentPushApi = read("app/api/push/subscriptions/current/route.ts");
const pushClient = read("lib/push/client.ts");
const pushConfig = read("lib/push/config.ts");
const pushPayload = read("lib/push/payload.ts");
const webPush = read("lib/push/web-push.ts");
const pushSender = read("lib/push/sender.ts");
const notifications = read("lib/notifications.ts");
const serviceWorker = read("public/sw.js");
const bridge = read("components/pwa/pwa-notification-bridge.tsx");
const resumeSync = read("components/pwa/app-resume-sync.tsx");
const logoutRoute = read("app/api/auth/sign-out/route.ts");
const logoutButton = read("components/sign-out-button.tsx");

check("5 minutes n'est plus la politique globale", !sessionConfig.includes("SESSION_MAX_AGE_SECONDS = 5 * 60") && !guard.includes("SESSION_MAX_AGE_SECONDS"));
check("durées idle autorisées et défaut 30 minutes", all(sessionConfig, ["15, 30, 60, 240, 480, 1440, 10080, 43200", "SESSION_DEFAULT_IDLE_TIMEOUT_MINUTES", "= 30"]));
check("durée absolue bornée à 30 jours", sessionConfig.includes("30 * 24 * 60 * 60") && all(sessionPolicy, ["authTime", "absoluteExp", "Math.min"]));
check("token signé transporte la politique et reste compatible legacy", all(session, ["authTime?: number", "idleTimeoutMinutes?", "absoluteExp?: number", "constantTimeEqual", "verifySessionToken"]));
check("cookie garde les flags et domaine SSO", all(auth, ['httpOnly: true', 'sameSite: "lax"', 'secure: process.env.NODE_ENV === "production"', "getAuthCookieDomain"]));
check("préférence de session utilise un modèle Prisma dédié", all(sessionSchema, ["model UserSessionPreference", "sessionIdleTimeoutMinutes", "@default(30)"]) && all(preference, ["prisma.userSessionPreference.findUnique", "prisma.userSessionPreference.upsert"]));
check("lecture de préférence ne peut pas casser le login", all(preference, ["try {", "catch {", "return resolveSessionIdleTimeoutMinutes(undefined)"]));
check("migration session crée table, défaut et whitelist SQL", all(migration, ['CREATE TABLE "UserSessionPreference"', "DEFAULT 30", "CHECK", 'CONSTRAINT "UserSessionPreference_pkey"', "43200"]));
check("migration de réparation session est idempotente et répare la clé primaire", all(repairMigration, ['CREATE TABLE IF NOT EXISTS "UserSessionPreference"', "ADD COLUMN IF NOT EXISTS", "CREATE INDEX IF NOT EXISTS", "conrelid", "contype = 'p'", 'ADD CONSTRAINT "UserSessionPreference_pkey" PRIMARY KEY', "43200"]));
check("Prisma charge le dossier multi-fichiers", packageJson.includes('"schema": "./prisma"'));
check("heartbeat vérifie origine, utilisateur actif et préférence DB", all(heartbeat, ["isSameOriginRequest", "UserStatus.ACTIVE", "getUserSessionIdleTimeoutMinutes", "previousSession: session", "absoluteExpiresAt"]));
check("changement de contexte conserve l'authTime via previousSession", all(contextRoute, ["previousSession: session", "activeOrganizationId", "activeOrganizationRole", "getUserSessionIdleTimeoutMinutes"]));
check("endpoint de préférence refuse les valeurs arbitraires et audite", all(policyRoute, ["z.literal(15)", "z.literal(43200)", "ACCOUNT_SESSION_POLICY_UPDATE", "isSameOriginRequest", "rateLimit"]));
check("échec d'écriture de préférence renvoie un 503 structuré sans modifier la session", all(policyRoute, ["SESSION_POLICY_STORAGE_UNAVAILABLE", "statusCode: 503", "idleTimeoutMinutes: currentValue", "try {", "updateUserSessionIdleTimeoutMinutes"]));
check("API session distingue expiration, rate limit et erreur de stockage", all(policyRoute, ["SESSION_EXPIRED", "SESSION_POLICY_RATE_LIMITED", "SESSION_ABSOLUTE_EXPIRED", "SESSION_USER_INACTIVE"]));
check("UI remet la durée précédente si l'enregistrement échoue", all(settings, ["const previous = idleTimeoutMinutes", "setIdleTimeoutMinutes(serverValue)", "setIdleTimeoutMinutes(previous)", "SESSION_POLICY_STORAGE_UNAVAILABLE"]));
check("UI redirige proprement quand la session n'est plus renouvelable", all(settings, ['window.location.assign("/session-expired")', "SESSION_ABSOLUTE_EXPIRED", "response.status === 401"]));
check("middleware ne renouvelle que la politique signée et conserve le contexte", all(middleware, ["session.authTime", "session.absoluteExp", "session.idleTimeoutMinutes", "SESSION_HEARTBEAT_THROTTLE_MS", "activeOrganizationId", "activeOrganizationRole"]));
check("guard synchronise multi-onglets et sleep/resume", all(guard, ["BroadcastChannel", "localStorage", "ACTIVITY_BROADCAST_THROTTLE_MS", "visibilitychange", "pageshow", 'window.addEventListener("focus"', "heartbeat(true)", 'type: "logout"']));
check("Rester connecté fait un heartbeat serveur forcé", guard.includes("await heartbeat(true)") && guard.includes("Rester connecté"));
check("UI paramètres expose timeout et activation Push sur action explicite", all(settings, ["SESSION_IDLE_TIMEOUT_OPTIONS", "/api/account/session-policy", "enableCurrentDevicePush", "Activer sur cet appareil", "needsAppleHomeScreenGuidance"]));
check("ancien toggle Push n'est plus une seconde source UX", settingsPage.includes("legacySettingsStyles.scope") && legacySettingsCss.includes('input[name="pushNotificationsEnabled"]'));
check("activation Push enregistre explicitement le Service Worker", all(pushClient, ['navigator.serviceWorker.register("/sw.js"', "PushManager", "Notification.requestPermission", "pushManager.subscribe"]));
check("état Activé vérifie navigateur, ownership serveur et préférence", all(pushClient, ["/api/push/subscriptions/current", "server.enabled && server.registered", "configuration-missing"]) && all(currentPushApi, ["isSameOriginRequest", "UserStatus.ACTIVE", "userId: user.id", "endpoint: parsed.data.endpoint", "registered: Boolean(subscription)"]));
check("PushSubscription existant reste endpoint unique multi-device", baseSchema.includes("model PushSubscription") && /endpoint\s+String\s+@unique/.test(baseSchema) && baseSchema.includes("pushSubscriptions"));
check("API Push vérifie origine, session, ACTIVE, rate limit et ownership", all(pushApi, ["isSameOriginRequest", "UserStatus.ACTIVE", "rateLimit", "userId: user.id", "pushSubscription.findUnique", "existing.userId !== user.id", "pushSubscription.create", "pushSubscription.delete"]));
check("VAPID private key n'est jamais NEXT_PUBLIC", all(pushConfig, ["NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_SUBJECT"]) && !pushConfig.includes("NEXT_PUBLIC_WEB_PUSH_VAPID_PRIVATE_KEY"));
check("configuration VAPID valide les longueurs P-256 avant activation", all(pushConfig, ["decodedBase64UrlLength(publicKey) !== 65", "decodedBase64UrlLength(privateKey) !== 32", "invalid-public-key", "invalid-private-key"]));
check("API Push refuse un abonnement si la configuration VAPID n'est pas prête", all(pushApi, ["getWebPushConfigurationState", "WEB_PUSH_CONFIGURATION_UNAVAILABLE", "statusCode: 503", "configurationIssue"]));
check("UI distingue une configuration VAPID invalide et n'affiche pas une activation en boucle", all(pushClient, ["configuration-invalid", "pushConfigurationState"]) && all(settings, ["configInvalid", "const canEnablePush", "canEnablePush ?"]));
check("transport Web Push utilise P-256, HKDF, AES-128-GCM et VAPID ES256", all(webPush, ["createECDH", "prime256v1", "hkdfExtract", "aes-128-gcm", 'alg: "ES256"', 'dsaEncoding: "ieee-p1363"', 'Content-Encoding": "aes128gcm', "AbortSignal.timeout"]));
check("payload Push est minimal et target interne", all(pushPayload, ["Ouvrez DTSC Platform pour consulter les détails.", "normalizePushTargetUrl", 'value.startsWith("//")', '"/notifications"']));
check("notifications DB déclenchent le dispatcher en best effort", all(notifications, ["prisma.notification.create", "dispatchPushForNotification", "dispatchPushForNotifications"]) && all(pushSender, ["Promise.allSettled", "result.status === 404", "result.status === 410", "pushSubscription.deleteMany"]));
check("service worker gère vrai push, notification click et cache privé", all(serviceWorker, ['addEventListener("push"', "showNotification", 'addEventListener("notificationclick"', "normalizeNotificationTarget", '"/api/"', '"/admin"', '"/activities"']));
check("Web Push ne renouvelle jamais la session", !serviceWorker.includes("/api/auth/heartbeat") && !pushSender.includes("setSessionCookie") && !webPush.includes("heartbeat"));
check("bridge foreground n'usurpe pas le vrai Web Push", all(bridge, ["pushManager.getSubscription", "activePushSubscription", "Nouvelle notification DTSC"]));
check("resume sync revalide auth indirectement, Push et badge sans polling caché", all(resumeSync, ["reconcileCurrentDevicePush", "/api/notifications/unread-count", "response.status === 401", "setAppBadge", "visibilitychange", "pageshow"]) && !resumeSync.includes("setInterval"));
check("logout manuel révoque seulement le terminal courant et synchronise les onglets", all(logoutRoute, ['reason === "manual"', "pushEndpoint", "pushSubscription.deleteMany"]) && all(logoutButton, ["getCurrentPushSubscription", "subscription.unsubscribe", "broadcastBrowserSessionLogout"]));

if (failures.length) {
  console.error("\nQA session/Web Push en échec:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("\nQA session/Web Push: 38 contrôles source-level passent.");
