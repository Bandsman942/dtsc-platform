import assert from "node:assert/strict";
import fs from "node:fs";

const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const workflowRoute = fs.readFileSync("app/api/internal/workflows/process/route.ts", "utf8");
const isolatedWorker = fs.readFileSync("lib/enterprise/workflows/worker-isolated.ts", "utf8");
const projectionQueue = fs.readFileSync("lib/enterprise/cross-module/projection-queue.ts", "utf8");
const projectionService = fs.readFileSync("lib/enterprise/cross-module/projection-service.ts", "utf8");
const projectionRoute = fs.readFileSync("app/api/internal/cross-module-projections/process/route.ts", "utf8");
const projectionSchema = fs.readFileSync("prisma/enterprise-cross-module.prisma", "utf8");

const projectionCron = (vercel.crons || []).find((item) => item.path === "/api/internal/cross-module-projections/process?batch=20");
assert.ok(projectionCron, "SCALE-4B: le cron projection dédié doit être déclaré avec batch=20.");
assert.equal(projectionCron.schedule, "* * * * *", "SCALE-4B: le worker projection doit être planifié chaque minute.");

assert.match(workflowRoute, /worker-isolated/, "SCALE-4B: la route workflow doit utiliser le worker isolé.");
assert.doesNotMatch(workflowRoute, /pendingProjections/, "SCALE-4B: la route workflow ne doit plus exécuter de backlog projection.");
assert.match(isolatedWorker, /enqueueCrossModuleProjections/, "SCALE-4B: le worker workflow doit seulement matérialiser les projections.");
assert.doesNotMatch(isolatedWorker, /processCrossModuleProjections|processPendingCrossModuleProjections/, "SCALE-4B: aucune projection lourde ne doit s'exécuter dans le worker workflow isolé.");
assert.match(isolatedWorker, /FOR UPDATE SKIP LOCKED/, "SCALE-4B: la file workflow conserve son claim multi-instance.");
assert.match(isolatedWorker, /workerLeaseSeconds/, "SCALE-4B: la lease workflow doit rester active.");

assert.match(projectionQueue, /enterpriseCrossModuleProjection\.upsert/, "SCALE-4B: l'enqueue projection doit être idempotent.");
assert.match(projectionQueue, /organizationId_domainEventId_consumerCode/, "SCALE-4B: la clé idempotente canonique doit être utilisée.");
assert.match(projectionSchema, /@@unique\(\[organizationId, domainEventId, consumerCode\]\)/, "SCALE-4B: la contrainte d'unicité projection doit rester dans Prisma.");
assert.match(projectionQueue, /getCrossModuleProjectionQueueSnapshot/, "SCALE-4B: le snapshot de file projection est obligatoire.");
assert.match(projectionQueue, /oldestReadyAgeMs/, "SCALE-4B: l'âge du backlog projection doit être mesuré.");

assert.match(projectionService, /status: "PROCESSING"/, "SCALE-4B: les projections doivent conserver un état PROCESSING.");
assert.match(projectionService, /status: dead \? "DEAD" : "FAILED"/, "SCALE-4B: retries et terminal DEAD doivent rester explicites.");
assert.match(projectionService, /staleProcessingBefore/, "SCALE-4B: la récupération des traitements stale doit rester active.");
assert.match(projectionService, /attemptCount: \{ increment: 1 \}/, "SCALE-4B: les tentatives doivent rester comptabilisées.");

assert.match(projectionRoute, /process\.env\.CRON_SECRET/, "SCALE-4B: Vercel Cron doit rester autorisé.");
assert.match(projectionRoute, /process\.env\.CROSS_MODULE_PROJECTION_WORKER_SECRET/, "SCALE-4B: un secret opérateur dédié doit être accepté.");
assert.match(projectionRoute, /export const maxDuration = 60/, "SCALE-4B: la Function projection doit rester bornée à 60 secondes.");
assert.match(projectionRoute, /queueBefore/, "SCALE-4B: le snapshot avant traitement doit être exposé.");
assert.match(projectionRoute, /queueAfter/, "SCALE-4B: le snapshot après traitement doit être exposé.");
assert.match(projectionRoute, /saturated/, "SCALE-4B: la saturation projection doit être signalée.");
assert.doesNotMatch(projectionRoute, /result\.results[,}]/, "SCALE-4B: la route interne ne doit pas exposer les objets projection complets.");

console.log("PASS SCALE-4B — projections inter-modules isolées, enqueue idempotent, worker dédié observable et borné.");
