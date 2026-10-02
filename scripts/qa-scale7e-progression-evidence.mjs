import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-7E: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS SCALE-7E: ${message}`);
  }
}

const progression = read("scripts/load/verify-scale7-stage-progression.mjs");
const workflow = read(".github/workflows/scale7-staged-certification.yml");

expect(
  progression.includes('comment?.user?.login !== "github-actions[bot]"') &&
  progression.includes('report?.evidence?.loadExecution !== "CI_PROVEN"') &&
  progression.includes("report.gitSha === githubSha"),
  "CI progression accepts only bot-published CI_PROVEN evidence for the current SHA",
);

expect(
  progression.includes('/actions/runs/${encodeURIComponent(runId)}') &&
  progression.includes('run?.status === "completed"') &&
  progression.includes('run?.conclusion === "success"') &&
  progression.includes('run?.head_sha === githubSha') &&
  progression.includes('run?.head_branch === "main"') &&
  progression.includes('run?.path === workflowPath'),
  "CI progression cross-checks the exact successful GitHub Actions run",
);

expect(
  progression.includes('const evidenceIssueNumber = 360') &&
  progression.includes('/issues/${evidenceIssueNumber}/comments?per_page=100&page=${page}'),
  "CI progression reads only governed Issue #360 evidence",
);

expect(
  progression.includes('profile === "soak"') &&
  progression.includes('latestPass(target, "ramp")') &&
  progression.includes('profile === "spike"') &&
  progression.includes('latestPass(target, "soak")') &&
  progression.includes("for (const mode of profiles)"),
  "ramp to soak to spike and previous-stage ordering remains fail-closed",
);

expect(
  progression.includes("isGithubActions") &&
  progression.includes("buildCiPassResolver") &&
  progression.includes("readRegistryPass"),
  "versioned registry remains a local/history fallback but CI uses verified remote evidence",
);

expect(
  workflow.includes("actions: read") &&
  workflow.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}') &&
  workflow.includes("verify-scale7-stage-progression.mjs"),
  "workflow grants only the Actions read capability needed to verify progression evidence",
);

for (const forbidden of ["SCALE7_BYPASS_PROGRESSION", "ALLOW_UNVERIFIED_SCALE7", "SKIP_SCALE7_PROGRESSION"]) {
  expect(!progression.includes(forbidden) && !workflow.includes(forbidden), `no progression bypass exists: ${forbidden}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7E progression evidence contract passed.");
