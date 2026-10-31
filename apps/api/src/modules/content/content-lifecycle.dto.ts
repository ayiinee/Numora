import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ReviewImportedQuestionDto } from './content-packages.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength, validateSync } from 'class-validator';
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

// One route supports two explicit review intents; mixed/unknown payloads fail validation.
export function parseContentReview(input: unknown): ReviewContentDto | ReviewImportedQuestionDto {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException({ code: 'CONTENT_REVIEW_INVALID' });
  const body =
    'packageId' in input
      ? plainToInstance(ReviewImportedQuestionDto, input)
      : plainToInstance(ReviewContentDto, input);
  if (validateSync(body, { whitelist: true, forbidNonWhitelisted: true }).length)
    throw new BadRequestException({
      code: 'CONTENT_REVIEW_INVALID',
      detail:
        'Gunakan satu kontrak review lengkap: konfirmasi impor paket atau keputusan lifecycle versi.',
    });
  return body;
}
