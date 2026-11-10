UPDATE "messages" SET "text" = left("text", 219) || '…' WHERE char_length("text") > 220;--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_text_length";--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "due_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "visible_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_text_length" CHECK (char_length("messages"."text") <= 220);