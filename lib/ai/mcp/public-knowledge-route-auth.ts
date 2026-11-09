import { timingSafeEqual } from "node:crypto";

/** Private server-to-server MCP endpoint: never share the DTSC user session. */
export function withPublicMcpBearer(handler: (request: Request) => Promise<Response>, envKey: "MCP_PUBLIC_TIME_TOKEN" | "MCP_PUBLIC_BRAVE_TOKEN") {
  return async (request: Request) => {
    const expected = process.env[envKey]?.trim() || "";
    const header = request.headers.get("authorization") || "";
    if (expected.length < 32) return Response.json({ error: "MCP_SERVICE_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return Response.json({ error: "MCP_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    return handler(request);
  };
}
