import fs from "node:fs";
import process from "node:process";

const target = Number.parseInt(process.env.TARGET_VUS || "0", 10);
const profile = (process.env.LOAD_PROFILE || "").toLowerCase();
const registryPath = process.env.SCALE7_REGISTRY_PATH || "data/scalability/scale7-certifications.json";
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const githubRepository = process.env.GITHUB_REPOSITORY || "";
const githubSha = process.env.GITHUB_SHA || "";
const githubToken = process.env.GITHUB_TOKEN || "";
const evidenceIssueNumber = 360;
const workflowPath = ".github/workflows/scale7-staged-certification.yml";
const targets = [500, 1000, 2500, 5000];
const profiles = ["ramp", "soak", "spike"];

if (!targets.includes(target) || !profiles.includes(profile)) {
  console.error("Invalid SCALE-7 target/profile");
  process.exit(1);
}

function readRegistryPass(stage, mode) {
  if (!fs.existsSync(registryPath)) return null;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const records = Array.isArray(registry.records) ? registry.records : [];
  return records
    .filter((record) => record.targetVus === stage && record.profile === mode && record.status === "PASS")
    .sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt))[0] || null;
}

function parseBotEvidence(comment) {
  if (comment?.user?.login !== "github-actions[bot]" || typeof comment.body !== "string") return null;
  const match = comment.body.match(/SCALE7_RESULT_JSON\s*```json\s*([\s\S]*?)\s*```/m);
  if (!match) return null;
  try {
    const report = JSON.parse(match[1]);
    if (
      report?.contract !== "SCALE-7" ||
      report?.status !== "PASS" ||
      report?.evidence?.loadExecution !== "CI_PROVEN" ||
      !targets.includes(report?.targetVus) ||
      !profiles.includes(report?.profile) ||
      typeof report?.generatedAt !== "string" ||
      !report?.githubRunId ||
      typeof report?.gitSha !== "string"
    ) {
      return null;
    }
    return report;
  } catch {
    return null;
  }
}

async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${githubRepository}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dtsc-scale7-progression",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub evidence API failed (${response.status}) for ${path}`);
  }
  return response.json();
}

async function loadBotEvidence() {
  const reports = [];
  for (let page = 1; page <= 10; page += 1) {
    const comments = await githubJson(`/issues/${evidenceIssueNumber}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(comments)) throw new Error("GitHub issue comments response is invalid");
    for (const comment of comments) {
      const report = parseBotEvidence(comment);
      if (report && report.gitSha === githubSha) reports.push(report);
    }
    if (comments.length < 100) break;
  }
  return reports;
}

async function buildCiPassResolver() {
  if (!githubRepository || !githubSha || !githubToken) {
    throw new Error("SCALE-7 CI progression requires GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN");
  }

  const reports = await loadBotEvidence();
  const runCache = new Map();

  async function verifiedRun(report) {
    const runId = String(report.githubRunId);
    if (!runCache.has(runId)) {
      runCache.set(runId, await githubJson(`/actions/runs/${encodeURIComponent(runId)}`));
    }
    const run = runCache.get(runId);
    return run?.status === "completed" &&
      run?.conclusion === "success" &&
      run?.head_sha === githubSha &&
      run?.head_branch === "main" &&
      run?.path === workflowPath;
  }

  return async (stage, mode) => {
    const candidates = reports
      .filter((report) => report.targetVus === stage && report.profile === mode)
      .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));

    for (const report of candidates) {
      if (await verifiedRun(report)) return report;
    }
    return null;
  };
}

const latestPass = isGithubActions
  ? await buildCiPassResolver()
  : async (stage, mode) => readRegistryPass(stage, mode);

const previousStage = target === 1000 ? 500 : target === 2500 ? 1000 : target === 5000 ? 2500 : null;

if (previousStage) {
  for (const mode of profiles) {
    if (!await latestPass(previousStage, mode)) {
      console.error(`SCALE-7 stage ${target} is blocked until ${previousStage} has verified PASS evidence for ramp, soak and spike on the current candidate`);
      process.exit(1);
    }
  }
}

if (profile === "soak" && !await latestPass(target, "ramp")) {
  console.error(`SCALE-7 ${target} soak is blocked until ramp has verified PASS evidence on the current candidate`);
  process.exit(1);
}

if (profile === "spike" && (!await latestPass(target, "ramp") || !await latestPass(target, "soak"))) {
  console.error(`SCALE-7 ${target} spike is blocked until ramp and soak have verified PASS evidence on the current candidate`);
  process.exit(1);
}

console.log(`SCALE-7 progression gate: ${target} ${profile} allowed`);
