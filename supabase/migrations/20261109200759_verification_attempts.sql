CREATE TABLE "verification_attempts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"since" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;