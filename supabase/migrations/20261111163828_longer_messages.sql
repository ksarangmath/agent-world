ALTER TABLE "messages" DROP CONSTRAINT "messages_text_length";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_text_length" CHECK (char_length("messages"."text") <= 300);