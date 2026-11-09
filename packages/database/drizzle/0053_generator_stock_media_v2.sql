-- Main-owned inventory/reservations; AI-owned immutable byte artifacts.
CREATE TABLE public.generator_stock_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL REFERENCES public.questions(id),
 original_question_version_id uuid NOT NULL REFERENCES public.question_versions(id), version integer NOT NULL CHECK(version>0),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), definition jsonb NOT NULL,
 item_count integer NOT NULL CHECK(item_count BETWEEN 1 AND 4), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(family_id,version), UNIQUE(id,digest)
);
CREATE TABLE public.generator_stock_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stock_set_id uuid NOT NULL REFERENCES public.generator_stock_sets(id),
 wave_item_id uuid NOT NULL UNIQUE REFERENCES public.generation_wave_items(id),
 ordinal bigint NOT NULL CHECK(ordinal>0), stock_index integer NOT NULL CHECK(stock_index>0),
 cycle integer NOT NULL CHECK(cycle>0), reused boolean NOT NULL, stock_variant_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(stock_set_id,ordinal)
);
CREATE TABLE public.generator_stock_reservation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES public.generator_stock_reservations(id),
 state text NOT NULL CHECK(state IN ('RESERVED','SUCCEEDED','FAILED','CANCELLED')), reason text NOT NULL,
 event_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE FUNCTION public.generator_stock_set_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Stock set is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.digest IS DISTINCT FROM irt_compute.payload_digest(NEW.definition) OR
    jsonb_array_length(NEW.definition->'items') IS DISTINCT FROM NEW.item_count OR NOT EXISTS
    (SELECT 1 FROM public.question_versions q JOIN public.question_variants v ON v.id=q.variant_id
      WHERE q.id=NEW.original_question_version_id AND v.question_id=NEW.family_id AND v.kind='ORIGINAL') THEN
  RAISE EXCEPTION 'Stock set source/digest/inventory mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generator_stock_set_guard BEFORE INSERT OR UPDATE OR DELETE ON public.generator_stock_sets FOR EACH ROW EXECUTE FUNCTION public.generator_stock_set_guard();
CREATE TRIGGER generator_stock_reservations_immutable BEFORE UPDATE OR DELETE ON public.generator_stock_reservations FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
CREATE TRIGGER generator_stock_events_immutable BEFORE UPDATE OR DELETE ON public.generator_stock_reservation_events FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
--> statement-breakpoint
CREATE FUNCTION public.reserve_generator_stock(p_set uuid,p_wave uuid) RETURNS public.generator_stock_reservations LANGUAGE plpgsql AS $$
DECLARE inventory public.generator_stock_sets; existing public.generator_stock_reservations; n bigint; idx integer;
BEGIN
 SELECT * INTO inventory FROM public.generator_stock_sets WHERE id=p_set FOR UPDATE;
 IF inventory.id IS NULL THEN RAISE EXCEPTION 'Stock set not found' USING ERRCODE='23514'; END IF;
 SELECT * INTO existing FROM public.generator_stock_reservations WHERE wave_item_id=p_wave;
 IF existing.id IS NOT NULL THEN
  IF existing.stock_set_id<>p_set THEN RAISE EXCEPTION 'Reservation cannot change stock set' USING ERRCODE='23514'; END IF;
  RETURN existing;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.generation_wave_items w JOIN irt_compute.generator_configs g ON g.id=w.generator_config_id
   WHERE w.id=p_wave AND w.original_question_version_id=inventory.original_question_version_id AND
    g.parameters->>'serviceContract'='generator-service-v2' AND g.parameters->>'mode'='CONCEPTUAL_STOCK'
    AND g.parameters->>'stockSetId'=inventory.id::text AND g.parameters->>'stockSetDigest'=inventory.digest) THEN
  RAISE EXCEPTION 'Reservation mapping pins mismatch' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(ordinal),0)+1 INTO n FROM public.generator_stock_reservations WHERE stock_set_id=p_set;
 idx:=((n-1)%inventory.item_count)+1;
 INSERT INTO public.generator_stock_reservations(stock_set_id,wave_item_id,ordinal,stock_index,cycle,reused,stock_variant_id)
  VALUES(p_set,p_wave,n,idx,((n-1)/inventory.item_count)+1,n>inventory.item_count,
   inventory.definition->'items'->(idx-1)->>'variantId') RETURNING * INTO existing;
 INSERT INTO public.generator_stock_reservation_events(reservation_id,state,reason,event_key) VALUES(existing.id,'RESERVED','request allocated',existing.id::text||':reserved');
 RETURN existing;
