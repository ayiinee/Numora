-- Student delivery uses the ordinary Main API login, not the private IRT login.
-- Keep enrollment/policy fencing, without granting compute visibility to the API.
CREATE FUNCTION public.irt_assert_production_delivery_v1(context uuid, runtime jsonb, resources jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM context_id FROM public.irt_production_authorizations_v1 WHERE context_id=context FOR SHARE;
 IF NOT public.irt_production_authorized_v1(context,runtime,resources) THEN
  RAISE EXCEPTION 'IRT_PRODUCTION_NOT_AUTHORIZED' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.irt_assert_production_delivery_v1(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_assert_production_delivery_v1(uuid,jsonb,jsonb) TO numora_main_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.irt_delivery_assignment_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding public.irt_delivery_bindings_v1; pin jsonb;
BEGIN
 SELECT * INTO binding FROM public.irt_delivery_bindings_v1 WHERE batch_id=NEW.tryout_batch_id FOR SHARE;
 IF binding.batch_id IS NULL THEN RETURN NEW; END IF;
 IF binding.configuration#>>'{runtime,purpose}'='PRODUCTION' THEN
  PERFORM public.irt_assert_production_delivery_v1(binding.context_id,binding.configuration->'runtime',binding.configuration->'resources'); END IF;
 SELECT value INTO pin FROM jsonb_array_elements(binding.configuration->'packages') WHERE value->>'packageId'=NEW.package_id::text;
 IF pin IS NULL THEN RAISE EXCEPTION 'IRT_DELIVERY_PACKAGE_UNBOUND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.student_id::text||':'||binding.context_id::text,71));
 IF NOT EXISTS(SELECT 1 FROM public.assessment_arm_assignments WHERE set_id=binding.arm_set_id AND student_id=NEW.student_id) THEN
  INSERT INTO public.assessment_arm_assignments(set_id,student_id,assigned_arm_id)
   VALUES(binding.arm_set_id,NEW.student_id,(pin->>'armId')::uuid);
 END IF;
 RETURN NEW;
END $$;
