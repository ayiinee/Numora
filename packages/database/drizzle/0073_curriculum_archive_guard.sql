CREATE FUNCTION public.package_curriculum_dependencies(package_id uuid, chapter_id uuid, level_id uuid)
RETURNS TABLE (kind text, id uuid) LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  WITH item_scope AS (
    SELECT q.chapter_id, q.subchapter_id, q.primary_competency_id, v.level_id
    FROM public.package_items i
    JOIN public.question_versions v ON v.id = i.question_version_id
    JOIN public.question_variants variant ON variant.id = v.variant_id
    JOIN public.questions q ON q.id = variant.question_id
    WHERE i.package_id = $1
  ), level_scope AS (
    SELECT $3 AS id UNION SELECT i.level_id FROM item_scope i
  ), competency_scope AS (
    SELECT DISTINCT i.primary_competency_id AS id FROM item_scope i
  ), subchapter_scope AS (
    SELECT i.subchapter_id AS id FROM item_scope i
    UNION SELECT c.subchapter_id FROM public.competencies c JOIN competency_scope s ON s.id = c.id
    UNION SELECT l.subchapter_id FROM public.levels l JOIN level_scope s ON s.id = l.id
  ), chapter_scope AS (
    SELECT $2 AS id UNION SELECT i.chapter_id FROM item_scope i
    UNION SELECT s.chapter_id FROM public.subchapters s JOIN subchapter_scope d ON d.id = s.id
  )
  SELECT 'chapters', c.id FROM chapter_scope c WHERE c.id IS NOT NULL
  UNION ALL SELECT 'subchapters', s.id FROM subchapter_scope s WHERE s.id IS NOT NULL
  UNION ALL SELECT 'competencies', c.id FROM competency_scope c WHERE c.id IS NOT NULL
  UNION ALL SELECT 'levels', l.id FROM level_scope l WHERE l.id IS NOT NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION public.guard_curriculum_archive() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE packages text;
BEGIN
  -- UPDATE already holds the same row lock that publication must wait for.
  SELECT string_agg(p.name, ', ' ORDER BY p.name, p.id) INTO packages
  FROM (
    SELECT p.id, left(p.name, 120) AS name FROM public.assessment_packages p
    WHERE p.status = 'PUBLISHED' AND p.assessment_type IN ('PRETEST', 'DRILL', 'TRYOUT') AND EXISTS (
      SELECT 1 FROM public.package_curriculum_dependencies(p.id, p.chapter_id, p.level_id) d
      WHERE d.kind = TG_TABLE_NAME AND d.id = NEW.id
    )
    ORDER BY p.name, p.id LIMIT 5
  ) p;
  IF packages IS NOT NULL THEN
    RAISE EXCEPTION 'Active assessment packages depend on this curriculum'
      USING ERRCODE = '23514', CONSTRAINT = 'curriculum_active_packages', DETAIL = packages;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.assert_package_curriculum_available(package_id uuid, chapter_id uuid, level_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE resource text; archived boolean;
BEGIN
  FOREACH resource IN ARRAY ARRAY['chapters', 'subchapters', 'competencies', 'levels'] LOOP
    -- Read the locked version after any concurrent archive. Do not take package locks in the archive guard.
    EXECUTE format('SELECT coalesce(bool_or(locked.status = ''ARCHIVED''), false) FROM (
      SELECT m.status FROM public.%I m WHERE m.id IN (
        SELECT d.id FROM public.package_curriculum_dependencies($1, $2, $3) d WHERE d.kind = $4
      ) ORDER BY m.id FOR SHARE
    ) locked', resource) INTO archived USING package_id, chapter_id, level_id, resource;
    IF archived THEN
      RAISE EXCEPTION 'Assessment package depends on archived curriculum'
        USING ERRCODE = '23514', CONSTRAINT = 'package_archived_curriculum';
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_package_curriculum_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'PUBLISHED' OR NEW.assessment_type NOT IN ('PRETEST', 'DRILL', 'TRYOUT') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN RETURN NEW; END IF;
  PERFORM public.assert_package_curriculum_available(NEW.id, NEW.chapter_id, NEW.level_id);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_published_package_item_curriculum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE package public.assessment_packages;
BEGIN
  -- The existing item guard locks this package before the insert/update.
  SELECT * INTO STRICT package FROM public.assessment_packages WHERE id = NEW.package_id;
  IF package.status = 'PUBLISHED' AND package.assessment_type IN ('PRETEST', 'DRILL', 'TRYOUT') THEN
    PERFORM public.assert_package_curriculum_available(package.id, package.chapter_id, package.level_id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER curriculum_archive_guard BEFORE UPDATE OF status ON public.chapters
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ARCHIVED')
EXECUTE FUNCTION public.guard_curriculum_archive();
--> statement-breakpoint
CREATE TRIGGER curriculum_archive_guard BEFORE UPDATE OF status ON public.subchapters
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ARCHIVED')
EXECUTE FUNCTION public.guard_curriculum_archive();
--> statement-breakpoint
CREATE TRIGGER curriculum_archive_guard BEFORE UPDATE OF status ON public.competencies
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ARCHIVED')
EXECUTE FUNCTION public.guard_curriculum_archive();
--> statement-breakpoint
CREATE TRIGGER curriculum_archive_guard BEFORE UPDATE OF status ON public.levels
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ARCHIVED')
EXECUTE FUNCTION public.guard_curriculum_archive();
--> statement-breakpoint
CREATE TRIGGER curriculum_publication_guard BEFORE INSERT OR UPDATE OF status ON public.assessment_packages
FOR EACH ROW EXECUTE FUNCTION public.guard_package_curriculum_publication();
--> statement-breakpoint
CREATE TRIGGER curriculum_published_item_guard AFTER INSERT OR UPDATE OF package_id, question_version_id ON public.package_items
FOR EACH ROW EXECUTE FUNCTION public.guard_published_package_item_curriculum();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_curriculum_archive(), public.guard_package_curriculum_publication(),
  public.guard_published_package_item_curriculum(), public.assert_package_curriculum_available(uuid, uuid, uuid),
  public.package_curriculum_dependencies(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.package_curriculum_dependencies(uuid, uuid, uuid),
  public.assert_package_curriculum_available(uuid, uuid, uuid) TO numora_main_runtime;
