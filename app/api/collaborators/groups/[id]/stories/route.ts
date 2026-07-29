import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, writeGroupAudit } from "@/lib/collaboration";
import { collaborationStoryMetadataSchema } from "@/lib/collaboration-experience-validators";
import { createCollaborationMediaSignedUrl, removeCollaborationMedia, uploadGroupStory, validateCollaborationImage } from "@/lib/collaboration-media";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stories = await prisma.collaborationGroupStory.findMany({
    where: { groupId: id, deletedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  const payload = await Promise.all(stories.map(async (story) => ({
    id: story.id,
    groupId: story.groupId,
    authorId: story.authorId,
    caption: story.caption,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    imageUrl: await createCollaborationMediaSignedUrl(id, story.storageBucket, story.storagePath).catch(() => null),
  })));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ stories: payload });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-story:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image required" }, { status: 400 });
  const validation = validateCollaborationImage(file);
  if (!validation.ok) return NextResponse.json({ error: "Invalid image", message: validation.message }, { status: validation.status });
  const metadata = collaborationStoryMetadataSchema.safeParse({ caption: String(form.get("caption") || "") });
  if (!metadata.success) return NextResponse.json({ error: "Invalid story" }, { status: 400 });

  const storyId = randomUUID();
  const uploaded = await uploadGroupStory(id, storyId, file);
  try {
    const story = await prisma.collaborationGroupStory.create({
      data: {
        id: storyId,
        groupId: id,
        authorId: session.userId,
        caption: metadata.data.caption || null,
        storageBucket: uploaded.storageBucket,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "story.create", entityType: "CollaborationGroupStory", entityId: story.id });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, story }, { status: 201 });
  } catch (error) {
    await removeCollaborationMedia(id, uploaded.storageBucket, uploaded.storagePath);
    throw error;
  }
}
