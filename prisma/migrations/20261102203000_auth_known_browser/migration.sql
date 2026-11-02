CREATE TABLE "AuthKnownBrowser" (
 "id" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "tokenHash" TEXT NOT NULL,
 "agentLabel" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "notificationAt" TIMESTAMP(3),
 "trustedAt" TIMESTAMP(3),
 "trustedUntil" TIMESTAMP(3),
 "revokedAt" TIMESTAMP(3),
 CONSTRAINT "AuthKnownBrowser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthKnownBrowser_tokenHash_key" ON "AuthKnownBrowser"("tokenHash");
CREATE INDEX "AuthKnownBrowser_userId_revokedAt_lastSeenAt_idx"
 ON "AuthKnownBrowser"("userId","revokedAt","lastSeenAt");
ALTER TABLE "AuthKnownBrowser" ADD CONSTRAINT "AuthKnownBrowser_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
