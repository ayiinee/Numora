import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { DrillQuestionDto, ReviewedQuestionDto, AssessmentXpDetailDto } from './learning.dto';

export class StartTryoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  packageId!: string;
}

export class CurrentTryoutDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) closeAt?:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) resultDueAt?:
    string | null;
  @ApiPropertyOptional({ enum: ['CONTENT_PENDING', 'SCORING_PENDING'], nullable: true })
  resultPendingReason?: 'CONTENT_PENDING' | 'SCORING_PENDING' | null;
  @ApiPropertyOptional() isDemo?: boolean;
  @ApiProperty({ type: String, format: 'uuid', required: false }) id?: string;
  @ApiProperty({ required: false }) title?: string;
  @ApiProperty({ type: String, format: 'date-time', required: false }) releaseAt?: string;
  @ApiProperty({
    enum: ['unavailable', 'open', 'inProgress', 'waitingIrt', 'resultReady'],
    description:
      'Current package/attempt availability. Unavailable returns only state; it does not deny Student feature access.',
  })
  state!: string;
  @ApiProperty({
    required: false,
    description:
      'Whether this Student may start a new attempt for the available current package, regardless of class affiliation. False when an attempt already exists; omitted when unavailable.',
  })
  eligible?: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false }) attemptId?:
    string | null;
  @ApiProperty({ type: Number, nullable: true, required: false }) questionCount?: number | null;
  @ApiProperty({ type: Number, nullable: true, required: false }) durationSeconds?: number | null;
}

export class TryoutAttemptDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) closeAt?:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) resultDueAt?:
    string | null;
  @ApiPropertyOptional({ enum: ['CONTENT_PENDING', 'SCORING_PENDING'], nullable: true })
  resultPendingReason?: 'CONTENT_PENDING' | 'SCORING_PENDING' | null;
  @ApiPropertyOptional() isDemo?: boolean;
  @ApiProperty({
    type: Number,
    nullable: true,
    required: false,
    description:
      'Persisted XP available after completion, independently of IRT release; null for active/legacy attempts.',
  })
  xp?: number | null;
  @ApiProperty({ type: Number, nullable: true, required: false }) xpPolicyVersion?: number | null;
  @ApiProperty({ type: String, format: 'date-time', required: false }) serverTime?: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) packageId!: string;
  @ApiProperty() packageTitle!: string;
  @ApiProperty({ enum: ['inProgress', 'submitted'] }) status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deadlineAt!: string | null;
  @ApiProperty({ type: [DrillQuestionDto] }) questions!: DrillQuestionDto[];
}

export class TryoutPackageDto extends CurrentTryoutDto {
  @ApiProperty({ enum: ['ongoing', 'past', 'unavailable'] }) periodState!:
    'ongoing' | 'past' | 'unavailable';
}
export class TryoutPackagesDto {
  @ApiProperty({ type: [TryoutPackageDto] }) packages!: TryoutPackageDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class TryoutSubmitDto {
  @ApiProperty({ type: Number, nullable: true, required: false }) xpPolicyVersion?: number | null;
  @ApiProperty({ enum: ['waitingIrt'] }) state!: 'waitingIrt';
  @ApiProperty({
    type: Number,
    nullable: true,
    required: false,
    description:
      'Immediate XP, independent of later IRT result release; null for legacy policy attempts.',
  })
  xp?: number | null;
}

export class TryoutReviewedQuestionDto extends ReviewedQuestionDto {}

export class TryoutResultDto {
  @ApiPropertyOptional({
    enum: ['IRT', 'STANDARD'],
    nullable: true,
    description:
      'Published canonical method for this attempt; null for legacy scores without provenance.',
  })
  resultMethod?: 'IRT' | 'STANDARD' | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Public-safe reason from approved result provenance.',
  })
  resultMethodReason?: string | null;
  @ApiPropertyOptional({ type: AssessmentXpDetailDto, nullable: true })
  xpDetail?: AssessmentXpDetailDto | null;
  @ApiProperty({ type: Number, nullable: true, required: false }) xp?: number | null;
  @ApiProperty({ type: Number, nullable: true, required: false }) xpPolicyVersion?: number | null;
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty() packageTitle!: string;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ enum: ['IRT', 'FALLBACK', 'UNSCORABLE', 'DEMO'], required: false }) mode?: string;
  @ApiProperty({ type: Number, nullable: true, required: false }) publicationVersion?:
    number | null;
  @ApiProperty() correctCount!: number;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ type: [TryoutReviewedQuestionDto] }) explanation!: TryoutReviewedQuestionDto[];
}
