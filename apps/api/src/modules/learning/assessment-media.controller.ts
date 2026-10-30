import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  assessmentAttempts,
  attemptItems,
  getDatabase,
  questionVersions,
  type ContentAsset,
} from '@tka/database';
import { and, eq } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { MediaLinkRequestDto, MediaLinksDto } from '../content/content-preview.dto';
import { R2MediaStorage } from '../content/r2-media.storage';
import { TryoutReleaseService } from './tryout-release.service';
import { explanationAvailable, DRILL_REWARD_POLICY_VERSION } from './drill.policy';

@ApiTags('core-learning')
@ApiBearerAuth()
@Controller('assessment-attempts')
export class AssessmentMediaController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
    @Inject(TryoutReleaseService) private readonly release: TryoutReleaseService,
  ) {}
  @Post(':attemptId/media')
  @HttpCode(200)
  @ApiOkResponse({ type: MediaLinksDto })
  async media(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) id: string,
    @Body() body: MediaLinkRequestDto,
  ) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw new ForbiddenException({ code: 'STUDENT_REQUIRED' });
    const { db } = getDatabase();
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.id, id), eq(assessmentAttempts.studentId, user.id)));
    if (
      !attempt ||
      !['DRILL', 'TRYOUT'].includes(attempt.assessmentType) ||
      attempt.purpose !== 'REGULAR'
    )
      throw new NotFoundException({ code: 'ATTEMPT_NOT_FOUND' });
    if (body.phase === 'WORK' && attempt.status !== 'IN_PROGRESS')
      throw new ConflictException({ code: 'ATTEMPT_NOT_ACTIVE' });
    if (body.phase === 'REVIEW') {
      if (attempt.status !== 'GRADED' || !attempt.finishedAt)
        throw new ConflictException({ code: 'ASSESSMENT_REVIEW_UNAVAILABLE' });
      if (
        attempt.assessmentType === 'DRILL'
          ? attempt.drillPolicyVersion !== DRILL_REWARD_POLICY_VERSION &&
            !explanationAvailable(attempt.finishedAt)
          : !(await this.release.releasedPackageIds([attempt.packageId])).has(attempt.packageId)
      )
        throw new ConflictException({ code: 'ASSESSMENT_REVIEW_UNAVAILABLE' });
    }
    const [item] = await db
      .select({ media: questionVersions.media })
      .from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .where(and(eq(attemptItems.attemptId, id), eq(attemptItems.id, body.instanceId)));
    if (!item) throw new NotFoundException({ code: 'ATTEMPT_ITEM_NOT_FOUND' });
    const assets = ((item.media ?? []) as ContentAsset[]).filter(
      (a) =>
        body.assetIds.includes(a.assetId) &&
        (body.phase === 'REVIEW' || a.placement !== 'EXPLANATION'),
    );
    if (assets.length !== body.assetIds.length || assets.some((a) => !a.objectKey))
      throw new BadRequestException({ code: 'MEDIA_SCOPE_INVALID' });
    return {
      media: await Promise.all(
        assets.map(async (a) => ({
          instanceId: body.instanceId,
          assetId: a.assetId,
          altText: a.altText,
          ...(await this.storage.readLink(a.bucket, a.objectKey!)),
        })),
      ),
    };
  }
}
