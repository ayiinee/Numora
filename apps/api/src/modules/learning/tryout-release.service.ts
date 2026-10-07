import { Injectable } from '@nestjs/common';
import { publishedTryoutAttemptResults, releasedTryoutPackageIds } from '@tka/database';

@Injectable()
export class TryoutReleaseService {
  releasedPackageIds(packageIds: string[], now = new Date()) {
    return releasedTryoutPackageIds(packageIds, now);
  }
  async publishedResults(attemptIds: string[], now = new Date()) {
    const results = await publishedTryoutAttemptResults(attemptIds, now);
    return new Map(
      [...results].map(([id, { score, mode, version }]) => [id, { score, mode, version }]),
    );
  }
}
