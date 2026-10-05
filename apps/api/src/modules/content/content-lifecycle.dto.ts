import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { ImportQuestion } from '@tka/database';
import { statuses, type ContentState } from './content.dto';

export class ReviewContentDto {
  @ApiProperty({ enum: ['READY', 'REVISION', 'ARCHIVED'] })
  @IsIn(['READY', 'REVISION', 'ARCHIVED'])
  status!: 'READY' | 'REVISION' | 'ARCHIVED';
  @ApiProperty({ enum: statuses }) @IsIn(statuses) expectedStatus!: ContentState;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) reason!: string;
}
export class ContentReadinessDto {
  @ApiProperty() canReviewReady!: boolean;
  @ApiProperty({ type: [String] }) contentBlockers!: string[];
  @ApiProperty({ type: [String] }) publicationBlockers!: string[];
}
export class ContentReviewEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty() at!: string;
  @ApiProperty() status!: string;
  @ApiProperty() reason!: string;
}
export class ContentVersionDetailDto {
  @ApiProperty({ type: [ContentReviewEventDto] }) reviews!: ContentReviewEventDto[];
  @ApiProperty() id!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty({ enum: statuses }) status!: ContentState;
  @ApiProperty({ type: String, nullable: true }) revisedFromId!: string | null;
  @ApiProperty({ type: String, nullable: true }) sourceNamespace!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedByUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiProperty({
    type: Object,
    description:
      'Question import v2 payload, including key and durable asset references. Admin only.',
  })
  payload!: ImportQuestion;
  @ApiProperty({ type: ContentReadinessDto }) readiness!: ContentReadinessDto;
}
