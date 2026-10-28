UPDATE "people" SET "profile" = jsonb_set("profile", '{avatar}', ((profile->'avatar') - 'build' - 'face_shape' - 'eye_shape' - 'brows' - 'nose' - 'lips') || jsonb_build_object('gender', coalesce(profile->'avatar'->>'gender', 'male')))
WHERE "profile" ? 'avatar';
--> statement-breakpoint
UPDATE "profile_drafts" SET "profile" = jsonb_set("profile", '{avatar}', ((profile->'avatar') - 'build' - 'face_shape' - 'eye_shape' - 'brows' - 'nose' - 'lips') || jsonb_build_object('gender', coalesce(profile->'avatar'->>'gender', 'male')))
WHERE "profile" ? 'avatar';
