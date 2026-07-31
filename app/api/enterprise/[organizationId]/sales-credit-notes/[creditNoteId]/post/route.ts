import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { approveAndPostSalesCreditNote } from "@/lib/enterprise/accounting/receivables-service";
import { revisionSchema } from "@/lib/enterprise/accounting/schemas";
import { z } from "zod";

type Params = { params: Promise<{ organizationId: string; creditNoteId: string }> };
const schema = z.object({ revision: revisionSchema });
export async function POST(req: Request, { params }: Params) { const startedAt = Date.now(); const { organizationId, creditNoteId } = await params; const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "post", { mutation: true, limit: 60 }); if (!auth.ok) return auth.response; const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 }); try { const creditNote = await approveAndPostSalesCreditNote(organizationId, creditNoteId, auth.session.userId, parsed.data.revision); await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_SALES_CREDIT_NOTE_POSTED", entity: "EnterpriseSalesCreditNote", entityId: creditNoteId, request: req, metadata: { organizationId } }); await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sales-credit-notes", action: "post" } }); return NextResponse.json({ ok: true, creditNote }); } catch (error) { return financeErrorResponse(error, "SALES_CREDIT_NOTE_POST_FAILED"); } }
