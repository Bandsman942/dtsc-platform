import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const rawBaseUrl = __ENV.BASE_URL;
const rawAuthPool = __ENV.SCALE7_AUTH_CONTEXTS_JSON;
const bypassSecret = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET;
const targetVus = Number.parseInt(__ENV.TARGET_VUS || "500", 10);
const profile = (__ENV.LOAD_PROFILE || "ramp").toLowerCase();

if (!rawBaseUrl) throw new Error("BASE_URL is required");
if (!rawAuthPool) throw new Error("SCALE7_AUTH_CONTEXTS_JSON is required");
if (!bypassSecret) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required");
if (![500, 1000, 2500, 5000].includes(targetVus)) {
  throw new Error("TARGET_VUS must be one of 500, 1000, 2500 or 5000");
}
if (!["ramp", "soak", "spike"].includes(profile)) {
  throw new Error("LOAD_PROFILE must be ramp, soak or spike");
}

const baseUrl = rawBaseUrl.replace(/\/+$/, "");
if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://127.0.0.1") && !baseUrl.startsWith("http://localhost")) {
  throw new Error("BASE_URL must use HTTPS outside local execution");
}

let authPool;
try {
  authPool = JSON.parse(rawAuthPool);
} catch {
  throw new Error("SCALE7_AUTH_CONTEXTS_JSON must be valid JSON");
}

if (!authPool || typeof authPool !== "object" || !Array.isArray(authPool.tenants)) {
  throw new Error("SCALE7_AUTH_CONTEXTS_JSON must contain a tenants array");
}

const tenants = authPool.tenants;
if (tenants.length < 2) throw new Error("SCALE-7 requires at least two tenant contexts");

for (const [index, tenant] of tenants.entries()) {
  for (const key of ["organizationId", "enterpriseReadPath", "shopReadPath", "collaborationReadPath", "isolationProbePath"]) {
    if (!tenant?.[key] || typeof tenant[key] !== "string") {
      throw new Error(`Tenant ${index} is missing required field ${key}`);
    }
  }
  if (!Array.isArray(tenant.sessionCookies) || tenant.sessionCookies.length === 0) {
    throw new Error(`Tenant ${index} must provide sessionCookies`);
  }
}

if (new Set(tenants.map((tenant) => tenant.organizationId)).size !== tenants.length) {
  throw new Error("SCALE-7 tenant organizationId values must be unique");
}

const identities = tenants.flatMap((tenant, tenantIndex) =>
  tenant.sessionCookies.map((sessionCookie, identityIndex) => ({
    tenantIndex,
    identityIndex,
    sessionCookie,
    tenant,
  })),
);

const minimumIdentityCount = Math.max(8, Math.ceil(targetVus / 100));
if (identities.length < minimumIdentityCount) {
  throw new Error(`SCALE-7 ${targetVus} VU requires at least ${minimumIdentityCount} authenticated identities`);
}
if (new Set(identities.map((identity) => identity.sessionCookie)).size !== identities.length) {
  throw new Error("SCALE-7 session cookies must be unique per load identity");
}

const aiPath = typeof authPool.aiPath === "string" ? authPool.aiPath : null;
const aiPayload = authPool.aiPayload && typeof authPool.aiPayload === "object" ? authPool.aiPayload : null;
if (!aiPath || !aiPayload) {
  throw new Error("SCALE-7 requires aiPath and aiPayload for the representative AI workload");
}

const tenantIsolationPass = new Rate("tenant_isolation_pass");
const expectedIsolationStatuses = http.expectedStatuses(403, 404);

function rampStages(target) {
  const quarter = Math.max(50, Math.round(target * 0.25));
  const half = Math.max(100, Math.round(target * 0.5));
  return [
    { duration: "1m", target: quarter },
    { duration: "2m", target: half },
    { duration: "2m", target },
    { duration: target >= 2500 ? "8m" : "5m", target },
    { duration: "2m", target: 0 },
  ];
}

function soakStages(target) {
  return [
    { duration: "2m", target: Math.max(100, Math.round(target * 0.5)) },
    { duration: "3m", target },
    { duration: target >= 2500 ? "20m" : "15m", target },
    { duration: "3m", target: 0 },
  ];
}

function spikeStages(target) {
  return [
    { duration: "1m", target: Math.max(50, Math.round(target * 0.2)) },
    { duration: "30s", target },
    { duration: "2m", target },
    { duration: "30s", target: Math.max(50, Math.round(target * 0.2)) },
    { duration: "30s", target },
    { duration: "2m", target },
    { duration: "2m", target: 0 },
  ];
}

