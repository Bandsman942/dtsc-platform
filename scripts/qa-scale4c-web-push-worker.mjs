import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const vercel = JSON.parse(read("vercel.json"));
const notifications = read("lib/notifications.ts");
const pushConstants = read("lib/push/constants.ts");
const pushQueue = read("lib/push/queue.ts");
const pushSender = read("lib/push/sender.ts");
const pushWorker = read("lib/push/worker.ts");
const pushRoute = read("app/api/internal/web-push/process/route.ts");
const workflowWorker = read("lib/enterprise/workflows/worker-isolated.ts");
const legacyWorkflowWorker = read("lib/enterprise/workflows/worker.ts");
const payload = read("lib/push/payload.ts");
const serviceWorker = read("public/sw.js");
const workflowSchema = read("prisma/enterprise-workflow-engine.prisma");

const pushCron = (vercel.crons || []).find((item) => item.path === "/api/internal/web-push/process?batch=50");
assert.ok(pushCron, "SCALE-4C: le cron Web Push dédié doit être déclaré avec batch=50.");
assert.equal(pushCron.schedule, "* * * * *", "SCALE-4C: le worker Web Push doit être planifié chaque minute.");

assert.match(workflowSchema, /model EnterpriseDomainEvent/, "SCALE-4C: la file durable canonique EnterpriseDomainEvent doit rester la source unique.");
assert.match(workflowSchema, /idempotencyKey\s+String/, "SCALE-4C: la file durable doit conserver sa clé d'idempotence.");
assert.match(workflowSchema, /processingStatus\s+String/, "SCALE-4C: la file durable doit conserver son état de traitement.");
assert.match(pushConstants, /PLATFORM_WEB_PUSH_NOTIFICATION/, "SCALE-4C: un eventType réservé Web Push est obligatoire.");
assert.match(pushConstants, /workerBatchSize: 50/, "SCALE-4C: le batch Push doit rester borné.");
assert.match(pushConstants, /maxAttempts: 5/, "SCALE-4C: le nombre de tentatives Push doit rester borné.");

assert.match(pushQueue, /enterpriseDomainEvent\.create/, "SCALE-4C: l'enqueue Push doit utiliser la file durable canonique.");
assert.match(pushQueue, /platform:web-push:\$\{notificationId\}/, "SCALE-4C: l'idempotence Push doit dériver de l'ID canonique de notification.");
assert.match(notifications, /prisma\.\$transaction/, "SCALE-4C: notification et enqueue doivent partager une transaction DB.");
assert.match(notifications, /enqueueWebPushNotification/, "SCALE-4C: notifyUser doit enqueue le Push durablement.");
assert.match(notifications, /buildWebPushDomainEventData/, "SCALE-4C: notifyUsers doit créer les jobs Push avec les notifications bulk.");
assert.doesNotMatch(notifications, /dispatchPushForNotification|dispatchPushForNotifications|sendEncryptedWebPush/, "SCALE-4C: notifyUser/notifyUsers ne doivent plus attendre le réseau Web Push.");
assert.match(notifications, /randomUUID/, "SCALE-4C: le bulk doit pré-générer de vrais IDs de notifications.");

assert.match(pushWorker, /FOR UPDATE SKIP LOCKED/, "SCALE-4C: le claim Push doit être sûr en multi-instance.");
assert.match(pushWorker, /WEB_PUSH_DOMAIN_EVENT_TYPE/, "SCALE-4C: le worker ne doit réclamer que les jobs Push.");
assert.match(pushWorker, /recoverStalePushJobs/, "SCALE-4C: les leases Push périmées doivent être récupérées.");
assert.match(pushWorker, /processingStatus: terminal \? "DEAD" : "FAILED"/, "SCALE-4C: retries et DLQ DEAD doivent rester explicites.");
assert.match(pushWorker, /2 \*\* Math\.max\(0, attemptCount - 1\)/, "SCALE-4C: le backoff Push doit être exponentiel.");
assert.match(pushWorker, /oldestReadyAgeMs/, "SCALE-4C: l'âge du backlog Push doit être observable.");
assert.match(pushWorker, /saturated:/, "SCALE-4C: la saturation Push doit être signalée.");
assert.match(pushWorker, /WEB_PUSH_QUEUE_ENTITY_MISMATCH/, "SCALE-4C: le worker doit valider le type d'entité du job.");

for (const source of [workflowWorker, legacyWorkflowWorker]) {
  assert.match(source, /WEB_PUSH_DOMAIN_EVENT_TYPE/, "SCALE-4C: chaque worker workflow doit connaître l'eventType Push réservé.");
  assert.match(source, /"eventType" <> \$\{WEB_PUSH_DOMAIN_EVENT_TYPE\}/, "SCALE-4C: le worker workflow ne doit jamais réclamer ni compter les jobs Push.");
}

assert.match(pushSender, /dispatchStoredPushNotification/, "SCALE-4C: le sender doit relire la notification canonique au moment du dispatch.");
assert.match(pushSender, /webPushQueueOrganizationId\(notification\.organizationId\) !== expectedQueueOrganizationId/, "SCALE-4C: le worker doit vérifier le scope organisation de la notification.");
assert.match(pushSender, /notificationId: notification\.id/, "SCALE-4C: le payload doit utiliser le véritable ID canonique de notification.");
assert.match(pushSender, /result\.status === 404 \|\| result\.status === 410/, "SCALE-4C: les subscriptions expirées doivent être nettoyées.");
assert.match(pushSender, /status === 429 \|\| status >= 500/, "SCALE-4C: les erreurs réseau transitoires doivent être rejouables.");
assert.match(payload, /notificationId/, "SCALE-4C: le tag Push doit dériver de l'ID de notification.");
assert.match(serviceWorker, /tag: payload\.tag/, "SCALE-4C: les retries doivent conserver un tag stable pour éviter les doublons visibles.");

assert.match(pushRoute, /process\.env\.CRON_SECRET/, "SCALE-4C: Vercel Cron doit rester autorisé.");
assert.match(pushRoute, /process\.env\.WEB_PUSH_WORKER_SECRET/, "SCALE-4C: un secret opérateur Push dédié doit être accepté.");
assert.match(pushRoute, /timingSafeEqual/, "SCALE-4C: les secrets worker doivent être comparés en temps constant.");
assert.match(pushRoute, /export const maxDuration = 60/, "SCALE-4C: la Function Push doit rester bornée à 60 secondes.");
assert.match(pushRoute, /queueBefore/, "SCALE-4C: le snapshot avant traitement doit être exposé.");
assert.match(pushRoute, /queueAfter/, "SCALE-4C: le snapshot après traitement doit être exposé.");
assert.match(pushRoute, /saturated/, "SCALE-4C: la saturation doit être exposée.");
assert.doesNotMatch(pushRoute, /entityId|userId|organizationId|payload/, "SCALE-4C: la réponse interne ne doit exposer aucun identifiant ou payload métier.");

console.log("PASS SCALE-4C — Web Push durable, atomique, isolé, idempotent, retryable et observable.");
