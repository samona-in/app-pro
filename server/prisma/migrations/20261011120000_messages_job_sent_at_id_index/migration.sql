-- Extend the thread index to (job_id, sent_at, id) so the chat read is covered
-- end to end. `listForParty` orders by `(sent_at, id)` and windows older pages
-- on the anchor's `(sent_at, id)`; without `id` in the index every equal-`sent_at`
-- tie group is re-sorted to break ties.
--
-- The old (job_id, sent_at) index is a prefix of the new one, so it is replaced
-- rather than kept — every query it served is still covered by the wider index.

-- DropIndex
DROP INDEX "messages_job_id_sent_at_idx";

-- CreateIndex
CREATE INDEX "messages_job_id_sent_at_id_idx" ON "messages"("job_id", "sent_at", "id");
