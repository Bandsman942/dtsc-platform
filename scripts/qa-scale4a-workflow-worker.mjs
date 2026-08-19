import assert from "node:assert/strict";
import fs from "node:fs";

const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const worker = fs.readFileSync("lib/enterprise/workflows/worker.ts", "utf8");
const route = fs.readFileSync("app/api/internal/workflows/process/route.ts", "utf8");

const workerCron = (vercel.crons || []).find((item) => item.path === "/api/internal/workflows/process?batch=20");
assert.ok(workerCron, "SCALE-4A: le cron du worker workflow doit rester déclaré avec batch=20.");
assert.equal(workerCron.schedule, "* * * * *", "SCALE-4A: le worker workflow doit être planifié chaque minute.");

assert.match(worker, /FOR UPDATE SKIP LOCKED/, "SCALE-4A: la réclamation multi-instance doit conserver FOR UPDATE SKIP LOCKED.");
assert.match(worker, /workerLeaseSeconds/, "SCALE-4A: la lease de worker doit rester appliquée.");
assert.match(worker, /getWorkflowQueueSnapshot/, "SCALE-4A: le snapshot de pression de file est obligatoire.");
assert.match(worker, /queueBefore/, "SCALE-4A: la pression avant traitement doit être exposée.");
assert.match(worker, /queueAfter/, "SCALE-4A: la pression après traitement doit être exposée.");
assert.match(worker, /saturated/, "SCALE-4A: un lot plein avec backlog restant doit produire un signal de saturation.");
assert.match(worker, /processingStatus: dead \? "DEAD" : "FAILED"/, "SCALE-4A: le contrat retry/DLQ doit rester explicite.");
assert.doesNotMatch(worker, /Promise\.all\s*\(\s*claimed/, "SCALE-4A: cette itération ne doit pas paralléliser aveuglément les événements métier.");

assert.match(route, /export const maxDuration = 60/, "SCALE-4A: la durée Function doit rester bornée à 60 secondes.");
assert.match(route, /process\.env\.CRON_SECRET/, "SCALE-4A: le secret Vercel Cron doit rester accepté.");
assert.match(route, /process\.env\.WORKFLOW_WORKER_SECRET/, "SCALE-4A: le secret worker dédié doit rester accepté.");
assert.match(route, /queueBefore: result\.queueBefore/, "SCALE-4A: la route doit retourner le snapshot avant traitement.");
assert.match(route, /queueAfter: result\.queueAfter/, "SCALE-4A: la route doit retourner le snapshot après traitement.");
assert.match(route, /saturated: result\.saturated/, "SCALE-4A: la route doit retourner le signal de saturation.");

console.log("PASS SCALE-4A — worker workflow 1 min, queue pressure observable, SKIP LOCKED/lease/retry préservés.");
