/**
 * ROUTES-02: bounded HIRMS API dispatch. The URL and HTTP body stay unchanged;
 * each original handler (renamed handler.ts) preserves all existing access
 * checks, tenant isolation, rate limits, audit, error handling and idempotence.
 * This route must never proxy arbitrary paths or import by user-supplied string.
 */
type Params = { params: Promise<{ organizationId: string; operation: string[] }> };
type Method = "GET" | "POST" | "OPTIONS";
function methodNotAllowed(allowed: string[]) {
  return new Response(null, {status:405, headers:{"Allow":allowed.join(", "), "Cache-Control":"no-store"}});
}
async function dispatch(req: Request, { params }: Params, method: Method): Promise<Response> {
  const { organizationId, operation } = await params;
  const key = operation.join("/");
  const ctx = { params: Promise.resolve({ organizationId }) };
  switch (key) {
    case "verify": {
      const allowed = ["POST","OPTIONS"];
      if (method === "OPTIONS") return new Response(null, {status:204, headers:{"Allow":allowed.join(", "), "Cache-Control":"no-store"}});
      if (!["POST"].includes(method)) return methodNotAllowed(allowed);
      const original = await import("@/app/api/enterprise/[organizationId]/insurance-connectors/verify/handler");
      
      if (method === "POST") return original.POST(req, ctx);
      return methodNotAllowed(allowed);
    }
    case "ocr": {
      const allowed = ["GET","POST","HEAD","OPTIONS"];
      if (method === "OPTIONS") return new Response(null, {status:204, headers:{"Allow":allowed.join(", "), "Cache-Control":"no-store"}});
      if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
      const original = await import("@/app/api/enterprise/[organizationId]/insurance-connectors/ocr/handler");
      if (method === "GET") return original.GET(req, ctx);
      if (method === "POST") return original.POST(req, ctx);
      return methodNotAllowed(allowed);
    }
    case "ocr/status": {
      const allowed = ["POST","OPTIONS"];
      if (method === "OPTIONS") return new Response(null, {status:204, headers:{"Allow":allowed.join(", "), "Cache-Control":"no-store"}});
      if (!["POST"].includes(method)) return methodNotAllowed(allowed);
      const original = await import("@/app/api/enterprise/[organizationId]/insurance-connectors/ocr/status/handler");
      
      if (method === "POST") return original.POST(req, ctx);
      return methodNotAllowed(allowed);
    }
    case "invoices": {
      const allowed = ["GET","POST","HEAD","OPTIONS"];
      if (method === "OPTIONS") return new Response(null, {status:204, headers:{"Allow":allowed.join(", "), "Cache-Control":"no-store"}});
      if (!["GET","POST"].includes(method)) return methodNotAllowed(allowed);
      const original = await import("@/app/api/enterprise/[organizationId]/insurance-connectors/invoices/handler");
      if (method === "GET") return original.GET(req, ctx);
      if (method === "POST") return original.POST(req, ctx);
      return methodNotAllowed(allowed);
    }
    case "invoices/status": {
      const allowed = ["POST","OPTIONS"];
      if (method === "OPTIONS") return new Response(null, {status:204, headers:{"Allow":allowed.join(", "), "Cache-Control":"no-store"}});
      if (!["POST"].includes(method)) return methodNotAllowed(allowed);
      const original = await import("@/app/api/enterprise/[organizationId]/insurance-connectors/invoices/status/handler");
      
      if (method === "POST") return original.POST(req, ctx);
      return methodNotAllowed(allowed);
    }
    default:
      return Response.json({error:"Not found"}, {status:404,headers:{"Cache-Control":"no-store"}});
  }
}
export function GET(req:Request,ctx:Params){return dispatch(req,ctx,"GET");}
export function POST(req:Request,ctx:Params){return dispatch(req,ctx,"POST");}
export function OPTIONS(req:Request,ctx:Params){return dispatch(req,ctx,"OPTIONS");}
