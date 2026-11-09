UPDATE "people" SET "profile" = "profile" || '{"about_me": ""}'::jsonb WHERE NOT "profile" ? 'about_me';--> statement-breakpoint
UPDATE "profile_drafts" SET "profile" = "profile" || '{"about_me": ""}'::jsonb WHERE "profile" IS NOT NULL AND NOT "profile" ? 'about_me';
