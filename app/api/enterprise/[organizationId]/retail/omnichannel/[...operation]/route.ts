/** ROUTES-05A #1145: fixed omnichannel path/method allowlist.
 * The original handlers retain authorization, validation, transactions and audit.
 * Preserve the original Request/Response streams and tenant-scoped parameters.
 */
type Context = { params: Promise<{ organizationId: string; operation: string[] }> };
type Method = "GET" | "POST" | "OPTIONS";
function notFound() {
  return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
function methodNotAllowed(allow: string[]) {
  return new Response(null, { status: 405, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
}
async function dispatch(req: Request, { params }: Context, method: Method): Promise<Response> {
  const { organizationId, operation } = await params;
  if (!organizationId || !Array.isArray(operation) || operation.some(part => !part)) return notFound();
  if (operation.length === 3 && operation[0] === "orders" && operation[2] === "cancel") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/orders/[orderId]/cancel/handler");
    const context = { params: Promise.resolve({ organizationId, orderId: operation[1]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 3 && operation[0] === "orders" && operation[2] === "returns") {
    const allow = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET" && method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/orders/[orderId]/returns/handler");
    const context = { params: Promise.resolve({ organizationId, orderId: operation[1]! }) };
    if (method === "GET") return original.GET(req, context);
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 3 && operation[0] === "returns" && operation[2] === "decision") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/returns/[returnId]/decision/handler");
    const context = { params: Promise.resolve({ organizationId, returnId: operation[1]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 3 && operation[0] === "returns" && operation[2] === "prepare") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/returns/[returnId]/prepare/handler");
    const context = { params: Promise.resolve({ organizationId, returnId: operation[1]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 3 && operation[0] === "returns" && operation[2] === "settle") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/returns/[returnId]/settle/handler");
    const context = { params: Promise.resolve({ organizationId, returnId: operation[1]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 2 && operation[0] === "returns" && operation[1] === "validators") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/returns/validators/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 1 && operation[0] === "orders") {
    const allow = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET" && method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/omnichannel/orders/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  return notFound();
}
export function GET(req: Request, ctx: Context) { return dispatch(req, ctx, "GET"); }
export function POST(req: Request, ctx: Context) { return dispatch(req, ctx, "POST"); }
export function OPTIONS(req: Request, ctx: Context) { return dispatch(req, ctx, "OPTIONS"); }
