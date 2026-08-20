import http from "node:http";
import net from "node:net";

const listenHost = process.env.CI_REDIS_REST_HOST?.trim() || "127.0.0.1";
const listenPort = Number(process.env.CI_REDIS_REST_PORT || 8079);
const redisHost = process.env.CI_REDIS_HOST?.trim() || "127.0.0.1";
const redisPort = Number(process.env.CI_REDIS_PORT || 6379);
const expectedToken = process.env.CI_REDIS_REST_TOKEN?.trim();
const MAX_BODY_BYTES = 1024 * 1024;
const REDIS_TIMEOUT_MS = 2_000;

if (!expectedToken) {
  throw new Error("CI_REDIS_REST_TOKEN is required");
}
if (!Number.isInteger(listenPort) || listenPort <= 0 || listenPort > 65_535) {
  throw new Error("CI_REDIS_REST_PORT must be a valid TCP port");
}
if (!Number.isInteger(redisPort) || redisPort <= 0 || redisPort > 65_535) {
  throw new Error("CI_REDIS_PORT must be a valid TCP port");
}

function encodeCommand(command) {
  const args = command.map((value) => String(value));
  let payload = `*${args.length}\r\n`;
  for (const arg of args) {
    const bytes = Buffer.byteLength(arg);
    payload += `$${bytes}\r\n${arg}\r\n`;
  }
  return payload;
}

function readLine(buffer, offset) {
  const end = buffer.indexOf("\r\n", offset);
  if (end === -1) return null;
  return { text: buffer.toString("utf8", offset, end), next: end + 2 };
}

function parseResp(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const marker = String.fromCharCode(buffer[offset]);
  const cursor = offset + 1;

  if (marker === "+" || marker === "-" || marker === ":") {
    const line = readLine(buffer, cursor);
    if (!line) return null;
    if (marker === "+") return { value: line.text, next: line.next };
    if (marker === ":") return { value: Number(line.text), next: line.next };
    return { error: line.text, next: line.next };
  }

  if (marker === "$") {
    const line = readLine(buffer, cursor);
    if (!line) return null;
    const length = Number(line.text);
    if (!Number.isInteger(length)) throw new Error("Invalid Redis bulk-string length");
    if (length === -1) return { value: null, next: line.next };
    const end = line.next + length;
    if (buffer.length < end + 2) return null;
    if (buffer[end] !== 13 || buffer[end + 1] !== 10) throw new Error("Invalid Redis bulk-string terminator");
    return { value: buffer.toString("utf8", line.next, end), next: end + 2 };
  }

  if (marker === "*") {
    const line = readLine(buffer, cursor);
    if (!line) return null;
    const count = Number(line.text);
    if (!Number.isInteger(count)) throw new Error("Invalid Redis array length");
    if (count === -1) return { value: null, next: line.next };
    const values = [];
    let next = line.next;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseResp(buffer, next);
      if (!parsed) return null;
      if (parsed.error) values.push({ error: parsed.error });
      else values.push(parsed.value);
      next = parsed.next;
    }
    return { value: values, next };
  }

  throw new Error(`Unsupported Redis RESP marker: ${marker}`);
}

function executeRedisCommand(command) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: redisHost, port: redisPort });
    let settled = false;
    let buffer = Buffer.alloc(0);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(REDIS_TIMEOUT_MS, () => finish({ error: "Redis command timeout" }));
    socket.on("error", () => finish({ error: "Redis command failed" }));
    socket.on("connect", () => socket.write(encodeCommand(command)));
    socket.on("data", (chunk) => {
      try {
        buffer = Buffer.concat([buffer, chunk]);
        const parsed = parseResp(buffer);
        if (!parsed) return;
        if (parsed.error) finish({ error: parsed.error });
        else finish({ result: parsed.value });
      } catch {
        finish({ error: "Redis response parse failed" });
      }
    });
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "null");
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${expectedToken}`;
}

async function handleRequest(request, response) {
  if (request.method === "GET" && request.url === "/healthz") {
    if (!authorized(request)) return writeJson(response, 401, { error: "Unauthorized" });
    const ping = await executeRedisCommand(["PING"]);
    return ping.error
      ? writeJson(response, 503, { error: "Redis unavailable" })
      : writeJson(response, 200, { ok: ping.result === "PONG" });
  }

  if (request.method !== "POST" || (request.url !== "/" && request.url !== "/pipeline")) {
    return writeJson(response, 404, { error: "Not found" });
  }
  if (!authorized(request)) return writeJson(response, 401, { error: "Unauthorized" });

  try {
    const payload = await readJsonBody(request);
    if (request.url === "/pipeline") {
      if (!Array.isArray(payload) || payload.some((command) => !Array.isArray(command) || command.length === 0)) {
        return writeJson(response, 400, { error: "Invalid Redis pipeline" });
      }
      const results = [];
      for (const command of payload) results.push(await executeRedisCommand(command));
      return writeJson(response, 200, results);
    }

    if (!Array.isArray(payload) || payload.length === 0) {
      return writeJson(response, 400, { error: "Invalid Redis command" });
    }
    const result = await executeRedisCommand(payload);
    return writeJson(response, 200, result);
  } catch {
    return writeJson(response, 400, { error: "Invalid request" });
  }
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(listenPort, listenHost, () => {
  console.log(`CI Redis REST proxy ready on http://${listenHost}:${listenPort}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
