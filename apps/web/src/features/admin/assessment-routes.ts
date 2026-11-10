import type { CreateContentPackageDto } from './generated-types';
export type AssessmentUsage = CreateContentPackageDto['assessmentType'];
export const assessmentTypes = { pretest: 'PRETEST', drill: 'DRILL', tryout: 'TRYOUT' } as const;
export const assessmentLabels = { PRETEST: 'Pretest', DRILL: 'Drill', TRYOUT: 'Tryout' } as const;
export function assessmentPath(type: AssessmentUsage, id?: string) {
  return `/admin/assessments/${type.toLowerCase()}${id ? `/${encodeURIComponent(id)}` : ''}`;
}
export function assessmentListQuery(params: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of ['search', 'status', 'chapter', 'source', 'offset']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return next.size ? `?${next}` : '';
}
export function legacyAssessmentDestination(params: URLSearchParams, forcedType?: AssessmentUsage) {
  const type =
    forcedType ??
    (['DRILL', 'TRYOUT'].includes(params.get('type') ?? '')
      ? (params.get('type') as AssessmentUsage)
      : 'PRETEST');
  const id =
    params.get('package') || params.get('packageId') || params.get('pretest') || params.get('id');
  return assessmentPath(type, id || undefined) + assessmentListQuery(params);
}