const stages = profile === "soak"
  ? soakStages(targetVus)
  : profile === "spike"
    ? spikeStages(targetVus)
    : rampStages(targetVus);

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)", "count"],
  scenarios: {
    scale7_certification: {
      executor: "ramping-vus",
      startVUs: 0,
      gracefulRampDown: "30s",
      stages,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
    checks: ["rate>0.99"],
    tenant_isolation_pass: ["rate==1"],
    "http_req_duration{workload:dashboard-read}": ["p(95)<1000", "p(99)<2000"],
    "http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"],
    "http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"],
    "http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"],
  },
};

function headersFor(identity, json = false) {
  return {
    Cookie: identity.sessionCookie,
    Origin: baseUrl,
    "User-Agent": `DTSC-SCALE7/${targetVus}-${profile}`,
    "x-vercel-protection-bypass": bypassSecret,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function currentIdentity() {
  return identities[(__VU - 1) % identities.length];
}

export function setup() {
  for (const identity of identities) {
    const preflight = http.get(`${baseUrl}/api/notifications/unread-count`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: "preflight-authenticated-read" },
    });
    if (preflight.status !== 200) {
      throw new Error(`Authenticated preflight failed with status ${preflight.status}`);
    }

    const ownTenant = http.get(`${baseUrl}${identity.tenant.enterpriseReadPath}`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: "preflight-own-tenant" },
    });
    if (ownTenant.status < 200 || ownTenant.status >= 300) {
      throw new Error(`Own-tenant preflight failed with status ${ownTenant.status}`);
    }
  }

  for (const tenant of tenants) {
    const identity = identities.find((candidate) => candidate.tenant.organizationId === tenant.organizationId);
    const isolation = http.get(`${baseUrl}${tenant.isolationProbePath}`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: "tenant-isolation" },
      responseCallback: expectedIsolationStatuses,
    });
    const isolated = isolation.status === 403 || isolation.status === 404;
    tenantIsolationPass.add(isolated);
    if (!isolated) {
      throw new Error(`Tenant isolation preflight failed with status ${isolation.status}`);
    }
  }

  return {
    targetVus,
    profile,
    identityCount: identities.length,
    tenantCount: tenants.length,
  };
}

export default function () {
  const identity = currentIdentity();
  const tenant = identity.tenant;

  if (__ITER % 40 === 0) {
    const isolation = http.get(`${baseUrl}${tenant.isolationProbePath}`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: "tenant-isolation" },
      responseCallback: expectedIsolationStatuses,
    });
    const isolated = isolation.status === 403 || isolation.status === 404;
    tenantIsolationPass.add(isolated);
    check(isolation, { "cross-tenant probe stays forbidden": () => isolated });
  }

  const draw = Math.random();
  let response;
  let label;

  if (draw < 0.30) {
    label = "dashboard-read";
    response = http.get(`${baseUrl}/dashboard`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: label },
    });
  } else if (draw < 0.49) {
    label = "notifications-read";
    response = http.get(`${baseUrl}/api/notifications/unread-count`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: label },
    });
  } else if (draw < 0.70) {
    label = "enterprise-read";
    response = http.get(`${baseUrl}${tenant.enterpriseReadPath}`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: label },
    });
  } else if (draw < 0.86) {
    label = "shop-read";
    response = http.get(`${baseUrl}${tenant.shopReadPath}`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: label },
    });
  } else if (draw < 0.99) {
    label = "collaboration-read";
    response = http.get(`${baseUrl}${tenant.collaborationReadPath}`, {
      headers: headersFor(identity),
      redirects: 0,
      tags: { workload: label },
    });
  } else {
    label = "ai-request";
    response = http.post(`${baseUrl}${aiPath}`, JSON.stringify({ ...aiPayload, organizationId: tenant.organizationId }), {
      headers: headersFor(identity, true),
      redirects: 0,
      tags: { workload: label },
      timeout: "60s",
    });
  }

  check(response, {
    [`${label} succeeds`]: (result) => result.status >= 200 && result.status < 300,
  });

  sleep(4 + Math.random() * 6);
}

export function handleSummary(data) {
  return {
    "artifacts/scale7-k6-summary.json": JSON.stringify(data, null, 2),
  };
}
