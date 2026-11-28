import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeTaxCountryCode } from "@/lib/enterprise/accounting/tax-jurisdictions";
import { formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { createMedicalInvoice } from "@/lib/health-billing";
import { getHealthBillingAccess } from "@/lib/health-billing-access";
import { medicalInvoiceDetails, readMedicalInvoiceFilters, readMedicalInvoiceRegister, serializeMedicalInvoice } from "@/lib/health-billing-register";
import { invoiceCreateSchema } from "@/lib/health-billing-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type P = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: P) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getHealthBillingAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const paramsFromUrl = new URL(req.url).searchParams;
  const mode = paramsFromUrl.get("mode");
  const responseOptions = { headers: { "Cache-Control": "private, no-store" } };
  if (mode === "register" || mode === "export") {
    if (mode === "export" && !access.canExport) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const filters = readMedicalInvoiceFilters(paramsFromUrl);
    if (!filters) return NextResponse.json({ error: "HEALTH_BILLING_FILTERS_INVALID" }, { ...responseOptions, status: 400 });
    const result = await prisma.$transaction(tx => readMedicalInvoiceRegister(tx, organizationId, filters, {
      exportRows: mode === "export",
      canViewSensitive: access.canViewSensitive,
    }), { isolationLevel: "RepeatableRead" });
    if (mode === "export") {
      await writeAuditLog({
        userId: session.userId,
        organizationId,
        action: "HEALTH_MEDICAL_INVOICE_REGISTER_EXPORTED",
        entity: "HealthMedicalInvoice",
        request: req,
        metadata: { page: filters.page, rowCount: result.items.length },
      });
    }
    return NextResponse.json(result, responseOptions);
  }

  // Reference data is fetched once by the workspace. Keep the original response for callers without a mode.
  const [invoices, patients, consultations, appointments, labs, dispensations, departments, catalog, org] = await Promise.all([
    mode === "references" ? null : prisma.healthMedicalInvoice.findMany({
      where: { organizationId }, orderBy: { invoiceDate: "desc" }, include: medicalInvoiceDetails,
    }),
    prisma.healthPatient.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, patientNumber: true, fullName: true, phonePrimary: true },
    }),
    prisma.healthConsultation.findMany({
      where: { organizationId, status: { not: "CANCELLED" } },
      select: { id: true, consultationNumber: true, patientId: true },
    }),
    prisma.healthAppointment.findMany({
      where: { organizationId, status: { not: "CANCELLED" } },
      select: { id: true, appointmentNumber: true, patientId: true },
    }),
    prisma.healthLabRequest.findMany({
      where: { organizationId, status: { not: "CANCELLED" } },
      select: { id: true, labRequestNumber: true, testLabel: true, patientId: true },
    }),
    prisma.healthPharmacyDispensation.findMany({
      where: { organizationId, billable: true, billingStatus: { not: "BILLED" } },
      select: { id: true, patientId: true, quantity: true, product: { select: { name: true, sellingPrice: true, unit: true } } },
    }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, select: { id: true, labelFr: true } }),
    prisma.healthBillingServiceCatalog.findMany({
      where: { organizationId, isActive: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { country: true, timezone: true, name: true } }),
  ]);
  const now = new Date();
  const country = normalizeTaxCountryCode(org?.country);
  const taxCodes = country ? await prisma.enterpriseTaxCode.findMany({
    where: {
      organizationId, isActive: true, jurisdiction: country,
      category: { in: ["VAT", "GST", "SALES_TAX", "LOCAL_LEVY", "EXEMPT", "ZERO_RATED"] },
      rates: { some: { status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } },
    },
    select: { id: true, code: true, nameFr: true, nameEn: true, category: true, taxTreatment: true },
    orderBy: { code: "asc" },
  }) : [];
  const { canCreate, canUpdate, canIssue, canCancel, canRecordPayment, canCancelPayment, canDiscount, canManageCatalog, canExport } = access;
  return NextResponse.json({
    businessDate: formatEnterpriseBusinessDate(now, org?.timezone ?? ""),
    organizationName: org?.name,
    taxCodes,
    ...(invoices ? { invoices: invoices.map(invoice => serializeMedicalInvoice(invoice, access.canViewSensitive)) } : {}),
    patients,
    consultations,
    appointments,
    labs,
    dispensations: dispensations.map(dispensation => ({
      ...dispensation,
      quantity: Number(dispensation.quantity),
      product: { ...dispensation.product, sellingPrice: dispensation.product.sellingPrice === null ? null : Number(dispensation.product.sellingPrice) },
    })),
    departments,
    catalog: catalog.map(service => ({ ...service, defaultPrice: Number(service.defaultPrice) })),
    permissions: { canCreate, canUpdate, canIssue, canCancel, canRecordPayment, canCancelPayment, canDiscount, canManageCatalog, canExport },
  }, responseOptions);
}

export async function POST(req:Request,{params}:P){if(!isSameOriginRequest(req))return NextResponse.json({error:"Forbidden"},{status:403});const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});const limited=await rateLimit(getRateLimitKey(req,`health-billing-create:${session.userId}`),80,3600000);if(!limited.ok)return NextResponse.json({error:"Too many requests"},{status:429});const{organizationId}=await params,access=await getHealthBillingAccess({session,organizationId,action:"write"});if(!access?.canCreate)return NextResponse.json({error:"Forbidden"},{status:403});const parsed=invoiceCreateSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"ENTERPRISE_INPUT_INVALID",message:"Vérifiez le patient, les lignes et les montants."},{status:400});try{const invoice=await createMedicalInvoice(organizationId,session.userId,parsed.data,access.canDiscount,access.canLargeDiscount);await writeAuditLog({userId:session.userId,action:"HEALTH_MEDICAL_INVOICE_CREATED",entity:"HealthMedicalInvoice",entityId:invoice.id,request:req,metadata:{organizationId}});return NextResponse.json({ok:true,invoice,message:"Facture créée avec succès."},{status:201})}catch(e){const code=e instanceof Error?e.message:"FAILED";return NextResponse.json({error:code,message:({INVALID_PATIENT:"Patient invalide.",PATIENT_MISMATCH:"Le contexte médical ne correspond pas au patient.",INVALID_DISCOUNT:"La remise dépasse le montant facturable.",DISCOUNT_FORBIDDEN:"Vous n’avez pas la permission d’appliquer cette remise.",DISCOUNT_REASON_REQUIRED:"Indiquez le motif de la remise.",LARGE_DISCOUNT_FORBIDDEN:"Cette remise importante exige une permission renforcée.",PAYMENT_EXCEEDS_BALANCE:"Le paiement dépasse le solde restant.",SECTOR_TAX_HEADER_NOT_SUPPORTED_WITHOUT_LINE_EVIDENCE:"Pour facturer une taxe, choisissez un code fiscal dans chaque ligne concernée. Le montant sera calculé automatiquement.",SECTOR_TAX_JURISDICTION_REQUIRED:"Précisez le pays de l’entreprise avant de facturer une taxe.",TAX_SPECIAL_TREATMENT_PROOF_REQUIRED:"L'exonération ou le taux zéro exige une référence de justificatif fiscal.",TAX_COMPOUND_PROOF_REQUIRED:"Le cumul séquentiel exige une référence fiscale valide."} as Record<string,string>)[code]||"Création de la facture impossible."},{status:409})}}
