import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { getAppSettings } from "@/lib/settings";
import { publicPublicationSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_READ);
  if (access.response) return access.response;
  const settings = await getAppSettings();
  const canCreateDraft = access.session.role === UserRole.ADMIN || (access.session.role !== UserRole.CLIENT && settings.allowNonClientPublicationDrafts);
  if (!canCreateDraft) return NextResponse.json({ error: "Forbidden", reasonCode: "CAPABILITY_REQUIRED" }, { status: 403 });

  const body = publicPublicationSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid publication", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const canPublish = (await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_MANAGE)).response === undefined;
  const { contentHtml, ...publicationData } = body.data;
  const content = contentHtml ? sanitizeRichHtml(contentHtml) : publicationData.content;
  const published = canPublish ? publicationData.published : false;
  const now = new Date();

  const publication = await prisma.$transaction(async (tx) => {
    const created = await tx.publicPublication.create({
      data: {
        ...publicationData,
        published,
        status: published ? "PUBLISHED" : "DRAFT",
        publishedAt: published ? now : null,
        content,
        coverLabel: body.data.coverLabel || null,
        authorId: access.session.userId,
      },
      include: { author: { select: { name: true, email: true } } },
    });
    await tx.publicPublicationVersion.create({
      data: {
        publicationId: created.id,
        version: 1,
        title: created.title,
        slug: created.slug,
        category: created.category,
        excerpt: created.excerpt,
        content: created.content,
        coverLabel: created.coverLabel,
        published: created.published,
        locale: created.locale,
        seoJson: created.seoJson ?? undefined,
        createdByUserId: access.session.userId,
      },
    });
    return created;
  });

  await writeAuditLog({ userId: access.session.userId, action: "PUBLIC_PUBLICATION_CREATED", entity: "PublicPublication", entityId: publication.id, reasonCode: access.reasonCode, metadata: { slug: publication.slug, category: publication.category, status: publication.status, version: 1 }, request: req });
  return NextResponse.json({ ok: true, publication, reasonCode: access.reasonCode });
}
