#!/usr/bin/env node
/**
 * Dedicated, hardened Node 22 MCP stdio bridge. Never deploy on Vercel.
 * Runs behind an HTTPS reverse proxy with egress firewall denying private IPs.
 * Warm-up/certification takes place before HTTP becomes available.
 *
 * Secrets are injected by the host secret manager and NEVER logged.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { assertPublicFetchUrl } from "./mcp-public-stdio-security.mjs";

const HOST = process.env.MCP_BRIDGE_BIND || "127.0.0.1";
const PORT = Number(process.env.MCP_BRIDGE_PORT || 8686);
const TOKEN = process.env.MCP_PUBLIC_BRIDGE_TOKEN || "";
const MAX_REQUEST = 16 * 1024;
const MAX_CALLS = 10;
const TIMEOUT = 15_000;
const tools = {
  "time.get_current_time": { server: "time", remote: "get_current_time" },
  "time.convert_time": { server: "time", remote: "convert_time" },
  "fetch.fetch": { server: "fetch", remote: "fetch" },
  "brave.search_web": { server: "brave", remote: "brave_web_search" },
  "brave.search_news": { server: "brave", remote: "brave_news_search" },
};
const definitions = [
  { code: "time", command: "uvx", args: ["mcp-server-time", "--local-timezone=Africa/Kinshasa"], allowed: ["get_current_time", "convert_time"] },
  { code: "fetch", command: "uvx", args: ["mcp-server-fetch"], allowed: ["fetch"] },
  { code: "brave", command: "npx", args: ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"], allowed: ["brave_web_search", "brave_news_search"] },
];

class StdioClient {
  constructor(definition) {
    this.definition = definition;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = "";
    this.discovered = [];
    this.alive = false;
  }
  start() {
    const d = this.definition;
    const environment = {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      TMPDIR: process.env.TMPDIR || "/tmp",
      NODE_ENV: "production",
      PYTHONIOENCODING: "utf-8",
      TZ: "Africa/Kinshasa",
      ...(d.code === "brave" ? {
        BRAVE_API_KEY: process.env.BRAVE_API_KEY || "",
        ...(process.env.BRAVE_API_KEY_FILE ? { BRAVE_API_KEY_FILE: process.env.BRAVE_API_KEY_FILE } : {}),
        BRAVE_MCP_ENABLED_TOOLS: "brave_web_search brave_news_search",
        BRAVE_MCP_LOG_LEVEL: "error",
        BRAVE_MCP_TRANSPORT: "stdio",
      } : {}),
    };
    const child = spawn(d.command, d.args, { shell: false, env: environment, stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    this.child = child;
    this.alive = true;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      if (this.buffer.length > 2_000_000) { this.close(); return; }
      let end;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end).trim();
        this.buffer = this.buffer.slice(end + 1);
        if (!line || line.length > 600_000) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        const item = this.pending.get(msg.id);
        if (!item) continue;
        this.pending.delete(msg.id);
        clearTimeout(item.timer);
        if (msg.error) item.reject(new Error("MCP_UPSTREAM_ERROR"));
        else item.resolve(msg.result);
      }
    });
    child.on("error", () => this.close());
    child.on("exit", () => this.close());
    child.stdin.on("error", () => this.close());
  }
  close() {
    this.alive = false;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error("MCP_STDIO_UNAVAILABLE")); }
    this.pending.clear();
    if (this.child && !this.child.killed) this.child.kill("SIGKILL");
  }
  request(method, params = {}) {
    if (!this.alive || !this.child?.stdin.writable) return Promise.reject(new Error("MCP_STDIO_UNAVAILABLE"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("MCP_UPSTREAM_TIMEOUT")); }, TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async initialize() {
    this.start();
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "dtsc-public-knowledge-bridge", version: "1.0.0" },
    });
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    const discovered = await this.request("tools/list");
    const names = new Set((discovered?.tools || []).map((tool) => tool.name));
    if (!this.definition.allowed.every((name) => names.has(name))) throw new Error("MCP_CERTIFICATION_TOOLS_MISSING");
    this.discovered = this.definition.allowed.map((name) => ({ name, prefixed: `${this.definition.code}.${name}` }));
  }
}
const clients = new Map();
let ready = false;
const counters = new Map();

function auth(request) {
  const header = request.headers.authorization || "";
  if (TOKEN.length < 32 || !header.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(TOKEN);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function respond(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(data));
}
function audit({ userId, assistant, tool, status, elapsedMs, count }) {
  // Only metadata, never input, output, URL, prompts, password, or API key.
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), userId, assistant, tool, status, durationMs: Math.round(elapsedMs), count }) + "\n");
}
function consumeQuota(userId, turnKey) {
  const now = Date.now();
  const key = `${userId}:${turnKey}`;
  const previous = counters.get(key);
  const item = previous && previous.expires > now ? previous : { count: 0, expires: now + 120_000 };
  item.count++;
  counters.set(key, item);
  if (counters.size > 20_000) for (const [k, v] of counters) if (v.expires <= now) counters.delete(k);
  return item.count <= MAX_CALLS ? item.count : null;
}
function normalizeText(value, max) {
  const content = (value?.content || []).filter((entry) => entry?.type === "text" && typeof entry.text === "string").map((entry) => entry.text).join("\n");
  return content.slice(0, max);
}
function sourceUrls(text) {
  const urls = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return [...new Set(urls)].slice(0, 16).filter((url) => url.length <= 2048);
}
function validBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.userId === "string" && /^[a-zA-Z0-9:_-]{3,140}$/.test(value.userId) &&
    typeof value.assistant === "string" && /^[a-zA-Z0-9:_-]{3,100}$/.test(value.assistant) &&
    typeof value.turnKey === "string" && /^[a-zA-Z0-9:_-]{3,180}$/.test(value.turnKey) &&
    typeof value.tool === "string" && Boolean(tools[value.tool]) &&
    value.args && typeof value.args === "object" && !Array.isArray(value.args);
}
function validToolArgs(body) {
  const { tool, args } = body;
  const keys = Object.keys(args);
  if (tool === "time.get_current_time") {
    if (keys.some((key) => key !== "timezone")) throw new Error("MCP_ARGS_INVALID");
    const timezone = args.timezone || "Africa/Kinshasa";
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
    catch { throw new Error("MCP_TIMEZONE_INVALID"); }
    return { timezone };
  }
  if (tool === "time.convert_time") {
    if (keys.some((key) => !["source_timezone", "target_timezone", "time"].includes(key)) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) throw new Error("MCP_ARGS_INVALID");
    for (const zone of [args.source_timezone, args.target_timezone]) {
      try { new Intl.DateTimeFormat("en", { timeZone: zone }); }
      catch { throw new Error("MCP_TIMEZONE_INVALID"); }
    }
    return args;
  }
  if (tool === "fetch.fetch") {
    if (keys.some((key) => key !== "url") || typeof args.url !== "string") throw new Error("MCP_ARGS_INVALID");
    return args;
  }
  if (keys.some((key) => !["query", "count"].includes(key)) ||
    typeof args.query !== "string" || !args.query.trim() || args.query.length > 400 ||
    args.query.trim().split(/\s+/).length > 50 ||
    (args.count !== undefined && (!Number.isInteger(args.count) || args.count < 1 || args.count > 10))) throw new Error("MCP_ARGS_INVALID");
  return { query: args.query, count: args.count ?? 5 };
}

async function handleCall(body) {
  const spec = tools[body.tool];
  const client = clients.get(spec.server);
  if (!ready || !client?.alive || !client.discovered.some((tool) => tool.name === spec.remote)) throw new Error("MCP_STDIO_UNAVAILABLE");
  const args = validToolArgs(body);
  if (spec.server === "fetch") {
    args.url = await assertPublicFetchUrl(args.url);
    // Request the whole public page up to the configured DTSC cap; the MCP
    // fetch server defaults to much shorter excerpts unless max_length is set.
    args.max_length = 100_000;
    args.start_index = 0;
  }
  const result = await client.request("tools/call", { name: spec.remote, arguments: args });
  if (result?.isError) throw new Error("MCP_UPSTREAM_ERROR");
  const content = normalizeText(result, spec.server === "fetch" ? 100_000 : 160_000);
  return { tool: body.tool, content, sources: sourceUrls(content), untrusted: true };
}

function startHttp() {
  http.createServer(async (request, response) => {
    if (!auth(request)) return respond(response, 401, { error: "MCP_UNAUTHORIZED" });
    if (request.method === "GET" && request.url === "/v1/certification") {
      return respond(response, ready ? 200 : 503, {
        ready,
        servers: definitions.map((d) => ({
          server: d.code, transport: "stdio", command: d.command,
          args: d.args, tools: ready ? clients.get(d.code)?.discovered.map((x) => x.name) || [] : [],
          status: ready ? "LIVE_CERTIFIED" : "UNAVAILABLE",
        })),
      });
    }
    if (request.method !== "POST" || request.url !== "/v1/tool") return respond(response, 404, { error: "NOT_FOUND" });
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > MAX_REQUEST) return respond(response, 413, { error: "MCP_INPUT_TOO_LARGE" });
    }
    let body; try { body = JSON.parse(raw); } catch { return respond(response, 400, { error: "MCP_BAD_JSON" }); }
    if (!validBody(body)) return respond(response, 400, { error: "MCP_INPUT_INVALID" });
    const started = performance.now();
    const quota = consumeQuota(body.userId, body.turnKey);
    if (quota === null) { audit({ userId: body.userId, assistant: body.assistant, tool: body.tool, status: "RATE_LIMITED", elapsedMs: 0, count: 10 }); return respond(response, 429, { error: "MCP_REQUEST_TOOL_LIMIT" }); }
    try {
      const result = await handleCall(body);
      audit({ userId: body.userId, assistant: body.assistant, tool: body.tool, status: "SUCCESS", elapsedMs: performance.now() - started, count: quota });
      return respond(response, 200, result);
    } catch (err) {
      const code = typeof err?.message === "string" && /^MCP_[A-Z_]+$/.test(err.message) ? err.message : "MCP_UPSTREAM_FAILED";
      audit({ userId: body.userId, assistant: body.assistant, tool: body.tool, status: code, elapsedMs: performance.now() - started, count: quota });
      return respond(response, code.includes("PRIVATE") || code.includes("INVALID") ? 422 : 503, { error: code });
    }
  }).listen(PORT, HOST, () => process.stderr.write(`DTSC public MCP bridge listening on ${HOST}:${PORT}; reverse proxy TLS required\n`));
}

async function main() {
  if (TOKEN.length < 32) throw new Error("MCP_BRIDGE_AUTH_NOT_CONFIGURED");
  if (!process.env.BRAVE_API_KEY && !process.env.BRAVE_API_KEY_FILE) throw new Error("MCP_BRAVE_CREDENTIAL_NOT_CONFIGURED");
  for (const definition of definitions) {
    const client = new StdioClient(definition);
    clients.set(definition.code, client);
    await client.initialize();
  }
  ready = true;
  startHttp();
}
process.on("SIGTERM", () => { for (const client of clients.values()) client.close(); process.exit(0); });
main().catch((error) => {
  process.stderr.write(`DTSC MCP bridge failed closed: ${String(error?.message || "STARTUP_FAILED").replace(/[^A-Z0-9_]/gi, "").slice(0, 80)}\n`);
  for (const client of clients.values()) client.close();
  process.exitCode = 1;
});