END $$;
--> statement-breakpoint
-- Direct INSERT must use the same serialized ordinal allocator; grants do not allow bypass.
REVOKE ALL ON FUNCTION public.reserve_generator_stock(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE irt_compute.generator_media_artifacts (
 execution_id uuid NOT NULL REFERENCES irt_compute.compute_executions(id),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), png_bytes bytea NOT NULL,
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 5242880),
 width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
 provenance jsonb NOT NULL, sealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(execution_id,sha256), CHECK(octet_length(png_bytes)=byte_length),
 CHECK(encode(sha256(png_bytes),'hex')=sha256),
 CHECK(substring(png_bytes from 1 for 8)=decode('89504e470d0a1a0a','hex'))
);
CREATE FUNCTION irt_compute.generator_media_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Compute media artifact is immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM irt_compute.compute_executions e WHERE e.id=NEW.execution_id AND e.status='RUNNING'
   AND e.lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'Media requires live execution lease' USING ERRCODE='23514'; END IF;
 IF NEW.provenance->>'png_sha256' IS DISTINCT FROM NEW.sha256 THEN RAISE EXCEPTION 'Media provenance mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generator_media_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.generator_media_artifacts FOR EACH ROW EXECUTE FUNCTION irt_compute.generator_media_guard();
--> statement-breakpoint
CREATE VIEW public.irt_input_stock_sets_v2 AS SELECT * FROM public.generator_stock_sets;
CREATE VIEW public.irt_input_stock_reservations_v2 AS SELECT * FROM public.generator_stock_reservations;
--> statement-breakpoint
ALTER TABLE irt_compute.generation_runs ALTER COLUMN random_seed DROP NOT NULL;
ALTER TABLE irt_compute.generation_runs ADD COLUMN generation_mode text NOT NULL DEFAULT 'NUMERIC'
 CHECK(generation_mode IN ('NUMERIC','CONCEPTUAL_STOCK'));
ALTER TABLE irt_compute.generation_runs ADD COLUMN stock_reservation_id uuid REFERENCES public.generator_stock_reservations(id);
ALTER TABLE irt_compute.generation_runs ADD CONSTRAINT generation_runs_mode_pins_ck CHECK
 ((generation_mode='NUMERIC' AND random_seed IS NOT NULL AND stock_reservation_id IS NULL) OR
  (generation_mode='CONCEPTUAL_STOCK' AND random_seed IS NULL AND stock_reservation_id IS NOT NULL));
ALTER TABLE irt_compute.generation_candidates DROP CONSTRAINT generation_candidates_payload_ck;
ALTER TABLE irt_compute.generation_candidates ADD CONSTRAINT generation_candidates_payload_ck CHECK
 (candidate_question_version_id IS NOT NULL OR (payload IS NOT NULL AND payload_digest IS NOT NULL
  AND parameter_values IS NOT NULL AND parent_original_question_version_id IS NOT NULL AND
  (random_seed IS NOT NULL OR parameter_values->>'stockReservationId' IS NOT NULL)));
CREATE FUNCTION irt_compute.generator_stock_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.generation_mode='CONCEPTUAL_STOCK' AND NOT EXISTS(SELECT 1 FROM public.irt_input_stock_reservations_v2 s
   JOIN public.irt_input_stock_sets_v2 inventory ON inventory.id=s.stock_set_id
   JOIN irt_compute.generator_configs g ON g.id=NEW.config_id
   WHERE s.id=NEW.stock_reservation_id AND s.wave_item_id=NEW.wave_item_id
    AND inventory.original_question_version_id=NEW.original_question_version_id
    AND g.parameters->>'stockSetDigest'=inventory.digest
    AND NEW.parameter_values->>'stockReservationId'=s.id::text
    AND NEW.parameter_values->>'stockVariantId'=s.stock_variant_id
    AND (NEW.parameter_values->>'cycle')::integer=s.cycle
    AND (NEW.parameter_values->>'reused')::boolean=s.reused
    AND NEW.parameter_values->>'stockSetId'=inventory.id::text
    AND NEW.parameter_values->>'stockSetDigest'=inventory.digest
    AND NOT (NEW.parameter_values ?| ARRAY['seed','configVersion','configHash'])) THEN
  RAISE EXCEPTION 'Stock run must retain reserved wave/source/inventory pins' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generator_stock_run_guard BEFORE INSERT ON irt_compute.generation_runs FOR EACH ROW EXECUTE FUNCTION irt_compute.generator_stock_run_guard();
