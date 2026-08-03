import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { collaborationGroupScopeWhere } from "@/lib/collaboration";
import { createCollaborationMediaSignedUrl } from "@/lib/collaboration-media";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groups = await prisma.collaborationGroup.findMany({
    where: {
      status: "ACTIVE",
      members: { some: { userId: session.userId, status: "ACTIVE" } },
      ...collaborationGroupScopeWhere(session),
    },
    select: { id: true },
    take: 500,
  });
  const groupIds = groups.map((group) => group.id);
  const filtersPromise = prisma.collaborationConversationFilter.findMany({
    where: { userId: session.userId },
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
    take: 20,
  });
  if (!groupIds.length) {
    const filters = await filtersPromise;
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ profiles: [], preferences: [], stories: [], filters });
  }

  const now = new Date();
  const [profiles, preferences, stories, filters] = await Promise.all([
    prisma.collaborationGroupExperience.findMany({ where: { groupId: { in: groupIds } } }),
    prisma.collaborationGroupPreference.findMany({ where: { groupId: { in: groupIds }, userId: session.userId } }),
    prisma.collaborationGroupStory.findMany({
      where: { groupId: { in: groupIds }, deletedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    filtersPromise,
  ]);

  const profilePayload = await Promise.all(profiles.map(async (profile) => ({
    groupId: profile.groupId,
    avatarUrl: profile.avatarStorageBucket && profile.avatarStoragePath
      ? await createCollaborationMediaSignedUrl(profile.groupId, profile.avatarStorageBucket, profile.avatarStoragePath).catch(() => null)
      : null,
    avatarUpdatedAt: profile.avatarUpdatedAt,
  })));

  const storyPayload = await Promise.all(stories.map(async (story) => ({
    id: story.id,
    groupId: story.groupId,
    authorId: story.authorId,
    caption: story.caption,
    mimeType: story.mimeType,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    imageUrl: await createCollaborationMediaSignedUrl(story.groupId, story.storageBucket, story.storagePath).catch(() => null),
  })));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { domain: "collaboration-experience", groupCount: groupIds.length } });
  return NextResponse.json({ profiles: profilePayload, preferences, stories: storyPayload, filters });
}
