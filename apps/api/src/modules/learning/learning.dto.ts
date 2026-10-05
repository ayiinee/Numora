import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsUUID } from 'class-validator';
import type { ContentAnswer } from '@tka/database';
import {
  answerSchema,
  RichContentDto,
  PreviewOptionDto,
  PreviewCategoryDto,
} from '../content/content-preview.dto';

export class StartDrillDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  levelId!: string;
}

export class SaveDrillAnswerDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'A-D for demo; null clears the answer.',
    required: false,
  })
  @Allow()
  optionId?: string | null;
  @ApiPropertyOptional(answerSchema) @Allow() answer?: ContentAnswer;
}

export class ChapterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional() slug?: string;
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
}

export class SubchapterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional() slug?: string;
  @ApiProperty({ format: 'uuid' }) chapterId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
}

export class LevelDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ enum: ['locked', 'open', 'inProgress', 'completed'] }) status!: string;
  @ApiProperty({ type: Number, nullable: true }) latestScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) bestScore!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 3 }) latestStars?:
    number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 3 }) bestStars?:
    number | null;
}

export class CatalogDto {
  @ApiProperty({ type: [ChapterDto] }) chapters!: ChapterDto[];
}
export class ChapterDetailDto {
  @ApiProperty({ type: ChapterDto }) chapter!: ChapterDto;
  @ApiProperty({ type: [SubchapterDto] }) subchapters!: SubchapterDto[];
}
export class SubchapterDetailDto {
  @ApiProperty({ type: SubchapterDto }) subchapter!: SubchapterDto;
  @ApiProperty({ type: [LevelDto] }) levels!: LevelDto[];
}
export class StudentProgressDto {
  @ApiProperty() completedLevels!: number;
  @ApiProperty() totalLevels!: number;
  @ApiProperty({ type: Number, nullable: true }) latestScore!: number | null;
}

export class OptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
}
export class DrillQuestionDto {
  @ApiPropertyOptional({ enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] })
  type?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
  @ApiPropertyOptional({ type: RichContentDto }) richStem?: RichContentDto;
  @ApiPropertyOptional({ type: [PreviewOptionDto] }) richOptions?: PreviewOptionDto[];
  @ApiPropertyOptional({ type: [PreviewCategoryDto] }) categories?: PreviewCategoryDto[];
  @ApiPropertyOptional(answerSchema) answer?: ContentAnswer;
  @ApiProperty({ format: 'uuid' }) questionInstanceId!: string;
  @ApiProperty() stem!: string;
  @ApiProperty({ type: [OptionDto] }) options!: OptionDto[];
  @ApiProperty({ type: String, nullable: true }) selectedOptionId!: string | null;
}
export class DrillAttemptDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) levelId!: string;
  @ApiProperty() levelTitle!: string;
  @ApiProperty({ enum: ['inProgress', 'completed'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Database time for count-up display; server timestamps own reward duration.',
  })
  serverTime?: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: [DrillQuestionDto] }) questions!: DrillQuestionDto[];
}
export class SavedAnswerDto {
  @ApiPropertyOptional(answerSchema) answer?: ContentAnswer;
  @ApiProperty({ format: 'uuid' }) questionInstanceId!: string;
  @ApiProperty({ type: String, nullable: true }) selectedOptionId!: string | null;
}
export class ReviewedQuestionDto extends DrillQuestionDto {
  @ApiProperty({ type: String, nullable: true }) correctOptionId!: string | null;
  @ApiProperty() explanation!: string;
  @ApiPropertyOptional({ type: RichContentDto }) richExplanation?: RichContentDto;
  @ApiPropertyOptional(answerSchema) answerKey?: ContentAnswer;
  @ApiPropertyOptional() fullyCorrect?: boolean;
}
export class RecommendedVideoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiProperty() source!: string;
}
export class DrillRewardDto {
  @ApiProperty() policyCode!: string;
  @ApiProperty() policyVersion!: number;
  @ApiProperty() baseXp!: number;
  @ApiProperty({ description: 'Unrounded speed bonus stored at submission.' }) bonusXp!: number;
  @ApiProperty({ description: 'Once-rounded final XP, including bonus and cap.' }) totalXp!: number;
  @ApiProperty() durationSeconds!: number;
}
export class DrillResultDto {
  @ApiPropertyOptional({ type: Number, nullable: true }) xp?: number | null;
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty({ format: 'uuid' }) levelId!: string;
  @ApiProperty() levelTitle!: string;
  @ApiProperty() score!: number;
  @ApiProperty() rawPoints!: number;
  @ApiProperty() correctCount!: number;
  @ApiProperty() questionCount!: number;
  @ApiProperty() mastered!: boolean;
  @ApiProperty({ type: Number, nullable: true }) stars!: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Pinned at start. Null identifies the historical Drill policy.',
  })
  drillPolicyVersion?: number | null;
  @ApiPropertyOptional({
    type: DrillRewardDto,
    nullable: true,
    description: 'Persisted ledger details; null for legacy attempts without this reward policy.',
  })
  reward?: DrillRewardDto | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) unlockedLevelId!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ enum: ['available', 'expired'] }) explanationState!: string;
  @ApiProperty({ type: [ReviewedQuestionDto] }) questions!: ReviewedQuestionDto[];
  @ApiProperty({ type: [RecommendedVideoDto] }) recommendations!: RecommendedVideoDto[];
}

export class AssessmentRecordDto {
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty({ enum: ['drill', 'pretest', 'tryout'] }) activity!: string;
  @ApiProperty() title!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    required: false,
    description: 'Chapter ID pinned at attempt start.',
  })
  chapterId?: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description: 'Current taxonomy label; not a historical content snapshot.',
  })
  chapterTitle?: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false }) subchapterId?:
    string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) subchapterTitle?: string | null;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    required: false,
    description: 'Level ID pinned at attempt start; absent for non-level assessments.',
  })
  levelId?: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) levelTitle?: string | null;
  @ApiProperty({
    enum: ['ready', 'legacy', 'pending', 'notApplicable'],
    required: false,
    description:
      'Persisted XP is available independently of IRT release. Legacy XP is unknown, not zero; Pretest has no XP.',
  })
  xpState?: 'ready' | 'legacy' | 'pending' | 'notApplicable';
  @ApiProperty({ enum: ['ready', 'legacy', 'pending', 'notApplicable'], required: false })
  starsState?: 'ready' | 'legacy' | 'pending' | 'notApplicable';
  @ApiPropertyOptional({ type: Number, nullable: true }) xp?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) stars?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) drillPolicyVersion?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) tryoutXpPolicyVersion?: number | null;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ enum: ['ready', 'waitingIrt'] }) resultState!: string;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
}

export class AssessmentHistoryDto {
  @ApiProperty({ type: [AssessmentRecordDto] }) records!: AssessmentRecordDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!: string | null;
}
