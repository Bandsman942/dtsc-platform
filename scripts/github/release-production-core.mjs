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

/**
 * A Production version is a stable SemVer release (no pre-release/build metadata).
 * Historical prod-* delivery tags remain readable, but new releases use vX.Y.Z.
 */
export const PRODUCTION_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseProductionVersion(version) {
  if (!PRODUCTION_SEMVER_PATTERN.test(String(version || ''))) {
    throw new Error('Production version must be stable SemVer MAJOR.MINOR.PATCH.');
  }
  const parts = String(version).split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error('Production version exceeds the safe integer range.');
  }
  return parts;
}

export function buildSemanticTag(version) {
  parseProductionVersion(version);
  return `v${version}`;
}

export function compareProductionVersions(left, right) {
  const a = parseProductionVersion(left);
  const b = parseProductionVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}

export function classifyVersionBump(previous, next) {
  const [oldMajor, oldMinor, oldPatch] = parseProductionVersion(previous);
  const [major, minor, patch] = parseProductionVersion(next);
  if (major === oldMajor + 1 && minor === 0 && patch === 0) return 'major';
  if (major === oldMajor && minor === oldMinor + 1 && patch === 0) return 'minor';
  if (major === oldMajor && minor === oldMinor && patch === oldPatch + 1) return 'patch';
  throw new Error(`Expected one strict SemVer increment from ${previous}, received ${next}.`);
}

export function findSemanticTagForSha(refs, sha) {
  const ref = (refs || []).find(
    (candidate) =>
      /^refs\/tags\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(candidate?.ref || '') &&
      candidate?.object?.sha === sha,
  );
  return ref?.ref?.replace('refs/tags/', '') || null;
}
