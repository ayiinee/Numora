import { Injectable } from '@nestjs/common';
import { publishedTryoutAttemptResults, releasedTryoutPackageIds, type AssessmentReader } from '@tka/database';

export type StudentTryoutResultState = 'waiting' | 'overdue' | 'ready';

export function tryoutResultState(
  status: string | null | undefined,
  published: boolean,
  dueAt: Date | null,
  now: Date,
): StudentTryoutResultState | null {
  if (status !== 'GRADED' && status !== 'SUBMITTED') return null;
  if (published) return 'ready';
  return dueAt && now >= dueAt ? 'overdue' : 'waiting';
}

@Injectable()
export class TryoutReleaseService {
  releasedPackageIds(packageIds: string[], now = new Date(), reader?: AssessmentReader) {
    return releasedTryoutPackageIds(packageIds, now, reader);
  }
  publishedResults(attemptIds: string[], now = new Date(), reader?: AssessmentReader) {
    return publishedTryoutAttemptResults(attemptIds, now, reader);
  }

  async studentPublications(
    attempts: { id: string; packageId: string; isDemo: boolean; status: string }[],
    now: Date,
    reader?: AssessmentReader,
  ) {
    const completed = attempts.filter(
      ({ status }) => status === 'SUBMITTED' || status === 'GRADED',
    );
    const [packages, canonical] = await Promise.all([
      this.releasedPackageIds([...new Set(completed.map(({ packageId }) => packageId))], now, reader),
      this.publishedResults(
        completed.map(({ id }) => id),
        now,
        reader,
      ),
    ]);
    const ready = new Set(
      completed
        .filter(
          ({ id, packageId, isDemo }) => packages.has(packageId) && (isDemo || canonical.has(id)),
        )
        .map(({ id }) => id),
    );
    return { ready, canonical };
  }
}
