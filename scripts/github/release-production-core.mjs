export function isProductionDeployment(event) {
  const deployment = event?.deployment;
  const status = event?.deployment_status;
  if (!deployment || !status) return false;
  const environment = deployment.environment || status.environment;
  return environment === 'Production' && deployment.creator?.login === 'vercel[bot]';
}

export function isFinalDeploymentState(state) {
  return ['success', 'failure', 'error'].includes(state);
}

export function shouldCreateSuccessfulRelease({ state, hasReleaseForSha }) {
  return state === 'success' && !hasReleaseForSha;
}

export function shouldOpenProductionBlocker(state) {
  return state === 'failure' || state === 'error';
}

export function buildProductionTag(createdAt, sha) {
  const stamp = new Date(createdAt);
  if (Number.isNaN(stamp.getTime())) {
    throw new Error('A valid deployment timestamp is required for the Production tag.');
  }
  if (!/^[0-9a-f]{7,40}$/i.test(String(sha || ''))) {
    throw new Error('A valid Git SHA is required for the Production tag.');
  }
  const pad = (value) => String(value).padStart(2, '0');
  return `prod-${stamp.getUTCFullYear()}${pad(stamp.getUTCMonth() + 1)}${pad(stamp.getUTCDate())}-${pad(stamp.getUTCHours())}${pad(stamp.getUTCMinutes())}-${sha.slice(0, 7)}`;
}

export function findProductionTagForSha(refs, sha) {
  const ref = (refs || []).find(
    (candidate) =>
      candidate?.ref?.startsWith('refs/tags/prod-') &&
      candidate?.object?.sha === sha,
  );
  return ref?.ref?.replace('refs/tags/', '') || null;
}

export function hasReleaseForTag(releases, tag) {
  if (!tag) return false;
  return (releases || []).some((release) => release?.tag_name === tag);
}
