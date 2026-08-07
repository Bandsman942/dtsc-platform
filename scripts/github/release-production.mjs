import fs from 'node:fs';
import {
  buildProductionTag,
  findProductionTagForSha,
  hasReleaseForTag,
  isFinalDeploymentState,
  isProductionDeployment,
  shouldCreateSuccessfulRelease,
  shouldOpenProductionBlocker,
} from './release-production-core.mjs';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!repo || !token || !eventPath) {
  console.error('Missing GitHub event context.');
  process.exit(2);
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const deployment = event.deployment;
const status = event.deployment_status;

if (!deployment || !status) {
  console.error('production-release requires a deployment_status event.');
  process.exit(2);
}

if (!isProductionDeployment(event)) {
  console.log('Ignoring deployment that is not Vercel Production.');
  process.exit(0);
}

const sha = deployment.sha;
const state = status.state;
const deployUrl =
  status.environment_url || status.target_url || status.log_url || '';
const deploymentId = deployment.id;

if (!sha || !isFinalDeploymentState(state)) {
  console.log('Ignoring non-final deployment state.');
  process.exit(0);
}

const [owner, name] = repo.split('/');
const headers = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
  'content-type': 'application/json',
};

async function gh(method, endpoint, body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${method} ${endpoint} -> ${response.status}: ${data?.message || response.statusText}`,
    );
  }
  return data;
}

async function ghAll(endpoint) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const items = [];
  for (let page = 1; page <= 1000; page += 1) {
    const batch = await gh(
      'GET',
      `${endpoint}${separator}per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error(`Expected paginated array from ${endpoint}.`);
    }
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

const mainRef = await gh(
  'GET',
  `/repos/${owner}/${name}/git/ref/heads/main`,
);
const compare = await gh(
  'GET',
  `/repos/${owner}/${name}/compare/${sha}...${mainRef.object.sha}`,
).catch(() => null);

if (
  mainRef.object.sha !== sha &&
  !['ahead', 'identical'].includes(compare?.status)
) {
  console.error('Unable to prove Production SHA belongs to main history.');
  process.exit(4);
}

if (shouldOpenProductionBlocker(state)) {
  const title = `[BUG] Production deployment failed — ${sha.slice(0, 7)}`;
  const query = encodeURIComponent(
    `repo:${repo} is:issue is:open in:title "${title}"`,
  );
  const found = await gh('GET', `/search/issues?q=${query}`);
  const body = [
    `SHA: ${sha}`,
    '',
    `Workflow run: https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    '',
    `GitHub deployment ID: ${deploymentId}`,
    '',
    `Vercel Production URL: ${deployUrl || 'non fournie'}`,
    '',
    `Deployment status: ${state}`,
    '',
    'Creator: vercel[bot]',
  ].join('\n');

  if (found.items?.[0]) {
    await gh(
      'PATCH',
      `/repos/${owner}/${name}/issues/${found.items[0].number}`,
      { body },
    );
  } else {
    await gh('POST', `/repos/${owner}/${name}/issues`, {
      title,
      body,
      labels: [
        'type:bug',
        'priority:P1',
        'delivery-impact:high',
        'area:infra-ci',
        'status:blocked',
      ],
    });
  }

  console.error(
    'Production failed; successful Release intentionally blocked.',
  );
  process.exit(5);
}

const [releases, productionRefs] = await Promise.all([
  ghAll(`/repos/${owner}/${name}/releases`),
  ghAll(`/repos/${owner}/${name}/git/matching-refs/tags/prod-`).catch(
    () => [],
  ),
]);

const existingTagForSha = findProductionTagForSha(productionRefs, sha);
const hasReleaseForSha = hasReleaseForTag(releases, existingTagForSha);

if (!shouldCreateSuccessfulRelease({ state, hasReleaseForSha })) {
  console.log(`Release already exists for ${sha}; idempotent exit.`);
  process.exit(0);
}

const tag =
  existingTagForSha ||
  buildProductionTag(
    deployment.created_at || status.created_at || new Date().toISOString(),
    sha,
  );

if (!existingTagForSha) {
  await gh('POST', `/repos/${owner}/${name}/git/refs`, {
    ref: `refs/tags/${tag}`,
    sha,
  });
}

const prs = await gh(
  'GET',
  `/repos/${owner}/${name}/commits/${sha}/pulls`,
);
const prLines = (prs || []).map((pr) => `- #${pr.number} ${pr.title}`);
const issues = [];
for (const pr of prs || []) {
  for (const match of String(pr.body || '').matchAll(
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
  )) {
    issues.push(`#${match[1]}`);
  }
}

let ci = 'non déterminé';
if (prs?.[0]?.head?.sha) {
  const runs = await gh(
    'GET',
    `/repos/${owner}/${name}/actions/runs?head_sha=${prs[0].head.sha}&event=pull_request&per_page=30`,
  ).catch(() => null);
  const run = runs?.workflow_runs?.find(
    (candidate) => candidate.name === 'Quality gates',
  );
  if (run?.html_url) ci = run.html_url;
}

const milestones = [
  ...new Set((prs || []).map((pr) => pr.milestone?.title).filter(Boolean)),
];
const previous =
  releases.find((release) => release.tag_name?.startsWith('prod-'))
    ?.tag_name || 'aucune Release Production précédente';
const now = new Date();
const note = [
  '# DTSC Platform Production Delivery',
  '',
  `Date/heure: ${now.toISOString()}`,
  `SHA: ${sha}`,
  'PR(s) incluse(s):',
  ...(prLines.length ? prLines : ['- aucune PR résolue automatiquement']),
  `Issues fermées: ${[...new Set(issues)].join(', ') || 'aucune détectée'}`,
  `Milestone: ${milestones.join(', ') || 'non déterminé'}`,
  `CI run: ${ci}`,
  `GitHub deployment: #${deploymentId}`,
  `Vercel Production deployment: ${deployUrl || 'URL non fournie'}`,
  `Deployment URL: ${deployUrl || 'URL non fournie'}`,
  '',
  '## Changes',
  ...(prLines.length ? prLines : ['- Livraison infrastructure/maintenance']),
  '',
  '## Bug fixes',
  '- Voir les PR et Issues liées.',
  '',
  '## Migrations',
  '- Voir la section Base de données / Prisma des PR incluses.',
  '',
  '## Known issues',
  '- Voir les blockers/P0/P1 GitHub ouverts à la date de cette Release.',
  '',
  '## Rollback reference',
  `- Release précédente: ${previous}`,
].join('\n');

await gh('POST', `/repos/${owner}/${name}/releases`, {
  tag_name: tag,
  target_commitish: sha,
  name: `DTSC Production ${tag}`,
  body: note,
  draft: false,
  prerelease: false,
  generate_release_notes: true,
});

console.log(
  `Created immutable Production Release ${tag} for deployment ${deploymentId}.`,
);
