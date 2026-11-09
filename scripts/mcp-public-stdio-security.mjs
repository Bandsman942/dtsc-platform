import dns from "node:dns/promises";
import net from "node:net";

const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata", "instance-data", "169.254.169.254", "100.100.100.200"]);

function ipv4Private(value) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19) ||
    a === 192 && b === 0 || a === 192 && b === 0 && parts[2] === 2 ||
    a === 192 && b === 0 && parts[2] === 0 || a === 198 && b === 51 && parts[2] === 100 ||
    a === 203 && b === 0 && parts[2] === 113 || a === 255;
}

export function isPublicIp(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (net.isIP(ip) === 4) return !ipv4Private(ip);
  if (net.isIP(ip) === 6) {
    if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") ||
      ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb") ||
      ip.startsWith("ff") || ip.startsWith("2001:db8:")) return false;
    const mapped = ip.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return !ipv4Private(mapped[1]);
    // IPv4-compatible encodings must never bypass private-address checks.
    if (/^::(?:\d+\.\d+\.\d+\.\d+)$/.test(ip)) return false;
    return true;
  }
  return false;
}

export async function assertPublicFetchUrl(raw, lookup = dns.lookup) {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("MCP_FETCH_URL_INVALID");
  let url;
  try { url = new URL(raw); } catch { throw new Error("MCP_FETCH_URL_INVALID"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.hash || !url.hostname || (url.port && !["80","443"].includes(url.port))) throw new Error("MCP_FETCH_URL_INVALID");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (LOCAL_NAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || host.endsWith(".home") || host.endsWith(".lan") || host.endsWith(".test") ||
    host.endsWith(".invalid")) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
  if (net.isIP(host)) {
    if (!isPublicIp(host)) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
  } else {
    if (/^\d+(?:\.\d+){0,3}$/.test(host) || host.includes("%") || host.includes("@")) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
    let addresses;
    try { addresses = await lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error("MCP_FETCH_DNS_UNAVAILABLE"); }
    if (!Array.isArray(addresses) || !addresses.length || addresses.some((item) => !isPublicIp(item.address))) {
      throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
    }
  }
  return url.toString();
}
