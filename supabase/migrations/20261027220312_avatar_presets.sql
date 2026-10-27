UPDATE "people" SET "profile" = jsonb_set("profile", '{avatar}', (profile->'avatar') || jsonb_build_object(
    'build', 'average',
    'face_shape', 'oval',
    'eye_shape', 'almond',
    'eye_color', 'brown',
    'brows', 'medium',
    'nose', 'straight',
    'lips', 'medium',
    'hair_style', CASE profile->'avatar'->>'hair_style'
      WHEN 'long' THEN 'long-straight'
      WHEN 'curly' THEN 'short-curly'
      ELSE profile->'avatar'->>'hair_style' END,
    'facial_hair', CASE profile->'avatar'->>'facial_hair'
      WHEN 'beard' THEN 'full-beard'
      ELSE profile->'avatar'->>'facial_hair' END,
    'glasses', CASE profile->'avatar'->>'glasses'
      WHEN 'glasses' THEN 'square'
      ELSE profile->'avatar'->>'glasses' END
  ))
WHERE NOT ("profile"->'avatar' ? 'build');
--> statement-breakpoint
UPDATE "profile_drafts" SET "profile" = jsonb_set("profile", '{avatar}', (profile->'avatar') || jsonb_build_object(
    'build', 'average',
    'face_shape', 'oval',
    'eye_shape', 'almond',
    'eye_color', 'brown',
    'brows', 'medium',
    'nose', 'straight',
    'lips', 'medium',
    'hair_style', CASE profile->'avatar'->>'hair_style'
      WHEN 'long' THEN 'long-straight'
      WHEN 'curly' THEN 'short-curly'
      ELSE profile->'avatar'->>'hair_style' END,
    'facial_hair', CASE profile->'avatar'->>'facial_hair'
      WHEN 'beard' THEN 'full-beard'
      ELSE profile->'avatar'->>'facial_hair' END,
    'glasses', CASE profile->'avatar'->>'glasses'
      WHEN 'glasses' THEN 'square'
      ELSE profile->'avatar'->>'glasses' END
  ))
WHERE "profile" ? 'avatar' AND NOT ("profile"->'avatar' ? 'build');
