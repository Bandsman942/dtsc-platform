import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { getAppSettings } from "@/lib/settings";
import { publicPublicationSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const access = await requireAdminBlockAccess("publications");
  if (access.response) {
    return access.response;
  }
  const session = access.session;
  const settings = await getAppSettings();
  const canCreateDraft = session.role === UserRole.ADMIN || (session.role !== UserRole.CLIENT && settings.allowNonClientPublicationDrafts);
  if (!canCreateDraft) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = publicPublicationSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid publication" }, { status: 400 });
  }

  const { contentHtml, ...publicationData } = body.data;
  const published = session.role === UserRole.ADMIN ? publicationData.published : false;
  const publication = await prisma.publicPublication.create({
    data: {
      ...publicationData,
      published,
      content: contentHtml ? sanitizeRichHtml(contentHtml) : publicationData.content,
      coverLabel: body.data.coverLabel || null,
      authorId: session.userId,
    },
    include: { author: { select: { name: true, email: true } } },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "PUBLIC_PUBLICATION_CREATED",
    entity: "PublicPublication",
    entityId: publication.id,
    metadata: { slug: publication.slug, category: publication.category, published: publication.published, draftContributor: session.role !== UserRole.ADMIN },
    request: req,
  });

  return NextResponse.json({ ok: true, publication });
}
