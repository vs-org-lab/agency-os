ALTER TABLE "retainer_extra_requests" ADD CONSTRAINT "retainer_extra_requests_id_client_key" UNIQUE("id","client_id");--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "milestone_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "retainer_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "retainer_month" date;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "retainer_extra_request_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_retainer_client_fk" FOREIGN KEY ("retainer_id","client_id") REFERENCES "public"."retainers"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_retainer_extra_client_fk" FOREIGN KEY ("retainer_extra_request_id","client_id") REFERENCES "public"."retainer_extra_requests"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_retainer_month_key" UNIQUE("retainer_id","retainer_month");--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_retainer_extra_key" UNIQUE("retainer_extra_request_id");--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_origin" CHECK (num_nonnulls("payment_requests"."milestone_id", "payment_requests"."retainer_month", "payment_requests"."retainer_extra_request_id") = 1
          and ("payment_requests"."retainer_month" is null
               or ("payment_requests"."retainer_id" is not null and extract(day from "payment_requests"."retainer_month") = 1))
          and ("payment_requests"."retainer_extra_request_id" is null or "payment_requests"."retainer_id" is not null));
