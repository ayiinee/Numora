CREATE TABLE "tryout_allocation_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"school_id" uuid
);
--> statement-breakpoint
ALTER TABLE "tryout_allocation_pools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tryout_pool_packages" (
	"pool_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	CONSTRAINT "tryout_pool_packages_pool_id_package_id_pk" PRIMARY KEY("pool_id","package_id")
);
--> statement-breakpoint
ALTER TABLE "tryout_pool_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tryout_wave_packages" (
	"wave_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	CONSTRAINT "tryout_wave_packages_wave_id_package_id_pk" PRIMARY KEY("wave_id","package_id")
);
--> statement-breakpoint
ALTER TABLE "tryout_wave_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tryout_waves" ALTER COLUMN "variant_package_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tryout_allocation_pools" ADD CONSTRAINT "tryout_allocation_pools_batch_id_tryout_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tryout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_allocation_pools" ADD CONSTRAINT "tryout_allocation_pools_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_pool_id_batch_uq" ON "tryout_allocation_pools" USING btree ("id","batch_id");
--> statement-breakpoint
ALTER TABLE "tryout_pool_packages" ADD CONSTRAINT "tryout_pool_packages_pool_id_batch_id_tryout_allocation_pools_id_batch_id_fk" FOREIGN KEY ("pool_id","batch_id") REFERENCES "public"."tryout_allocation_pools"("id","batch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_pool_packages" ADD CONSTRAINT "tryout_pool_packages_batch_id_package_id_tryout_batch_packages_batch_id_package_id_fk" FOREIGN KEY ("batch_id","package_id") REFERENCES "public"."tryout_batch_packages"("batch_id","package_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_wave_packages" ADD CONSTRAINT "tryout_wave_packages_wave_id_tryout_waves_id_fk" FOREIGN KEY ("wave_id") REFERENCES "public"."tryout_waves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_wave_packages" ADD CONSTRAINT "tryout_wave_packages_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_pool_school_uq" ON "tryout_allocation_pools" USING btree ("batch_id","school_id") WHERE "tryout_allocation_pools"."school_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_pool_mandiri_uq" ON "tryout_allocation_pools" USING btree ("batch_id") WHERE "tryout_allocation_pools"."school_id" is null;--> statement-breakpoint

--> statement-breakpoint
-- One technical gate for upload, generated/revised packages, publication and starts.
CREATE FUNCTION public.tryout_package_issues(target uuid)
RETURNS TABLE(code text, question_number integer, field text, message text)
LANGUAGE plpgsql STABLE AS $$
DECLARE p public.assessment_packages; r record; opts jsonb; cats jsonb; ids text[]; catids text[];
  bad boolean; a jsonb; x jsonb; placement record; marker text[]; assets jsonb;
BEGIN
 SELECT * INTO p FROM public.assessment_packages WHERE id=target;
 IF NOT FOUND OR p.assessment_type<>'TRYOUT' OR p.purpose<>'REGULAR' THEN
   RETURN QUERY SELECT 'PACKAGE'::text,NULL::integer,'package'::text,'Paket Tryout reguler tidak ditemukan.'::text; RETURN;
 END IF;
 IF p.status='ARCHIVED' THEN RETURN QUERY SELECT 'ARCHIVED',NULL::integer,'package','Paket sudah diarsipkan.'; END IF;
 IF p.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM public.scoring_policy_versions s WHERE s.id=p.scoring_policy_version_id AND s.status='PUBLISHED') THEN
   RETURN QUERY SELECT 'SCORING',NULL::integer,'scoringPolicy','Policy penilaian yang didukung harus tersedia dan terbit.';
 END IF;
 IF (SELECT count(*) FROM public.package_items WHERE package_id=target)<>30 THEN
   RETURN QUERY SELECT 'COUNT',NULL::integer,'items','Paket wajib berisi tepat 30 soal.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.package_items WHERE package_id=target GROUP BY question_version_id HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM (SELECT display_order,row_number() OVER(ORDER BY display_order) AS n FROM public.package_items WHERE package_id=target) s WHERE display_order<>n) THEN
   RETURN QUERY SELECT 'ORDER',NULL::integer,'items','Urutan harus 1-30 tanpa versi soal duplikat.';
 END IF;
 FOR r IN SELECT i.display_order,i.rubric_version_id,i.max_points,v.*,q.status AS question_status
   FROM public.package_items i JOIN public.question_versions v ON v.id=i.question_version_id
   JOIN public.question_variants a ON a.id=v.variant_id JOIN public.questions q ON q.id=a.question_id
   WHERE i.package_id=target ORDER BY i.display_order LOOP
   question_number:=r.display_order;
   IF r.content_status='ARCHIVED' OR r.question_status='ARCHIVED' THEN
     code:='ARCHIVED'; field:='question'; message:='Soal sudah diarsipkan.'; RETURN NEXT;
   END IF;
   IF r.question_type NOT IN ('SINGLE_CHOICE','MULTIPLE_CHOICE_MULTIPLE_ANSWER','CATEGORY') THEN
     code:='TYPE'; field:='type'; message:='Jenis soal tidak didukung.'; RETURN NEXT; CONTINUE;
   END IF;
   FOREACH field IN ARRAY ARRAY['stem','explanation'] LOOP
     x:=CASE field WHEN 'stem' THEN r.stem ELSE r.explanation END;
     IF jsonb_typeof(x)<>'object' OR jsonb_typeof(x->'text') IS DISTINCT FROM 'string'
       OR length(trim(coalesce(x->>'text','')))=0 THEN
       code:='REQUIRED'; message:=CASE field WHEN 'stem' THEN 'Isi soal wajib terbaca.' ELSE 'Pembahasan wajib terisi.' END; RETURN NEXT;
     END IF;
   END LOOP;
   opts:=CASE WHEN jsonb_typeof(r.options_or_statements)='array' THEN r.options_or_statements ELSE r.options_or_statements->'options' END;
   IF jsonb_typeof(opts) IS DISTINCT FROM 'array' THEN
     code:='OPTIONS'; field:='options'; message:='Format pilihan/pernyataan tidak valid.'; RETURN NEXT; CONTINUE;
   END IF;
   IF jsonb_array_length(opts)<2 THEN
     code:='OPTIONS'; field:='options'; message:='Pilihan/pernyataan wajib lengkap.'; RETURN NEXT; CONTINUE;
   END IF;
   SELECT array_agg(o->>'id'), bool_or(jsonb_typeof(o->'id') IS DISTINCT FROM 'string' OR trim(coalesce(o->>'id',''))=''
     OR jsonb_typeof(o->'content'->'text') IS DISTINCT FROM 'string' OR trim(coalesce(o->'content'->>'text',''))='')
     INTO ids,bad FROM jsonb_array_elements(opts) o;
   IF bad OR cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN
     code:='OPTIONS'; field:='options'; message:='ID pilihan harus unik dan isi pilihan wajib terbaca.'; RETURN NEXT;
   END IF;
   a:=r.answer_key; bad:=false;
   IF r.question_type='SINGLE_CHOICE' THEN
     bad:=jsonb_typeof(a->'optionId') IS DISTINCT FROM 'string' OR NOT(coalesce(a->>'optionId','')=ANY(ids));
   ELSIF r.question_type='MULTIPLE_CHOICE_MULTIPLE_ANSWER' THEN
     IF jsonb_typeof(a->'optionIds') IS DISTINCT FROM 'array' THEN bad:=true;
     ELSE
       bad:=jsonb_array_length(a->'optionIds')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(a->'optionIds') k WHERE jsonb_typeof(k)<>'string' OR NOT(k#>>'{}'=ANY(ids)))
         OR jsonb_array_length(a->'optionIds')<>(SELECT count(DISTINCT k) FROM jsonb_array_elements(a->'optionIds') k);
     END IF;
   ELSE
     cats:=r.options_or_statements->'categories';
     IF jsonb_typeof(cats) IS DISTINCT FROM 'array' THEN bad:=true;
     ELSE
       SELECT array_agg(c->>'id'), bool_or(jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR trim(coalesce(c->>'id',''))=''
         OR (jsonb_typeof(c->'label') IS DISTINCT FROM 'string' AND jsonb_typeof(c->'content'->'text') IS DISTINCT FROM 'string')
         OR trim(coalesce(c->>'label',c->'content'->>'text',''))='') INTO catids,bad FROM jsonb_array_elements(cats) c;
       bad:=coalesce(bad,true) OR coalesce(cardinality(catids),0)<2 OR cardinality(catids)<>(SELECT count(DISTINCT id) FROM unnest(catids) id);
       IF jsonb_typeof(a->'categoryByStatementId') IS DISTINCT FROM 'object' THEN bad:=true;
       ELSE bad:=bad OR (SELECT count(*) FROM jsonb_each(a->'categoryByStatementId'))<>cardinality(ids)
         OR EXISTS(SELECT 1 FROM jsonb_each(a->'categoryByStatementId') k WHERE jsonb_typeof(k.value)<>'string' OR NOT(k.key=ANY(ids)) OR NOT(k.value#>>'{}'=ANY(catids)));
       END IF;
     END IF;
   END IF;
   IF jsonb_typeof(a) IS DISTINCT FROM 'object' THEN bad:=true;
   ELSE bad:=bad OR (SELECT count(*) FROM jsonb_object_keys(a))<>1; END IF;
   IF coalesce(bad,true) THEN code:='ANSWER'; field:='answer'; message:='Kunci jawaban tidak cocok dengan pilihan/pernyataan.'; RETURN NEXT; END IF;
   assets:=CASE WHEN jsonb_typeof(r.media)='array' THEN r.media ELSE '[]'::jsonb END;
   IF jsonb_array_length(assets)<>(SELECT count(DISTINCT m->>'assetId') FROM jsonb_array_elements(assets) m) THEN
     code:='MEDIA'; field:='media'; message:='ID gambar wajib unik dan terisi.'; RETURN NEXT;
   END IF;
   IF r.media IS NOT NULL AND jsonb_typeof(r.media)<>'array' THEN
     code:='MEDIA'; field:='media'; message:='Format media tidak valid.'; RETURN NEXT;
   ELSIF r.media IS NOT NULL THEN
     FOR x IN SELECT * FROM jsonb_array_elements(r.media) LOOP
       IF NOT EXISTS(SELECT 1 FROM public.content_media_uploads u WHERE u.status='VERIFIED' AND u.verified_at IS NOT NULL
         AND u.bucket=x->>'bucket' AND u.object_key=x->>'objectKey' AND u.sha256=x->>'sha256'
         AND u.content_type=x->>'contentType' AND u.byte_length::text=x->>'byteLength') THEN
         code:='MEDIA'; field:='media'; message:='Gambar belum tersedia sebagai unggahan terverifikasi.'; RETURN NEXT;
       END IF;
     END LOOP;
   END IF;
   FOR placement IN SELECT r.stem AS content,'STEM' AS location,NULL::text AS item_id
     UNION ALL SELECT r.explanation,'EXPLANATION',NULL::text
     UNION ALL SELECT o->'content',CASE WHEN r.question_type='CATEGORY' THEN 'STATEMENT' ELSE 'OPTION' END,o->>'id' FROM jsonb_array_elements(opts) o LOOP
      IF placement.content ? 'assetKeys' THEN
        IF jsonb_typeof(placement.content->'assetKeys') IS DISTINCT FROM 'array' THEN
          code:='MEDIA_REFERENCE'; field:='media'; message:='Daftar referensi gambar tidak valid.'; RETURN NEXT;
        ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(placement.content->'assetKeys') k
          WHERE jsonb_typeof(k)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(assets) m
            WHERE (m->>'assetId'=k#>>'{}' OR m->>'objectKey'=k#>>'{}')
              AND m->>'placement'=placement.location AND (m->>'itemId') IS NOT DISTINCT FROM placement.item_id)) THEN
          code:='MEDIA_REFERENCE'; field:='media'; message:='Referensi gambar tidak sesuai manifest media.'; RETURN NEXT;
        END IF;
      END IF;
     FOR marker IN SELECT regexp_matches(placement.content->>'text','\[\[asset:([^\]]+)\]\]','g') LOOP
       IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(assets) m WHERE m->>'assetId'=marker[1]
         AND m->>'placement'=placement.location AND (m->>'itemId') IS NOT DISTINCT FROM placement.item_id) THEN
         code:='MEDIA_REFERENCE'; field:='media'; message:='Referensi gambar tidak sesuai manifest media.'; RETURN NEXT;
       END IF;
     END LOOP;
   END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(assets) m WHERE NOT EXISTS(
      SELECT 1 FROM (SELECT r.stem AS content,'STEM' AS location,NULL::text AS item_id
        UNION ALL SELECT r.explanation,'EXPLANATION',NULL::text
        UNION ALL SELECT o->'content',CASE WHEN r.question_type='CATEGORY' THEN 'STATEMENT' ELSE 'OPTION' END,o->>'id' FROM jsonb_array_elements(opts) o) loc
      WHERE loc.location=m->>'placement' AND loc.item_id IS NOT DISTINCT FROM m->>'itemId'
        AND position('[[asset:'||(m->>'assetId')||']]' in loc.content->>'text')>0)) THEN
      code:='MEDIA_REFERENCE'; field:='media'; message:='Gambar manifest harus dirujuk pada isi yang sesuai.'; RETURN NEXT;
    END IF;
   IF r.max_points IS NULL OR r.max_points<=0 THEN code:='SCORING'; field:='maxPoints'; message:='Bobot soal harus positif.'; RETURN NEXT; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.tryout_package_issues(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tryout_package_issues(uuid) TO numora_main_runtime;
--> statement-breakpoint
-- Preserve historical pair columns for old readers; new readers use the package list.
INSERT INTO public.tryout_wave_packages(wave_id,package_id)
 SELECT id,original_package_id FROM public.tryout_waves UNION SELECT id,variant_package_id FROM public.tryout_waves WHERE variant_package_id IS NOT NULL;
INSERT INTO public.tryout_allocation_pools(batch_id,school_id)
 SELECT batch_id,school_id FROM public.tryout_school_delegations
 UNION SELECT id,NULL FROM public.tryout_batches WHERE mandiri_package_id IS NOT NULL;
INSERT INTO public.tryout_pool_packages(pool_id,batch_id,package_id)
 SELECT p.id,p.batch_id,d.package_id FROM public.tryout_allocation_pools p JOIN public.tryout_school_delegations d ON d.batch_id=p.batch_id AND d.school_id=p.school_id
 UNION SELECT p.id,p.batch_id,d.variant_package_id FROM public.tryout_allocation_pools p JOIN public.tryout_school_delegations d ON d.batch_id=p.batch_id AND d.school_id=p.school_id WHERE d.allocation_mode='BALANCED_50_50'
 UNION SELECT p.id,p.batch_id,bp.package_id FROM public.tryout_allocation_pools p JOIN public.tryout_batches b ON b.id=p.batch_id JOIN public.tryout_wave_packages bp ON bp.wave_id=b.wave_id WHERE p.school_id IS NULL
 UNION SELECT p.id,p.batch_id,b.mandiri_package_id FROM public.tryout_allocation_pools p JOIN public.tryout_batches b ON b.id=p.batch_id WHERE p.school_id IS NULL AND b.wave_id IS NULL;
--> statement-breakpoint
CREATE FUNCTION public.tryout_pool_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bid uuid; published timestamptz;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Tryout pools cannot be moved'; END IF;
 IF TG_TABLE_NAME='tryout_wave_packages' THEN
   IF EXISTS(SELECT 1 FROM public.tryout_batches WHERE wave_id=CASE WHEN TG_OP='DELETE' THEN OLD.wave_id ELSE NEW.wave_id END AND admin_published_at IS NOT NULL)
     THEN RAISE EXCEPTION 'Published wave packages are immutable' USING ERRCODE='23514'; END IF;
 ELSE
   bid:=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
   SELECT admin_published_at INTO published FROM public.tryout_batches WHERE id=bid FOR UPDATE;
   IF published IS NOT NULL THEN RAISE EXCEPTION 'Published allocation pools are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER tryout_pool_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_allocation_pools FOR EACH ROW EXECUTE FUNCTION public.tryout_pool_guard();
CREATE TRIGGER tryout_pool_packages_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_pool_packages FOR EACH ROW EXECUTE FUNCTION public.tryout_pool_guard();
CREATE TRIGGER tryout_wave_packages_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_wave_packages FOR EACH ROW EXECUTE FUNCTION public.tryout_pool_guard();
CREATE POLICY main_runtime ON public.tryout_allocation_pools TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_runtime ON public.tryout_pool_packages TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_runtime ON public.tryout_wave_packages TO numora_main_runtime USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tryout_allocation_pools,public.tryout_pool_packages,public.tryout_wave_packages TO numora_main_runtime;
REVOKE ALL ON public.tryout_allocation_pools,public.tryout_pool_packages,public.tryout_wave_packages FROM PUBLIC;

--> statement-breakpoint
ALTER FUNCTION public.package_can_distribute(uuid) RENAME TO package_can_distribute_before_tryout_v4;
CREATE FUNCTION public.package_can_distribute(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN p.assessment_type='TRYOUT' THEN p.status='PUBLISHED' AND p.purpose='REGULAR'
   AND NOT p.is_demo AND NOT EXISTS(SELECT 1 FROM public.tryout_package_issues(p.id))
 ELSE public.package_can_distribute_before_tryout_v4(p.id) END FROM public.assessment_packages p WHERE p.id=target
$$;
REVOKE ALL ON FUNCTION public.package_can_distribute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.package_can_distribute(uuid) TO numora_main_runtime;
