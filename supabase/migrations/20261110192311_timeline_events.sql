ALTER TYPE "public"."world_event_kind" ADD VALUE 'departed' BEFORE 'arrived';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'looked_around' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'asked' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'was_asked' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'accepted' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'declined' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'was_declined' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'request_expired' BEFORE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'judged_match' BEFORE 'mutual_match';--> statement-breakpoint
ALTER TYPE "public"."world_event_kind" ADD VALUE 'judged_not_a_match' BEFORE 'mutual_match';