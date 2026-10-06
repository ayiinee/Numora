import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import { DrillQuestionDto, SavedAnswerDto, SaveDrillAnswerDto } from './learning.dto';

export class StartPretestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() chapterId!: string;
}
export class SavePretestAnswerDto extends SaveDrillAnswerDto {
  @ApiProperty({
    minimum: 0,
    description: 'Last acknowledged answer revision; stale writes return 409.',
  })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}
export class PretestQuestionDto extends DrillQuestionDto {
  @ApiProperty() revision!: number;
}
export class PretestSavedAnswerDto extends SavedAnswerDto {
  @ApiProperty() revision!: number;
}
export class PretestChapterDto {
  @ApiProperty({ format: 'uuid' }) chapterId!: string;
  @ApiProperty() chapterTitle!: string;
  @ApiProperty({ enum: ['unavailable', 'available', 'inProgress', 'completed', 'skipped'] })
  state!: string;
  @ApiProperty({ type: String, nullable: true }) attemptId!: string | null;
  @ApiProperty() canStart!: boolean;
  @ApiProperty() canSkip!: boolean;
  @ApiProperty() skipped!: boolean;
  @ApiProperty() isDemo!: boolean;
}
export class PretestAttemptDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) chapterId!: string;
  @ApiProperty() chapterTitle!: string;
  @ApiProperty({ enum: ['inProgress', 'completed'] }) status!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: [PretestQuestionDto] }) questions!: PretestQuestionDto[];
}
export class PretestUnlockedLevelDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
}
export class PretestResultDto {
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty({ format: 'uuid' }) chapterId!: string;
  @ApiProperty() chapterTitle!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ type: Number, nullable: true }) correctCount!: number | null;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ type: Number, nullable: true }) initialLevel!: number | null;
  @ApiProperty({ enum: ['applied', 'unavailable'] }) mappingStatus!: string;
  @ApiProperty({ type: [PretestUnlockedLevelDto] }) unlockedLevels!: PretestUnlockedLevelDto[];
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) completedAt?:
    string | null;
}
