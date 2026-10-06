import { sql } from 'drizzle-orm';
import { assessmentPackages } from './schema/assessments.js';

export const developmentProjectRef = 'pkamenfnwmoeisccnrnk';

/** Explicit opt-in, never inferred from a seed marker or a browser request. */
export function allowSyntheticContent(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_SYNTHETIC_CONTENT !== 'true') return false;
  let target: URL;
  try {
    target = new URL(env.DATABASE_URL || env.TEST_DATABASE_URL || '');
  } catch {
    throw new Error('Synthetic content requires a verified isolated database target.');
  }
  if (
    env.NODE_ENV === 'test' &&
    ['localhost', '127.0.0.1'].includes(target.hostname) &&
    /^\/numora_test(?:_[a-z0-9_]+)?$/.test(target.pathname) &&
    ['postgres:', 'postgresql:'].includes(target.protocol)
  )
    return true;
  const ref = developmentProjectRef;
  if (
    env.NODE_ENV === 'development' &&
    env.SUPABASE_PROJECT_REF === ref &&
    env.SUPABASE_URL === `https://${ref}.supabase.co` &&
    (!env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL === env.SUPABASE_URL) &&
    ['postgres:', 'postgresql:'].includes(target.protocol) &&
    target.pathname === '/postgres' &&
    ['require', 'verify-full'].includes(target.searchParams.get('sslmode') ?? '') &&
    (target.port || '5432') === '5432' &&
    ((target.hostname === `db.${ref}.supabase.co` &&
      decodeURIComponent(target.username) === 'postgres') ||
      (target.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(target.username) === `postgres.${ref}`))
  )
    return true;
  throw new Error(
    'Synthetic content is restricted to the named Development project or isolated tests.',
  );
}

/** New distribution only. Existing owned attempts retain their historical pins. */
export function packageRuntimeEligibility() {
  const p = assessmentPackages;
  const approved = sql`(not ${p.isDemo} and ${p.frozenAt} is not null
    and ${p.curriculumApproval}->>'manifestDigest' = ${p.manifestDigest}
    and length(trim(${p.curriculumApproval}->>'reference')) > 0
    and length(trim(${p.curriculumApproval}->>'approvedAt')) > 0
    and exists (select 1 from public.assessment_blueprint_versions b
      where b.id = ${p.blueprintVersionId} and b.status = 'SEALED'))`;
  return allowSyntheticContent() ? sql`(${p.isDemo} or ${approved})` : approved;
}

/** Reviewed Admin Excel Tryout: statistical generator quality is a separate pipeline. */
export function tryoutDistributionEligibility() {
  const p = assessmentPackages;
  return sql`(public.package_can_distribute(${p.id}) or (
 ${p.assessmentType}='TRYOUT' and ${p.purpose}='REGULAR' and ${p.status}='PUBLISHED'
 and ${packageRuntimeEligibility()}
 and (select count(*) from public.package_items i where i.package_id=${p.id})=30
 and not exists(select 1 from public.package_items i join public.question_versions v on v.id=i.question_version_id where i.package_id=${p.id} and (v.content_status<>'READY' or v.reviewed_at is null or not exists(select 1 from public.content_import_versions imported where imported.question_version_id=v.id)))
 and not exists(select 1 from public.package_items i join public.item_distribution_decisions d on d.question_version_id=i.question_version_id where i.package_id=${p.id} and d.state in ('HOLD','RETIRED') and not exists(select 1 from public.item_distribution_decisions newer where newer.question_version_id=d.question_version_id and newer.context_id=d.context_id and newer.purpose=d.purpose and (newer.created_at,newer.id)>(d.created_at,d.id)))
 ))`;
}
