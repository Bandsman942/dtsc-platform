ALTER TABLE "User"
ADD COLUMN "avatarStoragePath" TEXT;

CREATE INDEX "User_avatarStoragePath_idx" ON "User"("avatarStoragePath");
