import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_READ);
  if (access.response) return access.response;
  const { id } = await params;
  const publication = await prisma.publicPublication.findUnique({
    where: { id }, select: { authorId: true, published: true, status: true },
  });
  if (!publication || publication.status === "ARCHIVED") {
    return NextResponse.json({ error: "Publication introuvable", reasonCode: "NOT_FOUND" }, { status: 404 });
  }
  const manage = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_MANAGE);
  const settings = await getAppSettings();
  const canSee = !manage.response || (
    access.session.role !== UserRole.CLIENT && settings.allowNonClientPublicationDrafts &&
    publication.authorId === access.session.userId && !publication.published
  );
  if (!canSee) return NextResponse.json({ error: "Accès refusé", reasonCode: "CAPABILITY_REQUIRED" }, { status: 403 });

  const versions = await prisma.publicPublicationVersion.findMany({
    where: { publicationId: id }, orderBy: { version: "desc" }, take: 40,
    select: { version: true, title: true, category: true, published: true, createdAt: true, createdByUserId: true },
  });
  return NextResponse.json({ ok: true, versions });
}
