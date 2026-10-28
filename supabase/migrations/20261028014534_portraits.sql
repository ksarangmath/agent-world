ALTER TABLE "people" ADD COLUMN "portrait" "bytea";--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD COLUMN "portrait" "bytea";--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD COLUMN "portrait_claimed_at" timestamp with time zone;