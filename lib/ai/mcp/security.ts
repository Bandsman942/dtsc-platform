import { isIP } from "node:net";
import type { McpDataClassification, McpServerDefinition } from "@/lib/ai/mcp/types";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data",
]);

function isBlockedIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function isBlockedIpv6(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export function validateMcpEndpoint(server: McpServerDefinition) {
  let url: URL;
  try {
    url = new URL(server.endpoint);
  } catch {
    return { allowed: false as const, reasonCode: "MCP_ENDPOINT_INVALID" };
  }

  if (url.protocol !== "https:") return { allowed: false as const, reasonCode: "MCP_ENDPOINT_HTTPS_REQUIRED" };
  if (url.username || url.password) return { allowed: false as const, reasonCode: "MCP_ENDPOINT_CREDENTIALS_FORBIDDEN" };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { allowed: false as const, reasonCode: "MCP_ENDPOINT_INTERNAL_HOST_FORBIDDEN" };
  }

  const ipVersion = isIP(host);
  if ((ipVersion === 4 && isBlockedIpv4(host)) || (ipVersion === 6 && isBlockedIpv6(host))) {
    return { allowed: false as const, reasonCode: "MCP_ENDPOINT_PRIVATE_NETWORK_FORBIDDEN" };
  }

  const allowedHosts = server.allowedHosts.map((entry) => entry.toLowerCase().replace(/\.$/, ""));
  if (!allowedHosts.includes(host)) return { allowed: false as const, reasonCode: "MCP_ENDPOINT_HOST_NOT_ALLOWLISTED" };
  return { allowed: true as const, url };
}

export function authorizeMcpDataBoundary(input: { server: McpServerDefinition; classifications: McpDataClassification[] }) {
  const classes = new Set(input.classifications);
  if (classes.has("SECRET")) return { allowed: false as const, reasonCode: "MCP_SECRET_DATA_FORBIDDEN" };
  if (input.server.dataPolicy === "PUBLIC_ONLY" && [...classes].some((value) => value !== "PUBLIC")) {
    return { allowed: false as const, reasonCode: "MCP_SERVER_PUBLIC_ONLY" };
  }
  if (classes.has("SENSITIVE") && input.server.dataPolicy !== "SENSITIVE_CERTIFIED") {
    return { allowed: false as const, reasonCode: "MCP_SENSITIVE_SERVER_NOT_CERTIFIED" };
  }
  return { allowed: true as const };
}
