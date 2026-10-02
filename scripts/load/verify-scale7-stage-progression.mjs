import process from "node:process";

const target = Number.parseInt(process.env.TARGET_VUS || "0", 10);
const profile = (process.env.LOAD_PROFILE || "").toLowerCase();
const repository = process.env.GITHUB_REPOSITORY || "";
const currentSha = process.env.GITHUB_SHA || "";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const issueNumber = 360;
const workflowPath = ".github/workflows/scale7-staged-certification.yml";
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const testMode = process.env.SCALE7_PROGRESSION_TEST_MODE === "true";
const testFixture = process.env.SCALE7_PROGRESS_EVIDENCE_JSON || "";

const governanceOnlyFiles = new Set([
  ".github/workflows/scale7-staged-certification.yml",
  "scripts/load/verify-scale7-stage-progression.mjs",
  "scripts/qa-scale7-staged-certification.mjs",
  "scripts/qa-scale7d-dashboard-workload-report.mjs",
  "docs/SCALABILITY_SCALE7_STAGED_CERTIFICATION.md",
  "docs/CHANGELOG.md",
]);

if (![500, 1000, 2500, 5000].includes(target) || !["ramp", "soak", "spike"].includes(profile)) {
  console.error("Invalid SCALE-7 target/profile");
  process.exit(1);
}

function requiredProofs(stage, mode) {
  const proofs = [];
  const previousStage = stage === 1000 ? 500 : stage === 2500 ? 1000 : stage === 5000 ? 2500 : null;
  if (previousStage) {
    for (const previousProfile of ["ramp", "soak", "spike"]) {
      proofs.push({ targetVus: previousStage, profile: previousProfile });
    }
  }
  if (mode === "soak" || mode === "spike") proofs.push({ targetVus: stage, profile: "ramp" });
  if (mode === "spike") proofs.push({ targetVus: stage, profile: "soak" });
  return proofs.filter((proof, index, all) =>
    all.findIndex((candidate) =>
      candidate.targetVus === proof.targetVus && candidate.profile === proof.profile
    ) === index
  );
}

const requirements = requiredProofs(target, profile);
if (requirements.length === 0) {
  console.log(`SCALE-7 progression gate: ${target} ${profile} allowed (no prior stage evidence required)`);
  process.exit(0);
}

if (!repository || !currentSha) {
  console.error("SCALE-7 progression requires GITHUB_REPOSITORY and GITHUB_SHA");
  process.exit(1);
}
if (!testMode && !token) {
  console.error("SCALE-7 progression requires a GitHub token for CI_PROVEN evidence verification");
  process.exit(1);
}

let fixture = null;
if (testMode) {
  if (!testFixture) {
    console.error("SCALE-7 progression test mode requires SCALE7_PROGRESS_EVIDENCE_JSON");
    process.exit(1);
  }
  try {
    fixture = JSON.parse(testFixture);
  } catch {
    console.error("SCALE-7 progression test fixture is invalid JSON");
    process.exit(1);
  }
}

function apiHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "dtsc-scale7-progression",
  };
}

