/** ROUTES-05A #1145: fixed invoices path/method allowlist.
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
  if (operation.length === 4 && operation[1] === "payments" && operation[3] === "allocate") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/[paymentId]/allocate/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]!, paymentId: operation[2]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 4 && operation[1] === "payments" && operation[3] === "transition") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/[paymentId]/transition/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]!, paymentId: operation[2]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 4 && operation[1] === "returns" && operation[3] === "decision") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/decision/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]!, requestId: operation[2]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 4 && operation[1] === "returns" && operation[3] === "inspection") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/inspection/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]!, requestId: operation[2]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 4 && operation[1] === "returns" && operation[3] === "prepare") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/prepare/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]!, requestId: operation[2]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 4 && operation[1] === "returns" && operation[3] === "settle") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/settle/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]!, requestId: operation[2]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 3 && operation[1] === "payments" && operation[2] === "approval-candidates") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/approval-candidates/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]! }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 2 && operation[1] === "payments") {
    const allow = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET" && method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]! }) };
    if (method === "GET") return original.GET(req, context);
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 2 && operation[1] === "print") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/print/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]! }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 2 && operation[1] === "returns") {
    const allow = ["GET","POST","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET" && method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]! }) };
    if (method === "GET") return original.GET(req, context);
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 2 && operation[1] === "transition") {
    const allow = ["POST","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "POST") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/transition/handler");
    const context = { params: Promise.resolve({ organizationId, invoiceId: operation[0]! }) };
    if (method === "POST") return original.POST(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 1 && operation[0] === "approval-candidates") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/approval-candidates/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 1 && operation[0] === "return-approval-candidates") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/return-approval-candidates/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  if (operation.length === 1 && operation[0] === "workflow") {
    const allow = ["GET","HEAD","OPTIONS"];
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow.join(", "), "Cache-Control": "no-store" } });
    if (method !== "GET") return methodNotAllowed(allow);
    const original = await import("@/app/api/enterprise/[organizationId]/retail/invoices/workflow/handler");
    const context = { params: Promise.resolve({ organizationId }) };
    if (method === "GET") return original.GET(req, context);
    return methodNotAllowed(allow);
  }
  return notFound();
}
export function GET(req: Request, ctx: Context) { return dispatch(req, ctx, "GET"); }
export function POST(req: Request, ctx: Context) { return dispatch(req, ctx, "POST"); }
export function OPTIONS(req: Request, ctx: Context) { return dispatch(req, ctx, "OPTIONS"); }
