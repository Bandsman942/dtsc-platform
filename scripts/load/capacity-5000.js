import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL;
const sessionCookie = __ENV.SESSION_COOKIE;

if (!baseUrl) throw new Error("BASE_URL is required");

export const options = {
  stages: [
    { duration: "2m", target: 100 },
    { duration: "3m", target: 500 },
    { duration: "5m", target: 1000 },
    { duration: "5m", target: 2500 },
    { duration: "10m", target: 5000 },
    { duration: "3m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
    checks: ["rate>0.99"],
  },
};

function headers() {
  return sessionCookie ? { Cookie: sessionCookie } : {};
}

export default function () {
  const dashboard = http.get(`${baseUrl}/dashboard`, {
    headers: headers(),
    redirects: 0,
    tags: { workload: "dashboard-read" },
  });

  check(dashboard, {
    "dashboard path is reachable": (response) => [200, 307, 401].includes(response.status),
  });

  const unreadCount = http.get(`${baseUrl}/api/notifications/unread-count`, {
    headers: headers(),
    redirects: 0,
    tags: { workload: "notifications-read" },
  });

  check(unreadCount, {
    "notification path is bounded": (response) => [200, 307, 401].includes(response.status),
  });

  sleep(1 + Math.random() * 2);
}
