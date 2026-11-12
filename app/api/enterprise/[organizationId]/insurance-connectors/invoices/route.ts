import { NextResponse } from "next/server";
import { z } from "zod";
import { HIRMS_ENVIRONMENTS } from "@/lib/enterprise/health-insurance-connectors/environments";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { InsuranceConnectorError } from "@/lib/enterprise/health-insurance-connectors/registry";
import { HirmsInvoiceTransportError } from "@/lib/enterprise/health-insurance-connectors/hirms-invoices";
import { preflightHirmsInvoiceSubmission, submitHirmsInvoices, listHirmsInvoiceSubmissions } from "@/lib/enterprise/health-insurance-connectors/invoice-service";
type Params = { params: Promise<{ organizationId: string }> };
const commandSchema = z.object({
  environment: z.enum(HIRMS_ENVIRONMENTS),
  operation: z.enum(["preflight","submit"]),
  mode: z.enum(["single","bulk"]),
  payload: z.unknown(),
}).strict();

async function access(organizationId: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>, mutate: boolean) {
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) return false;
  const org = await prisma.organization.findFirst({
    where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null, sectorCode: { in: ["HEALTH_CARE","PHARMACY"] } },
    select: { sectorCode: true },
  });
  if (!org) return false;
  if (org.sectorCode === "HEALTH_CARE") {
    const permissions = await getHealthInsuranceAccess({ session, organizationId, action: mutate ? "write" : "read" });
    return Boolean(permissions && (mutate ? permissions.canSubmit : permissions.canViewReports));
  }
  return canAccessPharmacySales(session.userId, organizationId, mutate ? "confirm" : "view");
}

function errorResponse(error: unknown) {
  const known = error instanceof InsuranceConnectorError || error instanceof HirmsInvoiceTransportError;
  const code = known ? error.code : "HIRMS_INVOICE_OPERATION_FAILED";
  const status = known ? error.httpStatus : 503;
  const friendly = code === "HIRMS_INVOICE_JSON_INVALID" ? "Le JSON ne respecte pas le modèle de facture HSL : contrôlez les champs, types, dates et lignes."
    : code === "HIRMS_ERP_INVOICE_NOT_FOUND" ? "Cette facture n'appartient pas à l'entreprise."
    : code === "HIRMS_ERP_INVOICE_AMOUNT_MISMATCH" ? "Le montant réclamé ne correspond pas à la facture ERP."
    : code === "HIRMS_INVOICE_ALREADY_TRANSMITTED_OR_UNRESOLVED" ? "Cette facture possède déjà une tentative : consultez son suivi avant toute nouvelle transmission."
    : code === "HIRMS_INVOICE_CONTRACT_REJECTED" ? "HIRMS a rejeté le contrat de facture. Corrigez les données ; ne renvoyez pas le même fichier."
    : code === "HIRMS_INVOICE_OUTCOME_UNKNOWN" ? "Le résultat de la transmission est incertain. Vérifiez l'historique HIRMS avant toute nouvelle tentative."
    : code === "HIRMS_INVOICE_SENDING_DISABLED" ? "L’envoi de factures est désactivé pour l’environnement choisi. Contactez l’administration DTSC."
    : code === "HIRMS_PRODUCTION_NOT_ENABLED" ? "La connexion de Production doit être habilitée par DTSC avant tout appel réel."
    : code === "HIRMS_SERVICE_PROVIDER_MAPPING_REQUIRED" ? "Renseignez l'identifiant officiel du prestataire communiqué par HSL."
    : "Transmission impossible : contrôlez la facture, les droits HSL et la configuration du connecteur.";
  return NextResponse.json({ error: code, message: friendly }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await access(organizationId,session,false))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const environment = z.enum(HIRMS_ENVIRONMENTS).safeParse(url.searchParams.get("environment") || "UAT");
  if (!environment.success) return NextResponse.json({ error: "HIRMS_ENVIRONMENT_INVALID" }, { status: 400 });
  const page = Number(url.searchParams.get("page") || "1");
  return NextResponse.json(await listHirmsInvoiceSubmissions(organizationId,environment.data,page), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await access(organizationId,session,true))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `health-insurance-invoice-send:${organizationId}:${session.userId}`), 12, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "HIRMS_INVOICE_LOCAL_RATE_LIMIT" }, { status: 429 });
  if (Number(req.headers.get("content-length") || 0) > 8 * 1024 * 1024)
    return NextResponse.json({ error: "HIRMS_INVOICE_REQUEST_TOO_LARGE" }, { status: 413 });
  const parsed = commandSchema.safeParse(await req.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ error: "HIRMS_INVOICE_COMMAND_INVALID", message: "Choisissez l'envoi individuel ou groupé et transmettez le JSON des factures." }, { status: 400 });
  const {environment,operation,mode,payload} = parsed.data;
  try {
    const result = operation === "preflight"
      ? await preflightHirmsInvoiceSubmission(organizationId,environment,mode,payload)
      : await submitHirmsInvoices(organizationId,session.userId,environment,mode,payload);
    await writeAuditLog({ userId: session.userId, action: operation === "preflight" ? "HIRMS_INVOICE_PREFLIGHT_OK" : "HIRMS_INVOICE_TRANSPORT_ACCEPTED",
      entity: "EnterpriseHealthInsuranceInvoiceSubmission", request: req, metadata: {
        organizationId, environment, mode, count: result.count, ...(operation === "submit" && "batchId" in result ? { batchId: result.batchId } : {}),
      }});
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId,
      metadata: { organizationId, domain: "health-insurance-connectors", environment, operation, mode, count: result.count } });
    return NextResponse.json(result,{headers:{ "Cache-Control":"no-store" }});
  } catch(error) {
    const response = errorResponse(error);
    await writeApiLog({ request: req, startedAt, statusCode: response.status, userId: session.userId,
      metadata: { organizationId, domain:"health-insurance-connectors", environment, operation, mode, errorCode: error instanceof InsuranceConnectorError ? error.code : "UNKNOWN" } });
    return response;
  }
}
