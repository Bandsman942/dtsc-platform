CREATE TABLE "PublicPublication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'RESSOURCE',
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "coverLabel" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicPublication_slug_key" ON "PublicPublication"("slug");
CREATE INDEX "PublicPublication_category_published_createdAt_idx" ON "PublicPublication"("category", "published", "createdAt");
CREATE INDEX "PublicPublication_authorId_idx" ON "PublicPublication"("authorId");

ALTER TABLE "PublicPublication" ADD CONSTRAINT "PublicPublication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
