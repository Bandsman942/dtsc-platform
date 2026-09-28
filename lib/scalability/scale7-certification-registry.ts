import registry from "@/data/scalability/scale7-certifications.json";

export type Scale7CertificationStatus = "PASS" | "FAIL";
export type Scale7CertificationProfile = "ramp" | "soak" | "spike";

export type Scale7CertificationRecord = {
  targetVus: 500 | 1000 | 2500 | 5000;
  profile: Scale7CertificationProfile;
  status: Scale7CertificationStatus;
  testedAt: string;
  durationSeconds: number | null;
  requestsPerSecond: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  errorRate: number | null;
  tenantIsolationRate: number | null;
  dbConnectionUtilization: number | null;
  redisStatuses: string[];
  aiActiveAttempts: number | null;
  aiThrottledAttempts: number | null;
  githubRunId: string | null;
  gitSha: string | null;
  evidenceRef: string;
};

const TARGETS = [500, 1000, 2500, 5000] as const;
const PROFILES = ["ramp", "soak", "spike"] as const;

function isRecord(value: unknown): value is Scale7CertificationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Scale7CertificationRecord>;
  return TARGETS.includes(record.targetVus as (typeof TARGETS)[number]) &&
    PROFILES.includes(record.profile as (typeof PROFILES)[number]) &&
    (record.status === "PASS" || record.status === "FAIL") &&
    typeof record.testedAt === "string" &&
    typeof record.evidenceRef === "string" &&
    Array.isArray(record.redisStatuses);
}

export function getScale7CertificationSnapshot() {
  const rawRecords: unknown[] = Array.isArray(registry.records) ? registry.records as unknown[] : [];
  const records = rawRecords.filter(isRecord);
  const stages = TARGETS.map((targetVus) => {
    const stageRecords = records
      .filter((record) => record.targetVus === targetVus)
      .sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt));
    const latestByProfile = Object.fromEntries(
      PROFILES.map((profile) => [profile, stageRecords.find((record) => record.profile === profile) ?? null]),
    ) as Record<Scale7CertificationProfile, Scale7CertificationRecord | null>;
    const required = PROFILES.map((profile) => latestByProfile[profile]);
    const fullyCertified = required.every((record) => record?.status === "PASS");
    const hasFailure = required.some((record) => record?.status === "FAIL");
    return {
      targetVus,
      status: fullyCertified ? "PASS" as const : hasFailure ? "FAIL" as const : "NOT_EXECUTED" as const,
      latestByProfile,
    };
  });
  return {
    source: "Versioned, secret-free SCALE-7 certification registry",
    requiredProfiles: PROFILES,
    stages,
    recordsCount: records.length,
  };
}
