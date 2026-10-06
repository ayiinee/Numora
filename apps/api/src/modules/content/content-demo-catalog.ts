import { sql } from 'drizzle-orm';
import { contentImportVersions, questionVariants, questionVersions } from '@tka/database';

// Presentation of explicitly labeled fixtures only. No content, package or attempt is mutated.
// The import marker is emitted by the synthetic Excel/R2 smoke test, not inferred from a stem.
export const demoCatalogVersion = sql<boolean>`(
  ${questionVariants.origin} in ('DEMO', 'DEMO_QA_NOT_CURRICULUM_APPROVED')
  or coalesce(${contentImportVersions.provenance}->'packageSource'->>'sourceReference', '')
    = 'Synthetic QA smoke, not Curriculum content'
  or (
    coalesce(${contentImportVersions.provenance}->'packageSource'->>'sourceNamespace', '') ~ '^UPLOAD_[a-f0-9]{32}$'
    and coalesce(${contentImportVersions.provenance}->'packageSource'->>'sourceName', '') = 'TEST_ONLY_V5.xlsx'
  )
)`;

// Deduplicate full content rather than stem alone: different statements, keys or media are distinct.
// Round-robin across question formats keeps PGK examples alongside PG.
export const compactDemoVersionIds = sql`
  with candidates as (
    select ${questionVersions.id} as id, ${questionVersions.createdAt} as created_at,
      ${questionVersions.questionType} as question_type,
      row_number() over (
        partition by ${questionVersions.questionType}, ${questionVersions.stem},
          ${questionVersions.optionsOrStatements}, ${questionVersions.answerKey},
          ${questionVersions.explanation}, ${questionVersions.media}, ${questionVersions.difficulty}
        order by ${questionVersions.createdAt} desc, ${questionVersions.id} desc
      ) as duplicate_rank
    from ${questionVersions}
    join ${questionVariants} on ${questionVariants.id} = ${questionVersions.variantId}
    left join ${contentImportVersions}
      on ${contentImportVersions.questionVersionId} = ${questionVersions.id}
    -- Technical upload/R2 smoke fixtures stay in ALL/history, not the curated examples.
    where ${questionVariants.origin} in ('DEMO', 'DEMO_QA_NOT_CURRICULUM_APPROVED')
  ), distinct_examples as (
    select id, created_at, question_type,
      row_number() over (partition by question_type order by created_at desc, id desc) as type_rank
    from candidates where duplicate_rank = 1
  )
  select id from distinct_examples
  order by type_rank, question_type, created_at desc, id desc
  limit 10
`;
