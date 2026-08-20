import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const vercel = JSON.parse(read("vercel.json"));
const broadcastRoute = read("app/api/admin/broadcast/route.ts");
const adminSettings = read("components/admin/admin-settings-panel.tsx");
const queue = read("lib/mail/admin-broadcast-queue.ts");
const constants = read("lib/mail/broadcast-constants.ts");
const worker = read("lib/mail/admin-broadcast-worker.ts");
const workerRoute = read("app/api/internal/admin-broadcast-email/process/route.ts");
const workflowWorker = read("lib/enterprise/workflows/worker-isolated.ts");
const legacyWorkflowWorker = read("lib/enterprise/workflows/worker.ts");
const workflowSchema = read("prisma/enterprise-workflow-engine.prisma");

const cron = (vercel.crons || []).find((item) => item.path === "/api/internal/admin-broadcast-email/process?batch=50");
assert.ok(cron, "SCALE-4D: le cron email broadcast dédié doit être déclaré avec batch=50.");
assert.equal(cron.schedule, "* * * * *", "SCALE-4D: le worker email broadcast doit tourner chaque minute.");

assert.match(workflowSchema, /model EnterpriseDomainEvent/, "SCALE-4D: EnterpriseDomainEvent reste la file durable canonique.");
assert.match(workflowSchema, /payloadJson\s+Json\?/, "SCALE-4D: la file canonique doit pouvoir conserver le payload email maître.");
assert.match(constants, /PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY/, "SCALE-4D: un eventType réservé aux livraisons email est obligatoire.");
assert.match(constants, /workerBatchSize: 50/, "SCALE-4D: le batch email doit rester borné.");
assert.match(constants, /workerConcurrency: 5/, "SCALE-4D: la concurrence provider doit rester bornée.");
assert.match(constants, /maxAttempts: 5/, "SCALE-4D: le nombre de tentatives doit rester borné.");

