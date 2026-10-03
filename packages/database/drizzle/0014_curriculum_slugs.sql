-- Expand, backfill, then constrain. Existing UUIDs/codes and references are preserved.
ALTER TABLE "chapters" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "subchapters" ADD COLUMN "slug" text;--> statement-breakpoint
-- Reserve a UUID suffix for every repeated normalized name, independently of row order.
WITH normalized AS (
  SELECT id, coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'chapter') AS base
  FROM chapters
), candidates AS (
  SELECT id, base, count(*) OVER (PARTITION BY base) AS matches FROM normalized
)
UPDATE chapters c SET slug = CASE WHEN x.matches > 1 THEN x.base || '-' || x.id::text ELSE x.base END
FROM candidates x WHERE c.id = x.id;--> statement-breakpoint
WITH normalized AS (
  SELECT id, chapter_id, coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'subchapter') AS base
  FROM subchapters
), candidates AS (
  SELECT id, base, count(*) OVER (PARTITION BY chapter_id, base) AS matches FROM normalized
)
UPDATE subchapters s SET slug = CASE WHEN x.matches > 1 THEN x.base || '-' || x.id::text ELSE x.base END
FROM candidates x WHERE s.id = x.id;--> statement-breakpoint
-- Abort on remaining collisions; do not silently merge records or rewrite their IDs.
ALTER TABLE "chapters" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subchapters" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_slug_uq" ON "chapters" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "subchapters_chapter_slug_uq" ON "subchapters" USING btree ("chapter_id","slug");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_slug_ck" CHECK ("chapters"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "subchapters" ADD CONSTRAINT "subchapters_slug_ck" CHECK ("subchapters"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
