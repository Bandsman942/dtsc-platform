import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertGroupMemberForSession } from "@/lib/collaboration";
import { createCollaborationMediaSignedUrl } from "@/lib/collaboration-media";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ attachmentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { attachmentId } = await params;
  const attachment = await prisma.collaborationMessageAttachment.findFirst({ where: { id: attachmentId, status: "ACTIVE", deletedAt: null } });
  if (!attachment || !(await assertGroupMemberForSession(attachment.groupId, session))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const url = await createCollaborationMediaSignedUrl(attachment.groupId, attachment.storageBucket, attachment.storagePath, 120);
  return NextResponse.json({ url, originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes });
}
