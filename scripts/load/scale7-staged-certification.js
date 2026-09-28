import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const rawBaseUrl = __ENV.BASE_URL;
const rawContexts = __ENV.SCALE7_AUTH_CONTEXTS_JSON;
const bypassSecret = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET;
const targetVus = Number.parseInt(__ENV.TARGET_VUS || "500", 10);
const profile = (__ENV.LOAD_PROFILE || "ramp").toLowerCase();

if (!rawBaseUrl) throw new Error("BASE_URL is required");
if (!rawContexts) throw new Error("SCALE7_AUTH_CONTEXTS_JSON is required");
if (!bypassSecret) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required");
if (![500, 1000, 2500, 5000].includes(targetVus)) throw new Error("TARGET_VUS must be one of 500, 1000, 2500 or 5000");
if (!["ramp", "soak", "spike"].includes(profile)) throw new Error("LOAD_PROFILE must be ramp, soak or spike");

const baseUrl = rawBaseUrl.replace(/\/+$/, "");
if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://127.0.0.1") && !baseUrl.startsWith("http://localhost")) {
  throw new Error("BASE_URL must use HTTPS outside local execution");
}

let contexts;
try {
  contexts = JSON.parse(rawContexts);
} catch {
  throw new Error("SCALE7_AUTH_CONTEXTS_JSON must be valid JSON");
}

if (!Array.isArray(contexts) || contexts.length < 2) {
  throw new Error("SCALE7_AUTH_CONTEXTS_JSON must contain at least two tenant contexts");
}

for (const [index, context] of contexts.entries()) {
  for (const key of ["sessionCookie", "organizationId", "enterpriseReadPath", "shopReadPath", "collaborationReadPath", "aiPath", "isolationProbePath"]) {
    if (!context?.[key] || typeof context[key] !== "string") {
      throw new Error(`Context ${index} is missing required field ${key}`);
    }
  }
  if (!context.aiPayload || typeof context.aiPayload !== "object") {
    throw new Error(`Context ${index} is missing aiPayload`);
  }
}

if (new Set(contexts.map((context) => context.organizationId)).size < 2) {
  throw new Error("SCALE-7 requires at least two distinct organizations");
}

const tenantIsolationPass = new Rate("tenant_isolation_pass");

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

const stages = profile === "soak" ? soakStages(targetVus) : profile === "spike" ? spikeStages(targetVus) : rampStages(targetVus);

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

function headersFor(context, json = false) {
  return {
    Cookie: context.sessionCookie,
    "User-Agent": `DTSC-SCALE7/${targetVus}-${profile}`,
    "x-vercel-protection-bypass": bypassSecret,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function currentContext() {
  return contexts[(__VU - 1) % contexts.length];
}

export function setup() {
  for (const context of contexts) {
    const preflight = http.get(`${baseUrl}/api/notifications/unread-count`, {
      headers: headersFor(context),
      redirects: 0,
      tags: { workload: "preflight-authenticated-read" },
    });
    if (preflight.status !== 200) {
      throw new Error(`Authenticated preflight failed with status ${preflight.status}`);
    }

    const isolation = http.get(`${baseUrl}${context.isolationProbePath}`, {
      headers: headersFor(context),
      redirects: 0,
      tags: { workload: "tenant-isolation" },
    });
    const isolated = isolation.status === 403 || isolation.status === 404;
    tenantIsolationPass.add(isolated);
    if (!isolated) throw new Error(`Tenant isolation preflight failed with status ${isolation.status}`);
  }
  return { targetVus, profile };
}

export default function () {
  const context = currentContext();

  if (__ITER % 20 === 0) {
    const isolation = http.get(`${baseUrl}${context.isolationProbePath}`, {
      headers: headersFor(context),
      redirects: 0,
      tags: { workload: "tenant-isolation" },
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
    response = http.get(`${baseUrl}/dashboard`, { headers: headersFor(context), redirects: 0, tags: { workload: label } });
  } else if (draw < 0.48) {
    label = "notifications-read";
    response = http.get(`${baseUrl}/api/notifications/unread-count`, { headers: headersFor(context), redirects: 0, tags: { workload: label } });
  } else if (draw < 0.68) {
    label = "enterprise-read";
    response = http.get(`${baseUrl}${context.enterpriseReadPath}`, { headers: headersFor(context), redirects: 0, tags: { workload: label } });
  } else if (draw < 0.84) {
    label = "shop-read";
    response = http.get(`${baseUrl}${context.shopReadPath}`, { headers: headersFor(context), redirects: 0, tags: { workload: label } });
  } else if (draw < 0.97) {
    label = "collaboration-read";
    response = http.get(`${baseUrl}${context.collaborationReadPath}`, { headers: headersFor(context), redirects: 0, tags: { workload: label } });
  } else {
    label = "ai-request";
    response = http.post(`${baseUrl}${context.aiPath}`, JSON.stringify(context.aiPayload), {
      headers: headersFor(context, true),
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
