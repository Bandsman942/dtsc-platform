import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { publicPublicationSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = publicPublicationSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid publication" }, { status: 400 });
  }

  const { contentHtml, ...publicationData } = body.data;
  const publication = await prisma.publicPublication.update({
    where: { id },
    data: {
      ...publicationData,
      content: contentHtml ? sanitizeRichHtml(contentHtml) : publicationData.content,
      coverLabel: body.data.coverLabel || null,
    },
    include: { author: { select: { name: true, email: true } } },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "PUBLIC_PUBLICATION_UPDATED",
    entity: "PublicPublication",
    entityId: publication.id,
    metadata: { slug: publication.slug, category: publication.category, published: publication.published },
    request: req,
  });

  return NextResponse.json({ ok: true, publication });
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.publicPublication.delete({ where: { id } });

  await writeAuditLog({
    userId: session.userId,
    action: "PUBLIC_PUBLICATION_DELETED",
    entity: "PublicPublication",
    entityId: id,
    request: req,
  });

  return NextResponse.json({ ok: true });
}
