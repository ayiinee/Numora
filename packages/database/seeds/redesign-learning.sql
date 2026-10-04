-- DEMO ONLY: Phase 3 UI/testing content, not Curriculum-approved TKA questions.
-- Run inside a transaction on the explicitly configured NUMORA project. Never alters users,
-- progress, attempts, historical versions, existing packages or product policies.
SELECT pg_advisory_xact_lock(hashtext('numora-ui-phase3-content-seed'));
DO $seed$
DECLARE
  chapter uuid := '03000000-0000-4000-8000-000000000100';
  subchapter uuid := '03000000-0000-4000-8000-000000000101';
  competency uuid := '03000000-0000-4000-8000-000000000104';
  policy uuid;
  lvl uuid; q uuid; variant uuid; original uuid; version_id uuid; pack uuid;
  l integer; i integer; v integer; p integer; answer integer; correct_index integer;
  stem_text text; explanation_text text; option_list jsonb; title text;
BEGIN
  SELECT id INTO policy FROM scoring_policy_versions
    WHERE policy_code='DRILL_PG_DEMO' AND status='PUBLISHED' ORDER BY version DESC LIMIT 1;
  IF policy IS NULL THEN RAISE EXCEPTION 'Existing DEMO PG scoring policy required'; END IF;
  INSERT INTO chapters(id,code,name,description,display_order,status)
    SELECT chapter,'DEMO-UI-ALJABAR','Bab Demo UI: Persamaan & Fungsi Kuadrat',
      'Data sintetis untuk pengujian UI. Belum ditinjau Curriculum.',coalesce(max(display_order),0)+1,'READY'
    FROM chapters ON CONFLICT DO NOTHING;
  INSERT INTO subchapters(id,chapter_id,code,name,display_order,status)
    VALUES(subchapter,chapter,'DEMO-UI-FAKTOR','Subbab Demo UI: Faktorisasi & Bentuk Kuadrat',1,'READY') ON CONFLICT DO NOTHING;
  INSERT INTO competencies(id,subchapter_id,code,description,status)
    VALUES(competency,subchapter,'DEMO-UI-KUADRAT','Identitas kuadrat dan selisih kuadrat — DEMO', 'READY') ON CONFLICT DO NOTHING;
  FOR l IN 1..5 LOOP
    lvl := ('03000000-0000-4000-8000-'||lpad((110+l)::text,12,'0'))::uuid;
    title := (ARRAY['Pengenalan Suku & Faktor','Identitas Aljabar','Bentuk Kuadrat Sempurna','Selisih Kuadrat','Penguatan Faktorisasi'])[l];
    INSERT INTO levels(id,subchapter_id,level_number,description,status)
      VALUES(lvl,subchapter,l,'Level '||l||' Demo: '||title,'READY') ON CONFLICT DO NOTHING;
    FOR i IN 1..10 LOOP
      q := ('03000000-0000-4000-8000-'||lpad((200+l*20+i)::text,12,'0'))::uuid;
      INSERT INTO questions(id,primary_competency_id,source_ref,status)
        VALUES(q,competency,'DEMO-UI-L'||l||'-Q'||i,'READY') ON CONFLICT DO NOTHING;
      FOR v IN 1..2 LOOP
        p := l+i+v;
        IF i%2=1 THEN
          answer := p*p;
          stem_text := format('Diketahui $x^2 + %sx + c = (x + %s)^2$. Nilai konstanta $c$ adalah…',2*p,p);
          explanation_text := format('Gunakan $(x+p)^2=x^2+2px+p^2$. Untuk $p=%s$, diperoleh $c=%s^2=%s$.',p,p,answer);
        ELSE
          answer := p;
          stem_text := format('Bentuk $x^2 - %s$ dapat difaktorkan menjadi $(x-a)(x+a)$ dengan $a>0$. Nilai $a$ adalah…',p*p);
          explanation_text := format('Identitas selisih kuadrat: $x^2-a^2=(x-a)(x+a)$. Karena $a^2=%s$ dan $a>0$, maka $a=%s$.',p*p,p);
        END IF;
        correct_index := (i-1)%4;
        SELECT jsonb_agg(jsonb_build_object('id',substr('ABCD',j+1,1),'content',jsonb_build_object('text',(answer+CASE WHEN j=correct_index THEN 0 ELSE j+1 END)::text)) ORDER BY j)
          INTO option_list FROM generate_series(0,3) j;
        variant := ('03000000-0000-4000-8000-'||lpad((1000+l*100+i*2+v)::text,12,'0'))::uuid;
        original := ('03000000-0000-4000-8000-'||lpad((1000+l*100+i*2+1)::text,12,'0'))::uuid;
        version_id := ('03000000-0000-4000-8000-'||lpad((2000+l*100+i*2+v)::text,12,'0'))::uuid;
        INSERT INTO question_variants(id,question_id,original_variant_id,variant_code,kind,origin)
          VALUES(variant,q,CASE WHEN v=1 THEN NULL ELSE original END,'DEMO-UI-L'||l||'-Q'||i||'-V'||v,CASE WHEN v=1 THEN 'ORIGINAL'::variant_kind ELSE 'VARIANT'::variant_kind END,'DEMO') ON CONFLICT DO NOTHING;
        INSERT INTO question_versions(id,variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,difficulty,content_status)
          VALUES(version_id,variant,1,'SINGLE_CHOICE',jsonb_build_object('text',stem_text),option_list,jsonb_build_object('optionId',substr('ABCD',correct_index+1,1)),jsonb_build_object('text',explanation_text),'MEDIUM','DRAFT') ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    FOR v IN 1..2 LOOP
      pack := ('03000000-0000-4000-8000-'||lpad((3000+l*10+v)::text,12,'0'))::uuid;
      INSERT INTO assessment_packages(id,family_code,package_version,name,assessment_type,chapter_id,level_id,variant_index,is_demo,scoring_policy_version_id,release_at,status)
        VALUES(pack,'DEMO-UI-L'||l||'-V'||v,1,'Drill Demo UI Level '||l||' — Varian '||v,'DRILL',chapter,lvl,v,true,policy,now(),'PUBLISHED') ON CONFLICT DO NOTHING;
      FOR i IN 1..10 LOOP
        version_id := ('03000000-0000-4000-8000-'||lpad((2000+l*100+i*2+v)::text,12,'0'))::uuid;
        INSERT INTO package_items(id,package_id,question_version_id,display_order,max_points)
          VALUES(('03000000-0000-4000-8000-'||lpad((4000+l*100+v*20+i)::text,12,'0'))::uuid,pack,version_id,i,1) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $seed$;
