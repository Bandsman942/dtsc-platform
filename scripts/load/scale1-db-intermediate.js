import http from "k6/http";
import { check, sleep } from "k6";

const rawBaseUrl = __ENV.BASE_URL;
const sessionCookie = __ENV.SESSION_COOKIE;
const vercelAutomationBypassSecret = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET;
const targetVus = Number.parseInt(__ENV.TARGET_VUS || "500", 10);

if (!rawBaseUrl) throw new Error("BASE_URL is required");
if (!sessionCookie) throw new Error("SESSION_COOKIE is required for SCALE-1B authenticated load evidence");
if (!vercelAutomationBypassSecret) {
  throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required for SCALE-1B Production automation");
}
if (![100, 250, 500].includes(targetVus)) {
  throw new Error("TARGET_VUS must be one of 100, 250 or 500 for SCALE-1B");
}

const baseUrl = rawBaseUrl.replace(/\/+$/, "");
if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://127.0.0.1") && !baseUrl.startsWith("http://localhost")) {
  throw new Error("BASE_URL must use HTTPS outside local execution");
}

function stagesFor(target) {
  if (target === 100) {
    return [
      { duration: "30s", target: 50 },
      { duration: "1m", target: 100 },
      { duration: "2m", target: 100 },
      { duration: "30s", target: 0 },
    ];
  }

  if (target === 250) {
    return [
      { duration: "30s", target: 50 },
      { duration: "1m", target: 100 },
      { duration: "1m", target: 250 },
      { duration: "2m", target: 250 },
      { duration: "30s", target: 0 },
    ];
  }

  return [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "1m", target: 250 },
    { duration: "1m", target: 500 },
    { duration: "3m", target: 500 },
    { duration: "1m", target: 0 },
  ];
}

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)", "count"],
  scenarios: {
    scale1_db_intermediate: {
      executor: "ramping-vus",
      startVUs: 0,
      gracefulRampDown: "30s",
      stages: stagesFor(targetVus),
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
    "http_req_duration{workload:dashboard-read}": ["p(95)<1000", "p(99)<2000"],
    "http_req_duration{workload:notifications-read}": ["p(95)<1000", "p(99)<2000"],
    checks: ["rate>0.99"],
  },
};

const headers = {
  Cookie: sessionCookie,
  "User-Agent": "DTSC-SCALE1B/1.0",
  "x-vercel-protection-bypass": vercelAutomationBypassSecret,
};

export function setup() {
  const preflight = http.get(`${baseUrl}/api/notifications/unread-count`, {
    headers,
    redirects: 0,
    tags: { workload: "preflight-authenticated-read" },
  });

  if (preflight.status !== 200) {
    throw new Error(`Authenticated preflight failed with status ${preflight.status}`);
  }

  return { targetVus };
}

export default function () {
  const isDashboardRead = __ITER % 2 === 0;
  const path = isDashboardRead ? "/dashboard" : "/api/notifications/unread-count";
  const workload = isDashboardRead ? "dashboard-read" : "notifications-read";

  const response = http.get(`${baseUrl}${path}`, {
    headers,
    redirects: 0,
    tags: { workload },
  });

  check(response, {
    [`${workload} returns 200`]: (result) => result.status === 200,
  });

  // Model active users rather than synthetic tight-loop traffic. SCALE-7 owns
  // the higher 1k/2.5k/5k stages and more aggressive mixed workloads.
  sleep(4 + Math.random() * 4);
}

export function handleSummary(data) {
  return {
    "artifacts/k6-summary.json": JSON.stringify(data, null, 2),
  };
}
