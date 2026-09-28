import fs from "node:fs";
import process from "node:process";

const reportPath = process.argv[2];
const registryPath = process.argv[3] || "data/scalability/scale7-certifications.json";

if (!reportPath || !fs.existsSync(reportPath)) {
  console.error("Usage: node scripts/load/archive-scale7-certification.mjs <report.json> [registry.json]");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.contract !== "SCALE-7" || ![500, 1000, 2500, 5000].includes(report.targetVus)) {
  console.error("Report is not a valid SCALE-7 certification stage");
  process.exit(1);
}
if (!["ramp", "soak", "spike"].includes(report.profile) || !["PASS", "FAIL"].includes(report.status)) {
  console.error("Report profile/status is invalid");
  process.exit(1);
}
if (report.evidence?.loadExecution !== "CI_PROVEN" || !report.githubRunId || !report.gitSha) {
  console.error("Only CI-proven reports with run id and git SHA may be archived");
  process.exit(1);
}

const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : { version: 1, records: [] };
const record = {
  targetVus: report.targetVus,
  profile: report.profile,
  status: report.status,
  testedAt: report.generatedAt,
  durationSeconds: report.durationSeconds ?? null,
  requestsPerSecond: report.http?.requestsPerSecond ?? null,
  p95Ms: report.http?.latencyMs?.p95 ?? null,
  p99Ms: report.http?.latencyMs?.p99 ?? null,
  errorRate: report.http?.failedRate ?? null,
  tenantIsolationRate: report.http?.tenantIsolationRate ?? null,
  dbConnectionUtilization: report.infrastructure?.maxDbConnectionUtilization ?? null,
  redisStatuses: Array.isArray(report.infrastructure?.redisStatuses) ? report.infrastructure.redisStatuses : [],
  aiActiveAttempts: report.infrastructure?.maxAiActiveAttempts ?? null,
  aiThrottledAttempts: report.infrastructure?.maxAiThrottledAttempts ?? null,
  githubRunId: String(report.githubRunId),
  gitSha: report.gitSha,
  evidenceRef: `github-actions-run:${report.githubRunId}`,
};

registry.version = 1;
registry.records = Array.isArray(registry.records) ? registry.records : [];
registry.records = registry.records.filter((item) =>
  !(item.targetVus === record.targetVus && item.profile === record.profile && item.githubRunId === record.githubRunId)
);
registry.records.push(record);
registry.records.sort((a, b) => Date.parse(a.testedAt) - Date.parse(b.testedAt));
fs.mkdirSync(new URL(".", `file://${process.cwd()}/${registryPath}`).pathname, { recursive: true });
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Archived SCALE-7 ${record.targetVus} ${record.profile} ${record.status} from run ${record.githubRunId}`);
