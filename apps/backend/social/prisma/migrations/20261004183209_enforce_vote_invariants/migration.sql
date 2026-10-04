ALTER TABLE "Vote"
ADD CONSTRAINT "Vote_value_check" CHECK ("value" IN (-1, 1)),
ADD CONSTRAINT "Vote_target_check" CHECK (num_nonnulls("postId", "commentId") = 1);