--> statement-breakpoint
ALTER TABLE public.generator_stock_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_stock_reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE irt_compute.generator_media_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_runtime ON public.generator_stock_sets TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_runtime ON public.generator_stock_reservations TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_runtime ON public.generator_stock_reservation_events TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_runtime ON irt_compute.generator_media_artifacts FOR SELECT TO numora_main_runtime USING(true);
CREATE POLICY compute_runtime ON irt_compute.generator_media_artifacts TO numora_irt_runtime USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON public.generator_stock_sets TO numora_main_runtime;
GRANT SELECT ON public.generator_stock_reservation_events TO numora_main_runtime;
GRANT SELECT ON public.generator_stock_reservations TO numora_main_runtime;
GRANT SELECT,INSERT ON irt_compute.generator_media_artifacts TO numora_irt_runtime;
GRANT SELECT ON irt_compute.generator_media_artifacts TO numora_main_runtime;
GRANT SELECT ON public.irt_input_stock_sets_v2,public.irt_input_stock_reservations_v2 TO numora_irt_runtime;
-- Definer allocator is constrained by exact mapping pins and a fixed search path.
ALTER FUNCTION public.reserve_generator_stock(uuid,uuid) SECURITY DEFINER;
ALTER FUNCTION public.reserve_generator_stock(uuid,uuid) SET search_path=pg_catalog,public;
GRANT EXECUTE ON FUNCTION public.reserve_generator_stock(uuid,uuid) TO numora_main_runtime;
--> statement-breakpoint
-- Append lifecycle evidence atomically with the authoritative transition, including
-- failures before a generation_run exists. Runtime roles cannot forge ledger rows.
CREATE FUNCTION public.generator_stock_lifecycle_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $$
DECLARE reservation uuid; event_state text; request_key uuid;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF TG_TABLE_SCHEMA='irt_compute' THEN
  request_key:=NEW.request_id;
  event_state:=CASE WHEN NEW.status='SUCCEEDED' THEN 'SUCCEEDED' WHEN NEW.status IN ('FAILED','EXPIRED') THEN 'FAILED' ELSE NULL END;
 ELSE
  request_key:=NEW.id;
  event_state:=CASE WHEN NEW.status='CANCELLED' THEN 'CANCELLED' ELSE NULL END;
 END IF;
 IF event_state IS NULL THEN RETURN NEW; END IF;
 SELECT s.id INTO reservation FROM public.generator_stock_reservations s
  JOIN public.analysis_requests r ON r.wave_item_id=s.wave_item_id WHERE r.id=request_key;
 IF reservation IS NOT NULL THEN
  INSERT INTO public.generator_stock_reservation_events(reservation_id,state,reason,event_key)
   VALUES(reservation,event_state,'authoritative '||TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME||' transition',NEW.id::text||':'||NEW.status)
   ON CONFLICT(event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.generator_stock_lifecycle_event() FROM PUBLIC;
CREATE TRIGGER generator_stock_execution_event AFTER UPDATE OF status ON irt_compute.compute_executions
 FOR EACH ROW EXECUTE FUNCTION public.generator_stock_lifecycle_event();
CREATE TRIGGER generator_stock_cancel_event AFTER UPDATE OF status ON public.analysis_requests
 FOR EACH ROW EXECUTE FUNCTION public.generator_stock_lifecycle_event();
--> statement-breakpoint
CREATE TABLE public.generator_candidate_materializations (
 candidate_id uuid PRIMARY KEY REFERENCES irt_compute.generation_candidates(id),
 source_fingerprint text NOT NULL, canonical_payload jsonb NOT NULL,
 receipt_ids uuid[] NOT NULL, actor_user_id uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.generator_candidate_materializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_runtime ON public.generator_candidate_materializations TO numora_main_runtime USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON public.generator_candidate_materializations TO numora_main_runtime;
CREATE FUNCTION public.generator_materialization_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c irt_compute.generation_candidates; asset jsonb; original_asset jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Materialization is immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM irt_compute.generation_candidates WHERE id=NEW.candidate_id;
 IF NEW.source_fingerprint IS DISTINCT FROM c.payload->>'contentFingerprint' OR
    (NEW.canonical_payload-ARRAY['media','contentFingerprint']) IS DISTINCT FROM (c.payload-ARRAY['media','contentFingerprint']) OR
    jsonb_array_length(NEW.canonical_payload->'media') IS DISTINCT FROM jsonb_array_length(c.payload->'media') OR
    cardinality(NEW.receipt_ids) IS DISTINCT FROM jsonb_array_length(c.payload->'media') THEN
  RAISE EXCEPTION 'Materialization must preserve candidate content and media cardinality' USING ERRCODE='23514'; END IF;
 FOR asset IN SELECT * FROM jsonb_array_elements(NEW.canonical_payload->'media') LOOP
  SELECT x INTO original_asset FROM jsonb_array_elements(c.payload->'media') x WHERE x->>'assetId'=asset->>'assetId';
  IF original_asset IS NULL OR EXISTS(SELECT 1 FROM unnest(ARRAY['sha256','byteLength','contentType','placement','altText']) k WHERE original_asset->k IS DISTINCT FROM asset->k) OR
     asset->>'textMarker' IS DISTINCT FROM '[[asset:'||(asset->>'assetId')||']]' OR
     NOT EXISTS(SELECT 1 FROM public.content_media_uploads u WHERE u.id=ANY(NEW.receipt_ids)
       AND u.status='VERIFIED' AND u.actor_user_id=NEW.actor_user_id AND u.asset_id=asset->>'assetId'
       AND u.external_id=asset->>'externalId' AND u.bucket=asset->>'bucket' AND u.object_key=asset->>'objectKey'
       AND u.sha256=asset->>'sha256' AND u.byte_length=(asset->>'byteLength')::integer AND u.content_type=asset->>'contentType') THEN
   RAISE EXCEPTION 'Materialization requires exact verified storage receipts' USING ERRCODE='23514'; END IF;
 END LOOP;
 PERFORM public.measurement_assert_adopted((SELECT o.id FROM irt_compute.compute_outputs o JOIN irt_compute.generation_runs r ON r.execution_id=o.execution_id WHERE r.id=c.generation_run_id AND o.kind='GENERATE_VARIANTS' LIMIT 1));
 RETURN NEW;
END $$;
CREATE TRIGGER generator_materialization_guard BEFORE INSERT OR UPDATE OR DELETE ON public.generator_candidate_materializations FOR EACH ROW EXECUTE FUNCTION public.generator_materialization_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_import_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c irt_compute.generation_candidates; q public.question_versions; r irt_compute.generation_runs; actual jsonb;
BEGIN
 SELECT * INTO c FROM irt_compute.generation_candidates WHERE id=NEW.candidate_id;
 SELECT * INTO q FROM public.question_versions WHERE id=NEW.question_version_id;
 SELECT * INTO r FROM irt_compute.generation_runs WHERE id=c.generation_run_id;
 IF c.payload_digest IS DISTINCT FROM NEW.payload_digest OR c.parent_original_question_version_id IS DISTINCT FROM q.parent_original_question_version_id THEN RAISE EXCEPTION 'Import digest/lineage must match candidate' USING ERRCODE='23514'; END IF;
 actual:=jsonb_build_object('questionType',q.question_type,'stem',q.stem,'optionsOrStatements',q.options_or_statements,'answerKey',q.answer_key,'explanation',q.explanation,'media',q.media,'difficulty',q.difficulty,'rubricVersionId',q.scoring_rubric_version_id,'contentFingerprint',q.content_fingerprint);
 IF actual IS DISTINCT FROM c.payload AND NOT EXISTS(SELECT 1 FROM public.generator_candidate_materializations m WHERE m.candidate_id=c.id AND m.source_fingerprint=c.payload->>'contentFingerprint' AND m.canonical_payload=actual) THEN
  RAISE EXCEPTION 'Import must preserve actual candidate content/rubric' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.analysis_requests WHERE accepted_execution_id=r.execution_id AND status='COMPLETED') THEN RAISE EXCEPTION 'Import requires adopted execution' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM irt_compute.compute_outputs WHERE execution_id=r.execution_id AND kind='GENERATE_VARIANTS' AND payload->'candidateIds' ? NEW.candidate_id::text) THEN RAISE EXCEPTION 'Import must be listed in the adopted generation artifact' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
