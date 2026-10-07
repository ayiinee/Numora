import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  attemptItems,
  getDatabase,
  questionVersions,
  type ContentAsset,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { R2MediaStorage } from '../content/r2-media.storage';
import type { MediaLinksDto } from '../content/content-preview.dto';
import { TryoutReleaseService } from './tryout-release.service';
import { DRILL_REWARD_POLICY_VERSION, explanationAvailable } from './drill.policy';

@Injectable()
export class AssessmentMediaService {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
    @Inject(TryoutReleaseService) private readonly releases: TryoutReleaseService,
  ) {}
  async links(auth: string | undefined, instanceId: string, phase: string): Promise<MediaLinksDto> {
    if (!['WORK', 'REVIEW'].includes(phase))
      throw new BadRequestException({ code: 'MEDIA_PHASE_INVALID' });
    const student = await this.identity.me(auth);
    if (student.role !== 'STUDENT') throw new ForbiddenException({ code: 'STUDENT_REQUIRED' });
    const [row] = await getDatabase()
      .db.select({ attempt: assessmentAttempts, media: questionVersions.media })
      .from(attemptItems)
      .innerJoin(assessmentAttempts, eq(assessmentAttempts.id, attemptItems.attemptId))
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .where(
        and(
          eq(attemptItems.id, instanceId),
          eq(assessmentAttempts.studentId, student.id),
          eq(assessmentAttempts.purpose, 'REGULAR'),
        ),
      );
    if (!row) throw new NotFoundException({ code: 'ASSESSMENT_MEDIA_NOT_FOUND' });
    const attempt = row.attempt;
    if (
      phase === 'REVIEW' &&
      (attempt.status !== 'GRADED' ||
        attempt.assessmentType === 'PRETEST' ||
        (attempt.assessmentType === 'TRYOUT' &&
          !(await this.releases.releasedPackageIds([attempt.packageId])).has(attempt.packageId)) ||
        (attempt.assessmentType === 'DRILL' &&
          attempt.drillPolicyVersion !== DRILL_REWARD_POLICY_VERSION &&
          (!attempt.finishedAt || !explanationAvailable(attempt.finishedAt))))
    )
      throw new ForbiddenException({ code: 'ASSESSMENT_REVIEW_NOT_AVAILABLE' });
    if (phase === 'WORK' && attempt.status !== 'IN_PROGRESS')
      throw new ForbiddenException({ code: 'ASSESSMENT_NOT_ACTIVE' });
    const assets = (Array.isArray(row.media) ? row.media : []) as ContentAsset[];
    return {
      media: await Promise.all(
        assets
          .filter((a) => phase === 'REVIEW' || a.placement !== 'EXPLANATION')
          .map(async (a) => {
            if (!a.bucket || !a.objectKey)
              throw new ServiceUnavailableException({ code: 'ASSESSMENT_MEDIA_NOT_READY' });
            return {
              instanceId,
              assetId: a.assetId,
              altText: a.altText,
              ...(await this.storage.readLink(a.bucket, a.objectKey)),
            };
          }),
      ),
    };
  }
}
