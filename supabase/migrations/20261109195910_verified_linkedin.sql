DELETE FROM "profile_drafts";--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD COLUMN "linkedin_url" text NOT NULL;
