export const BRANCH_PATTERN = /^(feat|fix|refactor|chore|docs|security)\/\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PR_TITLE_PATTERN = /^(feat|fix|refactor|chore|docs|test|ci|security)(\([a-z0-9-]+\))?: .{3,}$/;
export const COMMIT_PATTERN = /^(feat|fix|refactor|chore|docs|test|ci|security)(\([a-z0-9-]+\))?: .{3,}$/;
export const BOT_BRANCHES = [/^dependabot\//, /^renovate\//];
export const MATERIAL_IMPACTS = new Set(['delivery-impact:high', 'delivery-impact:medium']);
export const ESSENTIAL_PREFIXES = ['type:', 'priority:', 'area:', 'delivery-impact:'];
export function isValidBranch(name) { return name === 'main' || BRANCH_PATTERN.test(name) || BOT_BRANCHES.some((p) => p.test(name)); }
export function isValidTitle(title) { return PR_TITLE_PATTERN.test(String(title || '').trim()); }
export function isValidCommit(subject, author = '') {
  if (/^(Merge |Revert \"|Initial commit)/.test(subject)) return true;
  if (/\[bot\]$/i.test(author)) return true;
  return COMMIT_PATTERN.test(String(subject || '').trim());
}
export function extractLinkedIssue(body) {
  const match = String(body || '').match(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i);
  return match ? Number(match[1]) : null;
}
export function missingEssentialLabels(labels) {
  const names = labels.map((x) => typeof x === 'string' ? x : x.name);
  return ESSENTIAL_PREFIXES.filter((prefix) => !names.some((name) => name.startsWith(prefix)));
}