assert.match(broadcastRoute, /enqueueAdminBroadcast/, "SCALE-4D: l'API admin doit remettre la diffusion à l'outbox durable.");
assert.match(broadcastRoute, /status: 202/, "SCALE-4D: une diffusion acceptée doit répondre 202 sans attendre le provider email.");
assert.match(broadcastRoute, /zoho:\s*\{\s*sent:\s*false,\s*queued:\s*true/, "SCALE-4D: l'API ne doit jamais annoncer une livraison provider avant le worker.");
assert.doesNotMatch(broadcastRoute, /sendZohoOutboundMail|sendPersonalizedZohoOutboundMail|sendZohoMailWebhook/, "SCALE-4D: la requête interactive ne doit plus appeler Zoho ni son webhook.");
assert.doesNotMatch(broadcastRoute, /notification\.createMany/, "SCALE-4D: le chemin {user} ne doit plus contourner le service d'outbox.");
assert.match(adminSettings, /body\?\.zoho\?\.queued/, "SCALE-4D: l'UI Admin doit reconnaître explicitement l'état mis en file.");
assert.match(adminSettings, /mise en file/, "SCALE-4D: la confirmation Admin doit présenter la diffusion comme mise en file, pas comme déjà livrée.");
assert.match(adminSettings, /Notifier et mettre en file/, "SCALE-4D: le CTA Admin doit refléter le contrat asynchrone.");

assert.match(queue, /prisma\.\$transaction/, "SCALE-4D: notifications, Push et email doivent être enregistrés dans une transaction.");
assert.match(queue, /if \(!recipients\.length\)/, "SCALE-4D: une audience vide doit sortir proprement sans créer de job orphelin.");
assert.match(queue, /emailJobsQueued:\s*0/, "SCALE-4D: une audience vide doit annoncer zéro job email.");
assert.match(queue, /buildWebPushDomainEventData/, "SCALE-4D: les notifications broadcast personnalisées doivent produire leurs jobs Push durables.");
assert.match(queue, /ADMIN_BROADCAST_EMAIL_PAYLOAD_EVENT_TYPE/, "SCALE-4D: le contenu lourd doit être stocké une fois dans un payload maître.");
assert.match(queue, /recipientEmail/, "SCALE-4D: les broadcasts personnalisés doivent être rejouables destinataire par destinataire.");
assert.match(queue, /recipientEmails/, "SCALE-4D: les broadcasts non personnalisés doivent conserver le mode groupé.");
assert.match(queue, /notifyBroadcastEnabled/, "SCALE-4D: les préférences de notification interne doivent rester respectées.");

assert.match(worker, /FOR UPDATE SKIP LOCKED/, "SCALE-4D: le claim email doit être sûr en multi-instance.");
assert.match(worker, /Promise\.all/, "SCALE-4D: les livraisons peuvent être parallélisées dans une fenêtre bornée.");
assert.match(worker, /workerConcurrency/, "SCALE-4D: le worker doit appliquer la concurrence bornée.");
assert.match(worker, /sendZohoOutboundMail/, "SCALE-4D: Zoho doit être appelé uniquement côté worker.");
assert.match(worker, /sendZohoMailWebhook/, "SCALE-4D: le fallback webhook doit rester côté worker.");
assert.match(worker, /ADMIN_BROADCAST_EMAIL_PROVIDER_UNAVAILABLE/, "SCALE-4D: les échecs fournisseur doivent être normalisés vers un code interne stable.");
assert.doesNotMatch(worker, /reason\.slice|details\.slice/, "SCALE-4D: aucun détail brut du fournisseur ne doit être persisté dans lastError.");
assert.match(worker, /processingStatus: terminal \? "DEAD" : "FAILED"/, "SCALE-4D: retries et DLQ DEAD doivent rester explicites.");
assert.match(worker, /oldestReadyAgeMs/, "SCALE-4D: l'âge du backlog email doit être observable.");
assert.match(worker, /saturated:/, "SCALE-4D: la saturation email doit être exposée.");
assert.match(worker, /ADMIN_BROADCAST_EMAIL_MASTER_PAYLOAD_MISSING/, "SCALE-4D: un job orphelin doit échouer explicitement.");

for (const source of [workflowWorker, legacyWorkflowWorker]) {
  assert.match(source, /ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE/, "SCALE-4D: les workers workflow doivent connaître l'eventType email réservé.");
  assert.match(source, /"eventType" <> \$\{ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE\}/, "SCALE-4D: les workers workflow ne doivent jamais réclamer les jobs email.");
}

assert.match(workerRoute, /process\.env\.CRON_SECRET/, "SCALE-4D: Vercel Cron doit pouvoir autoriser le worker.");
assert.match(workerRoute, /process\.env\.WORKFLOW_WORKER_SECRET/, "SCALE-4D: le secret opérateur existant doit pouvoir autoriser le worker.");
assert.match(workerRoute, /timingSafeEqual/, "SCALE-4D: les secrets worker doivent être comparés en temps constant.");
assert.match(workerRoute, /export const maxDuration = 60/, "SCALE-4D: la Function email doit rester bornée à 60 secondes.");
assert.match(workerRoute, /queueBefore/, "SCALE-4D: le snapshot avant traitement doit être exposé.");
assert.match(workerRoute, /queueAfter/, "SCALE-4D: le snapshot après traitement doit être exposé.");
assert.match(workerRoute, /saturated/, "SCALE-4D: la saturation doit être exposée.");
const successResponse = workerRoute.match(/return NextResponse\.json\(\{\s*ok:\s*true,[\s\S]*?saturated:\s*result\.saturated,\s*\}\);/)?.[0] || "";
assert.ok(successResponse, "SCALE-4D: la réponse succès du worker doit rester détectable par la QA.");
assert.doesNotMatch(successResponse, /\brecipientEmail\b|\brecipientEmails\b|\bpayloadJson\b|\bsubject\b|\bmessage\b|\bbody\b|\bcontent\b/i, "SCALE-4D: la réponse succès interne ne doit exposer aucun destinataire ni contenu métier.");

console.log("PASS SCALE-4D — broadcasts admin asynchrones, atomiques, isolés, retryables, observables, confidentiels et honnêtes sur l'état de livraison.");
