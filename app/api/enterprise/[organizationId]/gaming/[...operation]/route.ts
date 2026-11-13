/** ROUTES-02 — Gaming dispatcher with a closed route/method allowlist.
 * Each imported handler is the original endpoint byte-for-byte, including
 * session, tenant membership, RBAC, validation, audits and idempotency.
 * The request body is never parsed or forwarded to a generic proxy.
 */
type Context = { params: Promise<{ organizationId: string; operation: string[] }> };
type AllowedMethod = "GET" | "POST" | "PATCH" | "OPTIONS";
function methodNotAllowed(allow: string[]) {
  return new Response(null, { status: 405, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
}
async function dispatch(req: Request, { params }: Context, method: AllowedMethod): Promise<Response> {
  const { organizationId, operation } = await params;
  if (!organizationId || !Array.isArray(operation)) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (operation.length === 4 && operation[0] === "tournaments" && operation[2] === "registrations") {
    const allowed = ["PATCH","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/registrations/[registrationId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, tournamentId: operation[1]!, registrationId: operation[3]! }) };
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 4 && operation[0] === "tournaments" && operation[2] === "stations") {
    const allowed = ["PATCH","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/stations/[assignmentId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, tournamentId: operation[1]!, assignmentId: operation[3]! }) };
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 3 && operation[0] === "checkouts" && operation[2] === "receipt") {
    const allowed = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/receipt/handler");
    const originalContext = { params: Promise.resolve({ organizationId, checkoutId: operation[1]! }) };
    if (method === "GET") return handler.GET(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 3 && operation[0] === "tournaments" && operation[2] === "registrations") {
    const allowed = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/registrations/handler");
    const originalContext = { params: Promise.resolve({ organizationId, tournamentId: operation[1]! }) };
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 3 && operation[0] === "tournaments" && operation[2] === "stations") {
    const allowed = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/stations/handler");
    const originalContext = { params: Promise.resolve({ organizationId, tournamentId: operation[1]! }) };
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "pricing" && operation[1] === "simulate") {
    const allowed = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/pricing/simulate/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "stations" && operation[1] === "candidates") {
    const allowed = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/stations/candidates/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "bookings") {
    const allowed = ["PATCH","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/bookings/[bookingId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, bookingId: operation[1]! }) };
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "checkouts") {
    const allowed = ["GET","PATCH","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, checkoutId: operation[1]! }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "daily-closes") {
    const allowed = ["GET","PATCH","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/daily-closes/[closeId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, closeId: operation[1]! }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "pricing") {
    const allowed = ["PATCH","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/pricing/[ruleId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, ruleId: operation[1]! }) };
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "sessions") {
    const allowed = ["PATCH","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/sessions/[sessionId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, sessionId: operation[1]! }) };
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "stations") {
    const allowed = ["PATCH","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/stations/[stationId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, stationId: operation[1]! }) };
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 2 && operation[0] === "tournaments") {
    const allowed = ["GET","PATCH","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","PATCH"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/handler");
    const originalContext = { params: Promise.resolve({ organizationId, tournamentId: operation[1]! }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "PATCH") return handler.PATCH(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "bookings") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/bookings/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "checkouts") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/checkouts/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "daily-closes") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/daily-closes/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "dashboard") {
    const allowed = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/dashboard/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "onboarding") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/onboarding/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "pricing") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/pricing/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "reports") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/reports/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "sessions") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/sessions/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "stations") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/stations/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  if (operation.length === 1 && operation[0] === "tournaments") {
    const allowed = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
    if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
    const handler = await import("@/app/api/enterprise/[organizationId]/gaming/tournaments/handler");
    const originalContext = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return handler.GET(req, originalContext);
    if (method === "POST") return handler.POST(req, originalContext);
    return methodNotAllowed(allowed);
  }
  return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
export function GET(req: Request, ctx: Context) { return dispatch(req, ctx, "GET"); }
export function POST(req: Request, ctx: Context) { return dispatch(req, ctx, "POST"); }
export function PATCH(req: Request, ctx: Context) { return dispatch(req, ctx, "PATCH"); }
export function OPTIONS(req: Request, ctx: Context) { return dispatch(req, ctx, "OPTIONS"); }
