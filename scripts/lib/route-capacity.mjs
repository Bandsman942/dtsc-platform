function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid route count: ${name}`);
  return value;
}

export function sourceRouteCapacity({ baseline, current, maxSourceFiles, minimumFreed }) {
  for (const [name, value] of Object.entries({ baseline, current, maxSourceFiles, minimumFreed })) count(value, name);
  const effectiveCeiling = Math.min(maxSourceFiles, baseline - minimumFreed);
  return { configuredCeiling: maxSourceFiles, minimumFreed, effectiveCeiling, remainingSourceFiles: effectiveCeiling - current };
}

export function vercelBuildCapacity(rules, limit) {
  count(limit, "limit");
  if (rules === null) return { rules: null, limit, remainingRules: null, evidence: "UNVERIFIED" };
  count(rules, "rules");
  return { rules, limit, remainingRules: limit - rules, evidence: "VERCEL_OUTPUT_CONFIG" };
}
