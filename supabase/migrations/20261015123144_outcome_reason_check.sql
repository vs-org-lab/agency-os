ALTER TABLE "project_outcomes" DROP CONSTRAINT "project_outcomes_reason";--> statement-breakpoint
ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_reason" CHECK (case "project_outcomes"."guarantee_status"
            when 'pending' then "project_outcomes"."guarantee_reason" is null
            when 'active' then "project_outcomes"."guarantee_reason" is null
            when 'not_activated'
              then coalesce("project_outcomes"."guarantee_reason"::text, '') in ('target_met', 'conditions_failed')
            else coalesce("project_outcomes"."guarantee_reason"::text, '') in ('target_met', 'months_used')
          end);