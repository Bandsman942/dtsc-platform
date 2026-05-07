import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicPublicationSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = publicPublicationSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid publication" }, { status: 400 });
  }

  const publication = await prisma.publicPublication.create({
    data: {
      ...body.data,
      coverLabel: body.data.coverLabel || null,
      authorId: session.userId,
    },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "PUBLIC_PUBLICATION_CREATED",
    entity: "PublicPublication",
    entityId: publication.id,
    metadata: { slug: publication.slug, category: publication.category, published: publication.published },
    request: req,
  });

  return NextResponse.json({ ok: true, publication });
}
