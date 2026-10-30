import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-content";

type Params = { params: Promise<{ id: string }> };
const payloadSchema = z.object({ version: z.number().int().min(1) });

export async function POST(request: Request, { params }: Params) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.CONTENT_MANAGE);
  if (access.response) return access.response;
  const { id } = await params;
  const body = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Version invalide", reasonCode: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.publicPublication.findUnique({
        where: { id }, select: { id: true, slug: true, status: true, published: true, publishedAt: true, updatedAt: true },
      });
      if (!current || current.status === "ARCHIVED") return null;
      const [chosen, latest] = await Promise.all([
        tx.publicPublicationVersion.findUnique({ where: { publicationId_version: { publicationId: id, version: body.data.version } } }),
        tx.publicPublicationVersion.findFirst({ where: { publicationId: id }, orderBy: { version: "desc" }, select: { version: true } }),
      ]);
      if (!chosen) return null;

      const nextVersion = (latest?.version || 0) + 1;
      const sanitized = sanitizeRichHtml(chosen.content);
      const update = await tx.publicPublication.updateMany({
        where: { id, updatedAt: current.updatedAt },
        data: {
          title: chosen.title, slug: chosen.slug, category: chosen.category,
          excerpt: chosen.excerpt, content: sanitized, coverLabel: chosen.coverLabel,
          locale: chosen.locale, seoJson: chosen.seoJson ?? Prisma.JsonNull,
          published: chosen.published, status: chosen.published ? "PUBLISHED" : "DRAFT",
          publishedAt: chosen.published ? current.publishedAt || new Date() : null,
        },
      });
      if (update.count !== 1) throw new Error("RESTORE_CONCURRENT_UPDATE");
      const restored = await tx.publicPublication.findUniqueOrThrow({ where: { id } });
      await tx.publicPublicationVersion.create({
        data: {
          publicationId: id, version: nextVersion, title: restored.title, slug: restored.slug,
          category: restored.category, excerpt: restored.excerpt, content: restored.content,
          coverLabel: restored.coverLabel, published: restored.published, locale: restored.locale,
          seoJson: restored.seoJson ?? undefined, createdByUserId: access.session.userId,
        },
      });
      return { restored, nextVersion, fromVersion: chosen.version, oldSlug: current.slug, oldStatus: current.status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) return NextResponse.json({ error: "Version introuvable", reasonCode: "NOT_FOUND" }, { status: 404 });
    await writeAuditLog({
      userId: access.session.userId, action: "PUBLIC_PUBLICATION_VERSION_RESTORED",
      entity: "PublicPublication", entityId: id,
      before: { slug: result.oldSlug, status: result.oldStatus },
      after: { slug: result.restored.slug, status: result.restored.status },
      metadata: { fromVersion: result.fromVersion, newVersion: result.nextVersion },
      reasonCode: access.reasonCode, riskLevel: "MEDIUM", request,
    });
    return NextResponse.json({ ok: true, publication: result.restored, version: result.nextVersion });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      return NextResponse.json({ error: "La publication a été modifiée entre-temps", reasonCode: "CONCURRENT_MODIFICATION" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "RESTORE_CONCURRENT_UPDATE") {
      return NextResponse.json({ error: "La publication a été modifiée entre-temps", reasonCode: "CONCURRENT_MODIFICATION" }, { status: 409 });
    }
    throw error;
  }
}
