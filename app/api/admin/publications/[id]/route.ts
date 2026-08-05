import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { getAppSettings } from "@/lib/settings";
import { publicPublicationSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_READ);
  if (access.response) return access.response;
  const { id } = await params;
  const body = publicPublicationSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid publication", reasonCode: "VALIDATION_ERROR" }, { status: 400 });

  const existing = await prisma.publicPublication.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!existing) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  const settings = await getAppSettings();
  const manage = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_MANAGE);
  const canManage = !manage.response;
  const canEditOwnDraft = access.session.role !== UserRole.CLIENT && settings.allowNonClientPublicationDrafts && existing.authorId === access.session.userId && !existing.published && existing.status !== "ARCHIVED";
  if (!canManage && !canEditOwnDraft) return NextResponse.json({ error: "Forbidden", reasonCode: "CAPABILITY_REQUIRED" }, { status: 403 });

  const { contentHtml, ...publicationData } = body.data;
  const content = contentHtml ? sanitizeRichHtml(contentHtml) : publicationData.content;
  const published = canManage ? publicationData.published : false;
  const now = new Date();
  const publication = await prisma.$transaction(async (tx) => {
    let latestVersion = existing.versions[0]?.version || 0;
    if (!latestVersion) {
      await tx.publicPublicationVersion.create({ data: { publicationId: existing.id, version: 1, title: existing.title, slug: existing.slug, category: existing.category, excerpt: existing.excerpt, content: existing.content, coverLabel: existing.coverLabel, published: existing.published, locale: existing.locale, seoJson: existing.seoJson ?? undefined, createdByUserId: existing.authorId } });
      latestVersion = 1;
    }
    const updated = await tx.publicPublication.update({
      where: { id },
      data: {
        ...publicationData,
        published,
        status: published ? "PUBLISHED" : "DRAFT",
        publishedAt: published ? existing.publishedAt || now : null,
        archivedAt: null,
        content,
        coverLabel: body.data.coverLabel || null,
      },
      include: { author: { select: { name: true, email: true } } },
    });
    await tx.publicPublicationVersion.create({ data: { publicationId: updated.id, version: latestVersion + 1, title: updated.title, slug: updated.slug, category: updated.category, excerpt: updated.excerpt, content: updated.content, coverLabel: updated.coverLabel, published: updated.published, locale: updated.locale, seoJson: updated.seoJson ?? undefined, createdByUserId: access.session.userId } });
    return { updated, version: latestVersion + 1 };
  });

  await writeAuditLog({ userId: access.session.userId, action: "PUBLIC_PUBLICATION_VERSION_CREATED", entity: "PublicPublication", entityId: publication.updated.id, before: { status: existing.status, published: existing.published, slug: existing.slug }, after: { status: publication.updated.status, published: publication.updated.published, slug: publication.updated.slug }, reasonCode: canManage ? manage.reasonCode : access.reasonCode, metadata: { version: publication.version, draftContributor: !canManage }, request: req });
  return NextResponse.json({ ok: true, publication: publication.updated, version: publication.version });
}

export async function DELETE(req: Request, { params }: Params) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_MANAGE);
  if (access.response) return access.response;
  const { id } = await params;
  const existing = await prisma.publicPublication.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  const archived = await prisma.publicPublication.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date(), published: false } });
  await writeAuditLog({ userId: access.session.userId, action: "PUBLIC_PUBLICATION_ARCHIVED", entity: "PublicPublication", entityId: id, before: { status: existing.status, published: existing.published }, after: { status: archived.status, published: archived.published }, reasonCode: access.reasonCode, riskLevel: "MEDIUM", request: req });
  return NextResponse.json({ ok: true, publication: archived, reasonCode: access.reasonCode });
}
