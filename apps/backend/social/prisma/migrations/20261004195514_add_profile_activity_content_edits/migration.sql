ALTER TABLE "Post" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE INDEX "Comment_authorId_createdAt_id_idx"
ON "Comment"("authorId", "createdAt" DESC, "id");
