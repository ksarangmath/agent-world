DROP INDEX "world_events_person";--> statement-breakpoint
CREATE INDEX "world_events_person" ON "world_events" USING btree ("person_id","created_at","id");