async function githubJson(url) {
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}`);
  }
  return response.json();
}

async function loadIssueComments() {
  if (testMode) return Array.isArray(fixture?.comments) ? fixture.comments : [];

  const comments = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await githubJson(
      `${apiBase}/repos/${repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`
    );
    if (!Array.isArray(batch)) throw new Error("GitHub issue comments response is invalid");
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  return comments;
}

function extractScale7Result(comment) {
  if (comment?.user?.login !== "github-actions[bot]") return null;
  const body = typeof comment.body === "string" ? comment.body : "";
  const match = body.match(/SCALE7_RESULT_JSON\s*\`\`\`json\s*([\s\S]*?)\s*\`\`\`/);
  if (!match) return null;
  try {
    const result = JSON.parse(match[1]);
    if (
      result?.contract !== "SCALE-7" ||
      result?.status !== "PASS" ||
      ![500, 1000, 2500, 5000].includes(Number(result?.targetVus)) ||
      !["ramp", "soak", "spike"].includes(result?.profile) ||
      !/^[0-9a-f]{40}$/i.test(String(result?.gitSha || "")) ||
      !/^\d+$/.test(String(result?.githubRunId || ""))
    ) return null;
    return {
      targetVus: Number(result.targetVus),
      profile: result.profile,
      gitSha: String(result.gitSha),
      githubRunId: String(result.githubRunId),
      generatedAt: String(result.generatedAt || ""),
    };
  } catch {
    return null;
  }
}

async function loadWorkflowRun(runId) {
  if (testMode) return fixture?.runs?.[String(runId)] || null;
  return githubJson(`${apiBase}/repos/${repository}/actions/runs/${runId}`);
}

async function compareEvidenceSha(evidenceSha) {
  if (evidenceSha === currentSha) return { compatible: true, reason: "exact SHA" };

  let comparison;
  if (testMode) {
    comparison = fixture?.comparisons?.[`${evidenceSha}...${currentSha}`] || null;
  } else {
    comparison = await githubJson(
      `${apiBase}/repos/${repository}/compare/${evidenceSha}...${currentSha}`
    );
  }

  if (!comparison) return { compatible: false, reason: "missing SHA comparison" };
  if (comparison.status !== "ahead" || Number(comparison.behind_by || 0) !== 0) {
    return { compatible: false, reason: "evidence SHA is not an ancestor of the current SHA" };
  }
  const aheadBy = Number(comparison.ahead_by || 0);
  const files = Array.isArray(comparison.files) ? comparison.files : [];
  if (aheadBy < 1 || aheadBy > 20 || files.length === 0) {
    return { compatible: false, reason: "governance-only lineage is not bounded" };
  }
  const unexpected = files
    .map((file) => file?.filename)
    .filter((filename) => !governanceOnlyFiles.has(filename));
  if (unexpected.length > 0) {
    return { compatible: false, reason: `runtime/non-governance files changed: ${unexpected.join(", ")}` };
  }
  return { compatible: true, reason: "governance-only descendant SHA" };
}

async function validateCandidate(candidate) {
  const run = await loadWorkflowRun(candidate.githubRunId);
  if (!run) return { valid: false, reason: "workflow run not found" };

  const runPath = String(run.path || "").split("@")[0];
  if (
    run.conclusion !== "success" ||
    runPath !== workflowPath ||
    run.head_sha !== candidate.gitSha ||
    run.head_branch !== "main" ||
    !["issue_comment", "workflow_dispatch"].includes(run.event)
  ) {
    return { valid: false, reason: "workflow run does not match the SCALE-7 CI_PROVEN contract" };
  }

  const compatibility = await compareEvidenceSha(candidate.gitSha);
  if (!compatibility.compatible) return { valid: false, reason: compatibility.reason };
  return { valid: true, reason: compatibility.reason };
}

try {
  const comments = await loadIssueComments();
  const candidates = comments.map(extractScale7Result).filter(Boolean);

  for (const requirement of requirements) {
    const matches = candidates
      .filter((candidate) =>
        candidate.targetVus === requirement.targetVus &&
        candidate.profile === requirement.profile
      )
      .sort((a, b) => Date.parse(b.generatedAt || 0) - Date.parse(a.generatedAt || 0));

    let accepted = null;
    const rejectionReasons = [];
    for (const candidate of matches) {
      const verdict = await validateCandidate(candidate);
      if (verdict.valid) {
        accepted = { candidate, verdict };
        break;
      }
      rejectionReasons.push(`${candidate.githubRunId}: ${verdict.reason}`);
    }

    if (!accepted) {
      const details = rejectionReasons.length > 0 ? ` (${rejectionReasons.join("; ")})` : "";
      console.error(
        `SCALE-7 ${target} ${profile} is blocked until ${requirement.targetVus} ${requirement.profile} has CI_PROVEN PASS evidence${details}`
      );
      process.exit(1);
    }

    console.log(
      `SCALE-7 progression proof accepted: ${requirement.targetVus} ${requirement.profile} run ${accepted.candidate.githubRunId} (${accepted.verdict.reason})`
    );
  }

  console.log(`SCALE-7 progression gate: ${target} ${profile} allowed`);
} catch (error) {
  console.error(`SCALE-7 progression evidence verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
