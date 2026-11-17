CREATE TYPE "public"."metro" AS ENUM('bay', 'austin');--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "metro" "metro" DEFAULT 'bay' NOT NULL;