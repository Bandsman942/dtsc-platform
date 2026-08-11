export function hasRequiredMcpOAuthScopes(grantedScopes: Iterable<string>, requiredScopes: readonly string[] | undefined) {
  const required = requiredScopes || [];
  if (!required.length) return true;
  const granted = new Set(grantedScopes);
  return required.every((scope) => granted.has(scope));
}
