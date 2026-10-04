-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MEMBER', 'MODERATOR', 'OWNER');

-- CreateTable
CREATE TABLE "Membership" (
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","communityId")
);

-- CreateIndex
CREATE INDEX "Membership_communityId_idx" ON "Membership"("communityId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
