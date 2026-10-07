-- Stage history ordering: rows written in one transaction share created_at, so reopening a paused
-- deal orders by an identity column instead.

DROP INDEX "deal_stage_changes_deal_created_idx";--> statement-breakpoint
ALTER TABLE "deal_stage_changes" ADD COLUMN "sequence" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "deal_stage_changes_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE INDEX "deal_stage_changes_deal_sequence_idx" ON "deal_stage_changes" USING btree ("deal_id","sequence");