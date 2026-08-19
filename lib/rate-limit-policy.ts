export type RateLimitFailureMode = "local" | "open" | "closed";

export type RateLimitPolicyName =
  | "security-critical"
  | "cost-critical"
  | "availability-balanced"
  | "availability-first"
  | "explicit-override";

export type RateLimitPolicy = {
  name: RateLimitPolicyName;
  failureMode: RateLimitFailureMode;
};

export const RATE_LIMIT_POLICY_PROFILES = {
  securityCritical: { name: "security-critical", failureMode: "closed" },
  costCritical: { name: "cost-critical", failureMode: "closed" },
  availabilityBalanced: { name: "availability-balanced", failureMode: "local" },
  availabilityFirst: { name: "availability-first", failureMode: "open" },
} as const satisfies Record<string, RateLimitPolicy>;

type RateLimitPolicyRule = {
  prefix: string;
  profile: Exclude<RateLimitPolicyName, "explicit-override">;
  rationale: string;
};

export const RATE_LIMIT_POLICY_RULES: readonly RateLimitPolicyRule[] = [
  { prefix: "auth:sign-in:", profile: "security-critical", rationale: "credential brute-force protection" },
  { prefix: "auth:sign-up:", profile: "security-critical", rationale: "account and OTP abuse protection" },
  { prefix: "auth:forgot-password:", profile: "security-critical", rationale: "password recovery abuse protection" },
  { prefix: "auth:reset-password:", profile: "security-critical", rationale: "password reset mutation protection" },
  { prefix: "enterprise-identity-", profile: "security-critical", rationale: "identity-link mutation protection" },
  { prefix: "mcp-oauth-", profile: "security-critical", rationale: "OAuth connection mutation protection" },
  { prefix: "billing-checkout:", profile: "security-critical", rationale: "payment initiation protection" },
  { prefix: "public:contact:", profile: "security-critical", rationale: "public persistence and outbound mail abuse protection" },
  { prefix: "public:newsletter:", profile: "security-critical", rationale: "public persistence and outbound mail abuse protection" },
  { prefix: "ai-tool-confirm:", profile: "security-critical", rationale: "confirmed AI tool mutation execution protection" },
  { prefix: "ai-tool-cancel:", profile: "security-critical", rationale: "AI confirmation state mutation protection" },
  { prefix: "chat:", profile: "cost-critical", rationale: "model-provider spend protection" },
  { prefix: "chat-v2:", profile: "cost-critical", rationale: "model-provider spend protection" },
  { prefix: "chat-agent:", profile: "cost-critical", rationale: "agent/model-provider spend protection" },
  { prefix: "public:dtsc-agent:", profile: "cost-critical", rationale: "unauthenticated model-provider spend protection" },
  { prefix: "enterprise-ai-chat:", profile: "cost-critical", rationale: "enterprise model-provider spend protection" },
  { prefix: "enterprise-ai-agent:", profile: "cost-critical", rationale: "enterprise agent/model-provider spend protection" },
  { prefix: "collaborators-ai-compose:", profile: "cost-critical", rationale: "collaboration model-provider spend protection" },
  { prefix: "collaborators-agent:", profile: "cost-critical", rationale: "collaboration agent/model-provider spend protection" },
  { prefix: "ai-mcp:", profile: "cost-critical", rationale: "remote MCP execution and provider spend protection" },
] as const;

function profileByName(name: Exclude<RateLimitPolicyName, "explicit-override">): RateLimitPolicy {
  if (name === "security-critical") return RATE_LIMIT_POLICY_PROFILES.securityCritical;
  if (name === "cost-critical") return RATE_LIMIT_POLICY_PROFILES.costCritical;
  if (name === "availability-first") return RATE_LIMIT_POLICY_PROFILES.availabilityFirst;
  return RATE_LIMIT_POLICY_PROFILES.availabilityBalanced;
}

export function resolveRateLimitPolicy(
  logicalKey: string,
  explicitFailureMode?: RateLimitFailureMode
): RateLimitPolicy {
  if (explicitFailureMode) {
    return { name: "explicit-override", failureMode: explicitFailureMode };
  }

  const rule = RATE_LIMIT_POLICY_RULES.find((candidate) => logicalKey.startsWith(candidate.prefix));
  if (!rule) return RATE_LIMIT_POLICY_PROFILES.availabilityBalanced;
  return profileByName(rule.profile);
}
