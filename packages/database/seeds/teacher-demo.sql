-- DEVELOPMENT ONLY. Invoked by teacher-demo-seed.ts after environment, backup and Auth checks.
-- These helpers live only in pg_temp for this connection. No durable DDL, policies or grants.
-- Insert-or-verify: never update historical facts or replace existing users/content.
CREATE OR REPLACE FUNCTION pg_temp.teacher_demo_id(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('04000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;

CREATE OR REPLACE FUNCTION pg_temp.teacher_demo_put(tab regclass, payload jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cols text; matches boolean;
BEGIN
  IF payload->>'id' NOT LIKE '04000000-0000-4000-8000-%' THEN RAISE EXCEPTION 'Non-demo insert refused'; END IF;
  EXECUTE format('SELECT to_jsonb(t) @> (SELECT jsonb_object_agg(k,v) FROM jsonb_each(to_jsonb(jsonb_populate_record(NULL::%1$s,$1))) x(k,v) WHERE $1 ? k) FROM %1$s t WHERE t.id=($1->>''id'')::uuid',tab)
    INTO matches USING payload;
  IF matches IS true THEN RETURN; END IF;
  IF matches IS false THEN RAISE EXCEPTION 'Demo collision or modified history in %',tab; END IF;
  SELECT string_agg(format('%I',key),',') INTO cols FROM jsonb_object_keys(payload) AS key;
  EXECUTE format('INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::%1$s,$1) ON CONFLICT DO NOTHING',tab,cols) USING payload;
  EXECUTE format('SELECT to_jsonb(t) @> (SELECT jsonb_object_agg(k,v) FROM jsonb_each(to_jsonb(jsonb_populate_record(NULL::%1$s,$1))) x(k,v) WHERE $1 ? k) FROM %1$s t WHERE t.id=($1->>''id'')::uuid',tab)
    INTO matches USING payload;
  IF matches IS DISTINCT FROM true THEN RAISE EXCEPTION 'Demo collision or modified history in %',tab; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.teacher_demo_attempt(n bigint, student uuid, package uuid, correct_count integer, finished timestamptz, active_started timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid := pg_temp.teacher_demo_id(n); p assessment_packages; item record; total integer;
  scored integer; start_time timestamptz; chosen text; correct boolean; nxt uuid; config jsonb; header jsonb;
BEGIN
  config := current_setting('numora.teacher_demo')::jsonb;
  SELECT * INTO STRICT p FROM assessment_packages WHERE id=package;
  IF NOT p.is_demo OR p.purpose<>'REGULAR' THEN RAISE EXCEPTION 'Only regular demo packages may be seeded'; END IF;
  SELECT count(*) INTO total FROM package_items WHERE package_id=package;
  IF total NOT IN (10,35) OR correct_count NOT BETWEEN 0 AND total THEN RAISE EXCEPTION 'Invalid demo assessment'; END IF;
  scored := CASE WHEN correct_count IS NULL THEN NULL ELSE round(correct_count*100.0/total) END;
  start_time := CASE WHEN finished IS NULL THEN active_started ELSE finished-interval '12 minutes' END;
  IF p.assessment_type='DRILL' AND scored>=80 THEN
    SELECT next.id INTO nxt FROM levels current JOIN levels next ON next.subchapter_id=current.subchapter_id AND next.level_number=current.level_number+1 WHERE current.id=p.level_id;
  END IF;
  header := jsonb_build_object(
    'id',a,'student_id',student,'package_id',package,'assessment_type',p.assessment_type,
    'purpose','REGULAR','chapter_id_at_start',p.chapter_id,'level_id_at_start',p.level_id,
    'class_id_at_start',(SELECT class_id FROM class_memberships WHERE student_user_id=student AND left_at IS NULL),
    'scoring_policy_version_id',p.scoring_policy_version_id,'started_at',start_time,
    'deadline_at',CASE WHEN p.assessment_type='TRYOUT' THEN start_time+interval '1 hour' ELSE NULL END,
    'finished_at',finished,'status',CASE WHEN finished IS NULL THEN 'IN_PROGRESS' ELSE 'GRADED' END,
    'raw_points',correct_count,'score_0_100',scored,'unlocked_level_id',nxt,
    'stars',CASE WHEN p.assessment_type<>'DRILL' OR scored IS NULL OR scored=0 THEN NULL WHEN scored<=50 THEN 1 WHEN scored<=90 THEN 2 ELSE 3 END);
  IF EXISTS(SELECT 1 FROM assessment_attempts WHERE id=a) THEN
    PERFORM pg_temp.teacher_demo_put('assessment_attempts',header);
  ELSE
    -- Respect the real immutability triggers: snapshots/answers exist before grading.
    PERFORM pg_temp.teacher_demo_put('assessment_attempts',header || jsonb_build_object(
      'status','IN_PROGRESS','finished_at',NULL,'raw_points',NULL,'score_0_100',NULL,'stars',NULL,'unlocked_level_id',NULL));
  END IF;
  FOR item IN SELECT pi.*,q.answer_key,q.options_or_statements FROM package_items pi JOIN question_versions q ON q.id=pi.question_version_id WHERE pi.package_id=package ORDER BY pi.display_order LOOP
    PERFORM pg_temp.teacher_demo_put('attempt_items',jsonb_build_object(
      'id',pg_temp.teacher_demo_id(100000000+n*100+item.display_order),'attempt_id',a,
      'package_id',package,'package_item_id',item.id,'question_version_id',item.question_version_id,
      'display_order',item.display_order,'max_points',item.max_points));
    IF finished IS NULL AND item.display_order>3 THEN CONTINUE; END IF;
    correct := item.display_order<=coalesce(correct_count,2);
    chosen := item.answer_key->>'optionId';
    IF NOT correct THEN
      SELECT opt->>'id' INTO chosen FROM jsonb_array_elements(item.options_or_statements) opt WHERE opt->>'id'<>chosen ORDER BY opt->>'id' LIMIT 1;
    END IF;
    PERFORM pg_temp.teacher_demo_put('attempt_answers',jsonb_build_object(
      'id',pg_temp.teacher_demo_id(200000000+n*100+item.display_order),
      'attempt_item_id',pg_temp.teacher_demo_id(100000000+n*100+item.display_order),
      'answer',jsonb_build_object('optionId',chosen),'saved_at',start_time+interval '5 minutes',
      'awarded_points',CASE WHEN finished IS NULL THEN NULL WHEN correct THEN item.max_points ELSE 0 END,
      'graded_at',finished));
  END LOOP;
  IF finished IS NOT NULL THEN
    UPDATE assessment_attempts SET status='GRADED',finished_at=finished,raw_points=correct_count,
      score_0_100=scored,unlocked_level_id=nxt,stars=(header->>'stars')::integer
      WHERE id=a AND status='IN_PROGRESS';
    PERFORM pg_temp.teacher_demo_put('analytics_outbox',jsonb_build_object(
      'id',pg_temp.teacher_demo_id(300000000+n),'event_name',lower(p.assessment_type::text)||'_completed',
      'event_version','1','actor_user_id',student,'entity_type','assessmentAttempt','entity_id',a,
      'correlation_id',a,'occurred_at',finished,'payload',jsonb_build_object(
        'packageId',package,'levelId',p.level_id,'score',scored,'demoScenario',config->>'scenario')));
  END IF;
  RETURN a;
END $$;

DO $seed$
DECLARE config jsonb := current_setting('numora.teacher_demo')::jsonb;
  roster jsonb := config->'roster'; actor jsonb; class jsonb; rec record; state record;
  teacher uuid := pg_temp.teacher_demo_id(1); school uuid := pg_temp.teacher_demo_id(20);
  admin_id uuid := (config->>'adminUserId')::uuid; policy uuid; tryout_policy uuid := pg_temp.teacher_demo_id(900);
  sub uuid; chapter uuid; competency uuid; level uuid; question uuid; variant uuid; original uuid; version_id uuid; pack uuid;
  g integer; l integer; v integer; i integer; j integer; s integer; cls integer; mastered integer; correct_count integer;
  ans integer; correct_pos integer; opts jsonb; stem text; explanation text; n bigint; completed timestamptz;
  start_time timestamptz; join_time timestamptz; as_of timestamptz := (config->>'asOf')::timestamptz;
  sub_ids uuid[] := ARRAY['03000000-0000-4000-8000-000000000101'::uuid,pg_temp.teacher_demo_id(101),pg_temp.teacher_demo_id(201)];
  past uuid := pg_temp.teacher_demo_id(701); current uuid := pg_temp.teacher_demo_id(702); batch uuid;
  chosen_versions uuid[] := ARRAY[]::uuid[]; recipient integer; feedback_id uuid; sent timestamptz; body text;
BEGIN
  SELECT id INTO STRICT policy FROM scoring_policy_versions WHERE policy_code='DRILL_PG_DEMO' AND version=1 AND status='PUBLISHED';
  -- Google identity is never fabricated. Every auth_user_id has been verified against Admin Auth.
  FOR actor IN SELECT value FROM jsonb_array_elements(roster->'actors') LOOP
    s := coalesce((actor->>'studentIndex')::integer,0);
    join_time := CASE WHEN s=12 THEN as_of-interval '2 hours' ELSE '2026-09-01T00:00:00Z'::timestamptz END;
    PERFORM pg_temp.teacher_demo_put('users',jsonb_build_object('id',actor->>'id',
      'auth_user_id',config->'actors'->>(actor->>'id'),'role',actor->>'role',
      'display_name',actor->>'displayName','email',actor->>'email','status','ACTIVE',
      'created_at',join_time,'updated_at',join_time));
  END LOOP;
  PERFORM pg_temp.teacher_demo_put('schools',jsonb_build_object('id',school,'code','DEMO-TEACHER-SBY-01',
    'name','SMP Negeri 1 Surabaya','address','DEMO SYNTHETIC — Surabaya, Jawa Timur','status','ACTIVE',
    'created_at','2026-08-31T00:00:00Z','updated_at','2026-08-31T00:00:00Z'));
  PERFORM pg_temp.teacher_demo_put('teacher_verification_tokens',jsonb_build_object('id',pg_temp.teacher_demo_id(21),
    'school_id',school,'token_hash',config->>'tokenHash','created_by_user_id',admin_id,
    'created_at','2026-08-31T00:00:00Z','expires_at','2026-09-03T00:00:00Z',
    'used_at','2026-09-01T00:00:00Z','used_by_user_id',teacher,'revoked_at',NULL));
  PERFORM pg_temp.teacher_demo_put('teacher_school_memberships',jsonb_build_object('id',pg_temp.teacher_demo_id(22),
    'teacher_user_id',teacher,'school_id',school,'verification_token_id',pg_temp.teacher_demo_id(21),
    'verified_at','2026-09-01T00:00:00Z','ended_at',NULL));
  FOR class IN SELECT value FROM jsonb_array_elements(roster->'classes') LOOP
    PERFORM pg_temp.teacher_demo_put('classes',jsonb_build_object('id',class->>'id','school_id',school,
      'teacher_user_id',teacher,'name',class->>'name','join_code',class->>'joinCode',
      'created_at','2026-09-01T00:00:00Z','updated_at','2026-09-01T00:00:00Z','archived_at',NULL));
  END LOOP;
  FOR actor IN SELECT value FROM jsonb_array_elements(roster->'actors') WHERE value->>'role'='STUDENT' LOOP
    s := (actor->>'studentIndex')::integer; cls := (actor->>'classIndex')::integer;
    join_time := CASE WHEN s=12 THEN as_of-interval '2 hours' ELSE '2026-09-01T00:00:00Z'::timestamptz END;
    PERFORM pg_temp.teacher_demo_put('class_memberships',jsonb_build_object('id',pg_temp.teacher_demo_id(2000+s),
      'class_id',roster->'classes'->(cls-1)->>'id','student_user_id',actor->>'id','joined_at',join_time,'left_at',NULL));
  END LOOP;
  -- Curriculum fixtures use the current hierarchy. Algebra and Bilangan are never renamed.
  FOR g IN 1..2 LOOP
    chapter := pg_temp.teacher_demo_id(g*100); sub := pg_temp.teacher_demo_id(g*100+1); competency := pg_temp.teacher_demo_id(g*100+2);
    PERFORM pg_temp.teacher_demo_put('chapters',jsonb_build_object('id',chapter,
      'code',CASE WHEN g=1 THEN 'DEMO-TEACHER-GEOMETRI' ELSE 'DEMO-TEACHER-STATISTIKA' END,
      'slug',CASE WHEN g=1 THEN 'demo-teacher-geometri' ELSE 'demo-teacher-statistika' END,
      'name',CASE WHEN g=1 THEN 'Bab DEMO: Teorema Pythagoras & Geometri Ruang' ELSE 'Bab DEMO: Statistika & Peluang Soal TKA' END,
      'description','Synthetic development fixture; belum ditinjau Curriculum.',
      'display_order',(config->>'chapterOrderBase')::integer+g,'status','READY'));
    PERFORM pg_temp.teacher_demo_put('subchapters',jsonb_build_object('id',sub,'chapter_id',chapter,
      'code','DEMO-TEACHER-'||g,'slug','demo-teacher-subchapter-'||g,'name',CASE WHEN g=1 THEN 'Subbab DEMO: Pythagoras dan Volume' ELSE 'Subbab DEMO: Rata-rata dan Peluang' END,'display_order',1,'status','READY'));
    PERFORM pg_temp.teacher_demo_put('competencies',jsonb_build_object('id',competency,'subchapter_id',sub,
      'code','DEMO-TEACHER-'||g,'description','Kompetensi fixture development, bukan konten TKA resmi','status','READY'));
    FOR l IN 1..5 LOOP
      level := pg_temp.teacher_demo_id(g*100+10+l);
      PERFORM pg_temp.teacher_demo_put('levels',jsonb_build_object('id',level,'subchapter_id',sub,
        'level_number',l,'description','Level '||l||' DEMO','status','READY'));
      FOR i IN 1..10 LOOP
        question := pg_temp.teacher_demo_id(20000+g*1000+l*20+i);
        PERFORM pg_temp.teacher_demo_put('questions',jsonb_build_object('id',question,'primary_competency_id',competency,
          'source_ref','DEMO-TEACHER-G'||g||'-L'||l||'-Q'||i,'status','READY','created_at','2026-09-02T00:00:00Z'));
        FOR v IN 1..2 LOOP
          j := l+i+v;
          IF g=1 AND i%2=1 THEN
            ans := 5*j; stem := format('Segitiga siku-siku memiliki sisi tegak $%s$ cm dan $%s$ cm. Panjang sisi miringnya adalah … cm.',3*j,4*j);
            explanation := format('$c=\sqrt{(%s)^2+(%s)^2}=%s$ cm.',3*j,4*j,ans);
          ELSIF g=1 THEN
            ans := j*j*j; stem := format('Kubus memiliki rusuk $%s$ cm. Volumenya adalah … $cm^3$.',j);
            explanation := format('$V=s^3=%s^3=%s$ $cm^3$.',j,ans);
          ELSIF i%2=1 THEN
            ans := j; stem := format('Rata-rata dari $%s, %s, %s$ adalah ….',j-2,j,j+2);
            explanation := format('Jumlah ketiga data adalah $%s$. Rata-rata $=%s/3=%s$.',3*j,3*j,ans);
          ELSE
            ans := j; stem := format('Kotak berisi %s bola merah dan %s bola biru. Peluang mengambil merah adalah $a/%s$. Nilai $a$ adalah ….',j,j+1,2*j+1);
            explanation := format('Peluang merah adalah jumlah merah dibagi total: $%s/%s$, sehingga $a=%s$.',j,2*j+1,j);
          END IF;
          correct_pos := (i+l+v)%4;
          SELECT jsonb_agg(jsonb_build_object('id',substr('ABCD',pos+1,1),'content',jsonb_build_object('text',
            (ans+CASE WHEN pos=correct_pos THEN 0 ELSE pos+1 END)::text)) ORDER BY pos) INTO opts FROM generate_series(0,3) pos;
          variant := pg_temp.teacher_demo_id(30000+g*1000+l*100+i*2+v);
          original := pg_temp.teacher_demo_id(30000+g*1000+l*100+i*2+1);
          version_id := pg_temp.teacher_demo_id(40000+g*1000+l*100+i*2+v);
          PERFORM pg_temp.teacher_demo_put('question_variants',jsonb_build_object('id',variant,'question_id',question,
            'original_variant_id',CASE WHEN v=1 THEN NULL ELSE original END,
            'variant_code','DEMO-TEACHER-G'||g||'-L'||l||'-Q'||i||'-V'||v,
            'kind',CASE WHEN v=1 THEN 'ORIGINAL' ELSE 'VARIANT' END,'origin','DEMO'));
          -- DRAFT versions mirror existing DEMO packages; do not forge Curriculum review.
          PERFORM pg_temp.teacher_demo_put('question_versions',jsonb_build_object('id',version_id,'variant_id',variant,
            'version_number',1,'question_type','SINGLE_CHOICE','stem',jsonb_build_object('text',stem),
            'options_or_statements',opts,'answer_key',jsonb_build_object('optionId',substr('ABCD',correct_pos+1,1)),
            'explanation',jsonb_build_object('text',explanation),'difficulty','MEDIUM','content_status','DRAFT',
            'created_at','2026-09-02T00:00:00Z'));
        END LOOP;
      END LOOP;
      FOR v IN 1..2 LOOP
        pack := pg_temp.teacher_demo_id(50000+g*100+l*10+v);
        PERFORM pg_temp.teacher_demo_put('assessment_packages',jsonb_build_object('id',pack,
          'family_code','DEMO-TEACHER-G'||g||'-L'||l||'-V'||v,'package_version',1,'name','Drill DEMO Teacher G'||g||' Level '||l||' Varian '||v,
          'assessment_type','DRILL','chapter_id',chapter,'level_id',level,'variant_index',v,'is_demo',true,
          'scoring_policy_version_id',policy,'release_at','2026-09-02T00:00:00Z','status','PUBLISHED'));
        FOR i IN 1..10 LOOP
          PERFORM pg_temp.teacher_demo_put('package_items',jsonb_build_object('id',pg_temp.teacher_demo_id(60000+g*10000+l*100+v*20+i),
            'package_id',pack,'question_version_id',pg_temp.teacher_demo_id(40000+g*1000+l*100+i*2+v),'display_order',i,'max_points',1));
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  -- Shared PG percentage fixture; duration/format/scales are DEMO, not final product policy.
  PERFORM pg_temp.teacher_demo_put('scoring_policy_versions',jsonb_build_object('id',tryout_policy,
    'policy_code','TRYOUT_PG_DEMO_TEACHER','version',1,'configuration',jsonb_build_object(
      'fixture',true,'questionType','SINGLE_CHOICE','questionCount',35,'durationSeconds',3600,'scoring','existing-pg-percentage-demo'),
    'effective_at','2026-09-20T17:00:00Z','status','PUBLISHED'));
  FOR g IN 0..2 LOOP
    FOR rec IN SELECT pi.question_version_id FROM package_items pi JOIN assessment_packages p ON p.id=pi.package_id
      JOIN levels lv ON lv.id=p.level_id WHERE lv.subchapter_id=sub_ids[g+1] AND p.assessment_type='DRILL'
      AND p.variant_index=1 AND p.is_demo ORDER BY lv.level_number,pi.display_order LIMIT CASE WHEN g=2 THEN 11 ELSE 12 END LOOP
      chosen_versions := array_append(chosen_versions,rec.question_version_id);
    END LOOP;
  END LOOP;
  IF array_length(chosen_versions,1)<>35 THEN RAISE EXCEPTION '35 distinct demo Tryout items required'; END IF;
  FOR v IN 1..2 LOOP
    pack := pg_temp.teacher_demo_id(700+v); batch := pg_temp.teacher_demo_id(710+v);
    start_time := CASE WHEN v=1 THEN '2026-09-20T17:00:00Z' ELSE '2026-09-27T17:00:00Z' END;
    completed := CASE WHEN v=1 THEN '2026-09-26T17:00:00Z' ELSE '2026-10-04T17:00:00Z' END;
    PERFORM pg_temp.teacher_demo_put('assessment_packages',jsonb_build_object('id',pack,'family_code','DEMO-TEACHER-TRYOUT-0'||v,
      'package_version',1,'name','DEMO Batch #0'||v||' — Simulasi TKA SMP 2026','assessment_type','TRYOUT',
      'duration_seconds',3600,'is_demo',true,'scoring_policy_version_id',tryout_policy,
      'release_at',start_time,'close_at',completed,'status',CASE WHEN v=1 THEN 'CLOSED' ELSE 'PUBLISHED' END));
    PERFORM pg_temp.teacher_demo_put('tryout_batches',jsonb_build_object('id',batch,'package_id',pack,
      'starts_at',start_time,'closes_at',completed,'cutoff_at',completed,'result_due_at',completed+interval '72 hours',
      'status',CASE WHEN v=1 THEN 'CLOSED' ELSE 'OPEN' END,'created_at',start_time));
    FOR i IN 1..35 LOOP
      PERFORM pg_temp.teacher_demo_put('package_items',jsonb_build_object('id',pg_temp.teacher_demo_id(8000+v*100+i),
        'package_id',pack,'question_version_id',chosen_versions[i],'display_order',i,'max_points',1));
    END LOOP;
  END LOOP;
  -- Histories precede this week's activity. Count-up Drill never has a deadline.
  FOR actor IN SELECT value FROM jsonb_array_elements(roster->'actors') WHERE value->>'role'='STUDENT' LOOP
    s := (actor->>'studentIndex')::integer;
    IF s=12 THEN CONTINUE; END IF;
    FOR g IN 0..2 LOOP
      mastered := (actor->'masteredLevels'->>g)::integer;
      FOR l IN 1..mastered LOOP
        SELECT p.id INTO STRICT pack FROM assessment_packages p JOIN levels lv ON lv.id=p.level_id
          WHERE lv.subchapter_id=sub_ids[g+1] AND lv.level_number=l AND p.variant_index=1 AND p.assessment_type='DRILL' AND p.is_demo;
        correct_count := CASE WHEN s=1 THEN 10 WHEN s IN (2,3) THEN 9 ELSE 8 END;
        n := 1000000+s*1000+g*100+l;
        completed := '2026-09-12T01:00:00Z'::timestamptz+(g*6+l)*interval '30 minutes'+s*interval '1 minute';
        PERFORM pg_temp.teacher_demo_attempt(n,(actor->>'id')::uuid,pack,correct_count,completed);
      END LOOP;
    END LOOP;
    SELECT id INTO STRICT pack FROM assessment_packages WHERE family_code='DEMO-UI-L1-V1';
    IF s=5 THEN
      PERFORM pg_temp.teacher_demo_attempt(1500000+s*1000+1,(actor->>'id')::uuid,pack,5,'2026-09-13T02:00:00Z');
      SELECT id INTO STRICT pack FROM assessment_packages WHERE family_code='DEMO-UI-L1-V2';
      PERFORM pg_temp.teacher_demo_attempt(1500000+s*1000+2,(actor->>'id')::uuid,pack,6,'2026-09-14T02:00:00Z');
      -- Alternate the next retry as the current server selector requires.
      SELECT id INTO STRICT pack FROM assessment_packages WHERE family_code='DEMO-UI-L1-V1';
      PERFORM pg_temp.teacher_demo_attempt(1500000+s*1000+3,(actor->>'id')::uuid,pack,6,'2026-09-15T02:00:00Z');
    END IF;
    IF (actor->>'weeklyActive')::boolean THEN
      SELECT id INTO STRICT pack FROM assessment_packages WHERE family_code='DEMO-UI-L1-V2';
      correct_count := CASE WHEN s=1 THEN 10 WHEN s IN (2,3) THEN 9 WHEN s IN (5,7) THEN 7 ELSE 8 END;
      PERFORM pg_temp.teacher_demo_attempt(1600000+s*1000+2,(actor->>'id')::uuid,pack,correct_count,
        '2026-10-02T02:00:00Z'::timestamptz+s*interval '1 minute');
      IF s=7 THEN
        PERFORM pg_temp.teacher_demo_attempt(1600000+s*1000+1,(actor->>'id')::uuid,pack,9,'2026-10-01T02:00:00Z');
        SELECT id INTO STRICT pack FROM assessment_packages WHERE family_code='DEMO-UI-L1-V1';
        -- Complete the synthetic retry timeline without changing existing snapshots.
        PERFORM pg_temp.teacher_demo_attempt(1600000+s*1000+4,(actor->>'id')::uuid,pack,8,'2026-10-01T06:00:00Z');
        PERFORM pg_temp.teacher_demo_attempt(1600000+s*1000+3,(actor->>'id')::uuid,pack,7,'2026-10-03T02:00:00Z');
      END IF;
    END IF;
    IF s=8 THEN
      SELECT p.id INTO STRICT pack FROM assessment_packages p JOIN levels lv ON lv.id=p.level_id
        WHERE lv.subchapter_id=sub_ids[2] AND lv.level_number=2 AND p.variant_index=1;
      PERFORM pg_temp.teacher_demo_attempt(1700000+s*1000,(actor->>'id')::uuid,pack,7,'2026-09-15T02:00:00Z');
    END IF;
    IF s=6 THEN
      SELECT id INTO STRICT pack FROM assessment_packages WHERE family_code='DEMO-UI-L3-V1';
      PERFORM pg_temp.teacher_demo_attempt(1800000+s*1000,(actor->>'id')::uuid,pack,NULL,NULL,as_of-interval '30 minutes');
    END IF;
    IF actor->>'tryoutCorrectCount' IS NOT NULL THEN
      correct_count := (actor->>'tryoutCorrectCount')::integer;
      PERFORM pg_temp.teacher_demo_attempt(1900000+s*1000+1,(actor->>'id')::uuid,past,correct_count,
        '2026-09-25T02:00:00Z'::timestamptz+s*interval '1 minute');
      PERFORM pg_temp.teacher_demo_attempt(1900000+s*1000+2,(actor->>'id')::uuid,current,correct_count,
        '2026-09-29T02:00:00Z'::timestamptz+s*interval '1 minute');
    END IF;
  END LOOP;
  -- Progress projections come exclusively from actual graded history, including regression.
  FOR actor IN SELECT value FROM jsonb_array_elements(roster->'actors') WHERE value->>'role'='STUDENT' AND value->>'studentIndex'<>'12' LOOP
    s := (actor->>'studentIndex')::integer;
    FOR g IN 0..2 LOOP
      FOR rec IN SELECT * FROM levels WHERE subchapter_id=sub_ids[g+1] ORDER BY level_number LOOP
        SELECT latest.score_0_100 latest_score,
          (SELECT max(score_0_100) FROM assessment_attempts WHERE student_id=(actor->>'id')::uuid AND level_id_at_start=rec.id AND status='GRADED') best_score,
          (SELECT max(stars) FROM assessment_attempts WHERE student_id=(actor->>'id')::uuid AND level_id_at_start=rec.id AND status='GRADED') best_stars,
          mastered.id completion_id,mastered.finished_at completion_time,
          prev.id unlocking_id,prev.finished_at unlock_time INTO state
        FROM (SELECT 1) dummy
        LEFT JOIN LATERAL (SELECT * FROM assessment_attempts WHERE student_id=(actor->>'id')::uuid AND level_id_at_start=rec.id AND status='GRADED' ORDER BY finished_at DESC,id DESC LIMIT 1) latest ON true
        LEFT JOIN LATERAL (SELECT * FROM assessment_attempts WHERE student_id=(actor->>'id')::uuid AND level_id_at_start=rec.id AND status='GRADED' AND score_0_100>=80 ORDER BY finished_at,id LIMIT 1) mastered ON true
        LEFT JOIN LATERAL (SELECT a.* FROM assessment_attempts a JOIN levels lv ON lv.id=a.level_id_at_start WHERE a.student_id=(actor->>'id')::uuid AND lv.subchapter_id=rec.subchapter_id AND lv.level_number=rec.level_number-1 AND a.status='GRADED' AND a.score_0_100>=80 ORDER BY a.finished_at,a.id LIMIT 1) prev ON true;
        PERFORM pg_temp.teacher_demo_put('level_progress',jsonb_build_object('id',pg_temp.teacher_demo_id(4000000+s*100+g*10+rec.level_number),
          'student_id',actor->>'id','level_id',rec.id,'unlocked_at',CASE WHEN rec.level_number=1 THEN '2026-09-02T00:00:00Z'::timestamptz ELSE state.unlock_time END,
          'unlock_source',CASE WHEN state.unlocking_id IS NOT NULL THEN 'DRILL' ELSE NULL END,
          'unlocking_attempt_id',state.unlocking_id,'completion_attempt_id',state.completion_id,'completed_at',state.completion_time,
          'latest_score',state.latest_score,'best_score',state.best_score,'best_stars',state.best_stars));
      END LOOP;
    END LOOP;
  END LOOP;
  -- Demo release gate only, matching existing integration tests. No invented scientific output.
  PERFORM pg_temp.teacher_demo_put('irt_batches',jsonb_build_object('id',pg_temp.teacher_demo_id(720),
    'package_id',past,'batch_kind','DEMO','model_version','DEMO-PG-release-fixture-not-scientific-IRT',
    'status','SUCCEEDED','started_at','2026-09-27T18:00:00Z','finished_at','2026-09-28T01:00:00Z',
    'result_released_at','2026-09-28T01:00:00Z','input_snapshot',jsonb_build_object('demoScenario',config->>'scenario','source','30 synthetic submitted attempts per item'),
    'output_snapshot',jsonb_build_object('fixture',true,'scientificCalibration',false,'scale','DEMO-PG-0-100')));
  FOR i IN 1..35 LOOP
    PERFORM pg_temp.teacher_demo_put('irt_item_results',jsonb_build_object('id',pg_temp.teacher_demo_id(9000+i),
      'batch_id',pg_temp.teacher_demo_id(720),'question_version_id',chosen_versions[i],
      'sample_size',(SELECT count(*) FROM attempt_items ai JOIN assessment_attempts a ON a.id=ai.attempt_id JOIN attempt_answers aa ON aa.attempt_item_id=ai.id WHERE a.package_id=past AND a.status='GRADED' AND ai.question_version_id=chosen_versions[i]),
      'data_status','SUFFICIENT','model_family','LEGACY','measurement_state','UNCALIBRATED',
      'difficulty_b',NULL,'discrimination_a',NULL,'guessing_c',NULL,'scale_id','DEMO-PG-0-100',
      'quality_evidence',jsonb_build_object('fixture',true,'scientificCalibration',false)));
  END LOOP;
  -- One-way feedback only. Themes are human-readable text, not invented category columns.
  FOR i IN 1..42 LOOP
    recipient := CASE WHEN i<=33 THEN CASE WHEN i>=12 THEN i+1 ELSE i END
      ELSE (ARRAY[5,6,1,4,7,5,6,10,11])[i-33] END;
    feedback_id := pg_temp.teacher_demo_id(5000000+i);
    sent := '2026-10-02T05:00:00Z'::timestamptz+i*interval '1 minute';
    body := CASE WHEN recipient=5 THEN 'DEMO — Remedial Drill: coba kembali Level 1 Aljabar. Pelajari pembahasan dan kerjakan perlahan; kita evaluasi latihan berikutnya.'
      WHEN recipient=6 THEN 'DEMO — Pengingat Tryout Batch #02: kamu belum mengirim jawaban. Selesaikan sebelum 5 Oktober 2026 pukul 00.00 WIB.'
      WHEN recipient IN (1,3,4) THEN 'DEMO — Apresiasi: latihanmu konsisten dan hasilmu baik. Pertahankan kebiasaan memeriksa langkah penyelesaian.'
      WHEN i%2=0 THEN 'DEMO — Motivasi: mulai dari satu level yang sudah terbuka dan lanjutkan latihan secara bertahap.'
      ELSE 'DEMO — Instruksi khusus: tinjau pembahasan geometri dan catat langkah yang belum dipahami untuk latihan selanjutnya.' END;
    PERFORM pg_temp.teacher_demo_put('feedback',jsonb_build_object('id',feedback_id,'teacher_id',teacher,
      'student_id',pg_temp.teacher_demo_id(1000+recipient),'class_id_at_send',pg_temp.teacher_demo_id(10),
      'body',body,'sent_at',sent,'read_at',CASE WHEN i<=38 THEN sent+interval '2 hours' ELSE NULL END));
    PERFORM pg_temp.teacher_demo_put('analytics_outbox',jsonb_build_object('id',pg_temp.teacher_demo_id(5100000+i),
      'event_name','feedback_sent','event_version','1','actor_user_id',teacher,'entity_type','feedback',
      'entity_id',feedback_id,'correlation_id',feedback_id,'occurred_at',sent,
      'payload',jsonb_build_object('classId',pg_temp.teacher_demo_id(10),'studentId',pg_temp.teacher_demo_id(1000+recipient),'demoScenario',config->>'scenario')));
    IF i<=38 THEN
      PERFORM pg_temp.teacher_demo_put('analytics_outbox',jsonb_build_object('id',pg_temp.teacher_demo_id(5200000+i),
        'event_name','feedback_read','event_version','1','actor_user_id',pg_temp.teacher_demo_id(1000+recipient),
        'entity_type','feedback','entity_id',feedback_id,'correlation_id',feedback_id,'occurred_at',sent+interval '2 hours',
        'payload',jsonb_build_object('demoScenario',config->>'scenario','classId',pg_temp.teacher_demo_id(10))));
    END IF;
  END LOOP;
  FOR i IN 1..6 LOOP
    PERFORM pg_temp.teacher_demo_put('audit_logs',jsonb_build_object('id',pg_temp.teacher_demo_id(6000000+i),
      'actor_user_id',CASE WHEN i IN (1,2) THEN admin_id ELSE teacher END,
      'action',CASE WHEN i=1 THEN 'demo_school_created' WHEN i=2 THEN 'demo_teacher_verified' WHEN i<=5 THEN 'demo_class_created' ELSE 'teacher_demo_seed' END,
      'entity_type',CASE WHEN i=1 THEN 'school' WHEN i=2 THEN 'teacher' WHEN i<=5 THEN 'class' ELSE 'demoScenario' END,
      'entity_id',CASE WHEN i=1 THEN school WHEN i=2 OR i=6 THEN teacher ELSE pg_temp.teacher_demo_id(7+i) END,
      'metadata',jsonb_build_object('demoScenario',config->>'scenario','academicYear',roster->>'academicYear','asOf',as_of,'rosterDigest',config->>'rosterDigest'),
      'created_at',as_of));
  END LOOP;
END $seed$;
