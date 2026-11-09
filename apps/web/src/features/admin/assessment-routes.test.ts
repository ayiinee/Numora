import { expect, it } from 'vitest';
import { legacyAssessmentDestination, assessmentListQuery } from './assessment-routes';
it.each([
  ['type=DRILL&offset=5&search=aljabar', '/admin/assessments/drill?search=aljabar&offset=5'],
  ['type=TRYOUT&package=abc&status=PUBLISHED', '/admin/assessments/tryout/abc?status=PUBLISHED'],
  ['packageId=abc&chapter=bab&source=Tim', '/admin/assessments/pretest/abc?chapter=bab&source=Tim'],
  ['type=UNKNOWN&view=old', '/admin/assessments/pretest'],
])('preserves legacy destination and list context: %s', (query, destination) => {
  expect(legacyAssessmentDestination(new URLSearchParams(query))).toBe(destination);
});
it('only carries known list parameters, without trusting arbitrary return URLs', () => {
  expect(
    assessmentListQuery(new URLSearchParams('returnTo=https://example.test&package=x&offset=5')),
  ).toBe('?offset=5');
});
