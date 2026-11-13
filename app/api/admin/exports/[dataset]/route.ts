/** ROUTES-02: the URL remains /api/admin/exports/{dataset}.
 * Named static imports prevent arbitrary dispatch; legacy handlers retain
 * exactly their original DTSC_INTERNAL console-capability and audit checks.
 */
const EXPORT_HANDLERS = {
  audit: () => import("@/app/api/admin/exports/audit/handler"),
  organizations: () => import("@/app/api/admin/exports/organizations/handler"),
  payments: () => import("@/app/api/admin/exports/payments/handler"),
  users: () => import("@/app/api/admin/exports/users/handler"),
} as const;
type Params = { params: Promise<{ dataset: string }> };
export async function GET(req: Request, { params }: Params) {
  const { dataset } = await params;
  if (!Object.prototype.hasOwnProperty.call(EXPORT_HANDLERS, dataset)) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const handler = await EXPORT_HANDLERS[dataset as keyof typeof EXPORT_HANDLERS]();
  return handler.GET(req);
}
