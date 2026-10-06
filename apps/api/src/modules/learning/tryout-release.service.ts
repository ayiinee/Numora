import { Injectable } from '@nestjs/common';
import {
  getDatabase,
  releasedTryoutPackageIds,
  tryoutAttemptResults,
  tryoutResultFinalizations,
} from '@tka/database';
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';

@Injectable()
export class TryoutReleaseService {
  releasedPackageIds(packageIds: string[], now = new Date()) {
    return releasedTryoutPackageIds(packageIds, now);
  }
  async publishedResults(attemptIds: string[], now = new Date()) {
    if (!attemptIds.length)
      return new Map<string, { score: number | null; mode: string; version: number }>();
    const rows = await getDatabase()
      .db.select({
        attemptId: tryoutAttemptResults.attemptId,
        score: tryoutAttemptResults.score,
        mode: tryoutResultFinalizations.mode,
        version: tryoutResultFinalizations.version,
      })
      .from(tryoutAttemptResults)
      .innerJoin(
        tryoutResultFinalizations,
        eq(tryoutResultFinalizations.id, tryoutAttemptResults.finalizationId),
      )
      .where(
        and(
          inArray(tryoutAttemptResults.attemptId, attemptIds),
          isNotNull(tryoutResultFinalizations.publishedAt),
          lte(tryoutResultFinalizations.publishedAt, now),
        ),
      );
    return new Map(
      rows.map((r) => [
        r.attemptId,
        { score: r.score == null ? null : Number(r.score), mode: r.mode, version: r.version },
      ]),
    );
  }
}
