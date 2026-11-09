UPDATE "people" SET "profile" = "profile" || '{"hobbies": []}'::jsonb WHERE NOT "profile" ? 'hobbies';
