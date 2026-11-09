REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
