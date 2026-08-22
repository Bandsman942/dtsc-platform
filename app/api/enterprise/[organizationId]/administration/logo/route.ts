import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { uploadOrganizationLogo, validateOrganizationLogo } from "@/lib/enterprise/organization-logo-storage";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Votre session a expiré." }, { status: 401 });
  const { organizationId } = await params;
  const access = await resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" });
  if (!access.allowed) return NextResponse.json({ error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à modifier l’identité visuelle de cette entreprise." }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-logo:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de changements de logo sur une courte période. Réessayez plus tard." }, { status: 429 });
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" }, select: { id: true } });
  if (!organization) return NextResponse.json({ error: "NOT_FOUND", message: "Cette entreprise n’est plus disponible." }, { status: 404 });
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("logo");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED", message: "Choisissez le fichier du logo sur votre appareil." }, { status: 400 });
  const validation = validateOrganizationLogo(file);
  if (!validation.ok) return NextResponse.json({ error: "INVALID_LOGO", message: validation.message }, { status: 400 });
  try {
    const uploaded = await uploadOrganizationLogo({ organizationId, file });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "organization-logo" } });
    return NextResponse.json({ ok: true, logoUrl: uploaded.publicUrl, message: "Le nouveau logo est prêt à être enregistré avec les paramètres de l’entreprise." });
  } catch (error) {
    const message = error instanceof Error && !error.message.startsWith("ORGANIZATION_LOGO_") ? error.message : "Le logo n’a pas pu être envoyé. Vérifiez le stockage puis réessayez.";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { organizationId, domain: "organization-logo", failed: true } });
    return NextResponse.json({ error: "UPLOAD_FAILED", message }, { status: 500 });
  }
}
