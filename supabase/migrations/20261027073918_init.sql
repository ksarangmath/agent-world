CREATE TYPE "public"."delivery_mode" AS ENUM('queued', 'steering');--> statement-breakpoint
CREATE TYPE "public"."owner_message_direction" AS ENUM('to_owner', 'to_agent');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('match', 'not_a_match');--> statement-breakpoint
CREATE TYPE "public"."world_event_kind" AS ENUM('arrived', 'conversation_started', 'conversation_ended', 'mutual_match');--> statement-breakpoint
CREATE TABLE "conversation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"place_id" text NOT NULL,
	"opener" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_requests_opener_length" CHECK (char_length("conversation_requests"."opener") <= 280)
);
--> statement-breakpoint
ALTER TABLE "conversation_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_a" uuid NOT NULL,
	"person_b" uuid NOT NULL,
	"place_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"end_reason" text,
	CONSTRAINT "conversations_ordered_pair" CHECK ("conversations"."person_a" < "conversations"."person_b"),
	CONSTRAINT "conversations_end_reason_length" CHECK (char_length("conversations"."end_reason") <= 300)
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "deliveries_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"person_id" uuid NOT NULL,
	"actor_id" uuid,
	"mode" "delivery_mode" NOT NULL,
	"text" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "handled_tool_calls" (
	"tool_call_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handled_tool_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"about_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"verdict" "verdict" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impressions_reason_length" CHECK (char_length("impressions"."reason") <= 300)
);
--> statement-breakpoint
ALTER TABLE "impressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_text_length" CHECK (char_length("messages"."text") <= 500)
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "owner_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "owner_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"person_id" uuid NOT NULL,
	"direction" "owner_message_direction" NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_messages_text_length" CHECK (char_length("owner_messages"."text") <= 500)
);
--> statement-breakpoint
ALTER TABLE "owner_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile" jsonb NOT NULL,
	"agent_id" text,
	"memory_store_id" text,
	"place_id" text,
	"tile_x" integer,
	"tile_y" integer,
	"trip_from_x" integer,
	"trip_from_y" integer,
	"departed_at" timestamp with time zone,
	"arrives_at" timestamp with time zone,
	"conversation_id" uuid,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_nudged_at" timestamp with time zone,
	"profile_version" integer DEFAULT 0 NOT NULL,
	"config_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "people_agentId_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profile_drafts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"builder_agent_id" text,
	"links" jsonb NOT NULL,
	"profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_drafts_builderAgentId_unique" UNIQUE("builder_agent_id")
);
--> statement-breakpoint
ALTER TABLE "profile_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "world_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "world_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"person_id" uuid NOT NULL,
	"kind" "world_event_kind" NOT NULL,
	"place_id" text,
	"other_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_events_note_length" CHECK (char_length("world_events"."note") <= 300)
);
--> statement-breakpoint
ALTER TABLE "world_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_requests" ADD CONSTRAINT "conversation_requests_from_id_people_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_requests" ADD CONSTRAINT "conversation_requests_to_id_people_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_person_a_people_id_fk" FOREIGN KEY ("person_a") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_person_b_people_id_fk" FOREIGN KEY ("person_b") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ended_by_people_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_about_id_people_id_fk" FOREIGN KEY ("about_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_people_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_messages" ADD CONSTRAINT "owner_messages_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD CONSTRAINT "profile_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_other_id_people_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_requests_one_pending" ON "conversation_requests" USING btree ("from_id") WHERE "conversation_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "conversation_requests_pending_to" ON "conversation_requests" USING btree ("to_id") WHERE "conversation_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "conversation_requests_pending_expiry" ON "conversation_requests" USING btree ("expires_at") WHERE "conversation_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "conversations_pair" ON "conversations" USING btree ("person_a","person_b","started_at");--> statement-breakpoint
CREATE INDEX "conversations_person_b" ON "conversations" USING btree ("person_b","started_at");--> statement-breakpoint
CREATE INDEX "conversations_active_last_message" ON "conversations" USING btree ("last_message_at") WHERE "conversations"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "deliveries_pending" ON "deliveries" USING btree ("person_id","sequence") WHERE "deliveries"."delivered_at" is null;--> statement-breakpoint
CREATE INDEX "handled_tool_calls_unposted" ON "handled_tool_calls" USING btree ("due_at") WHERE "handled_tool_calls"."posted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "impressions_one_per_conversation" ON "impressions" USING btree ("owner_id","conversation_id");--> statement-breakpoint
CREATE INDEX "impressions_about" ON "impressions" USING btree ("about_id","owner_id");--> statement-breakpoint
CREATE INDEX "messages_conversation" ON "messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "owner_messages_person" ON "owner_messages" USING btree ("person_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_tile" ON "people" USING btree ("place_id","tile_x","tile_y");--> statement-breakpoint
CREATE INDEX "world_events_person" ON "world_events" USING btree ("person_id","id");--> statement-breakpoint
CREATE POLICY "impressions_select_own" ON "impressions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("impressions"."owner_id" in (select "people"."id" from "people" where "people"."user_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "owner_messages_select_own" ON "owner_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("owner_messages"."person_id" in (select "people"."id" from "people" where "people"."user_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "people_select_own" ON "people" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("people"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profile_drafts_select_own" ON "profile_drafts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profile_drafts"."user_id" = (select auth.uid()));