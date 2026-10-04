CREATE INDEX "Comment_postId_parentId_score_createdAt_id_idx"
ON "Comment"("postId", "parentId", "score" DESC, "createdAt", "id");
