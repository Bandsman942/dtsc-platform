/** ROUTES-05A #1145: fixed pricing path/method allowlist.
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
  if (operation.length === 1 && operation[0] === "catalog") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/pricing/catalog/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 1 && operation[0] === "conditions") {
    const allow = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET" && method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/pricing/conditions/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 1 && operation[0] === "preview") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/pricing/preview/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  return notFound();
}
export function GET(req: Request, ctx: Context) { return dispatch(req, ctx, "GET"); }
export function POST(req: Request, ctx: Context) { return dispatch(req, ctx, "POST"); }
export function OPTIONS(req: Request, ctx: Context) { return dispatch(req, ctx, "OPTIONS"); }
