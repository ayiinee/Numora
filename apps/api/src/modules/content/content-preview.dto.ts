import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { ContentAnswer, ContentKind } from '@tka/database';
import { DirectedImportContextDto } from './package-context.dto';

export class ImportBodyDto extends DirectedImportContextDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'For one-item editorial revision, reject a stale source version.',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID('4')
  expectedSourceVersionId?: string;
  @ApiPropertyOptional()
  @ValidateIf((o) => o.expectedSourceVersionId !== undefined || o.revisionReason !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  revisionReason?: string;
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{1,128}$' })
  @Matches(/^[A-Za-z0-9_-]{1,128}$/)
  sourceNamespace!: string;
  @ApiProperty({
    type: [Object],
    minItems: 1,
    maxItems: 100,
    description: 'Question import v2 JSON Schema; runtime and semantic validation apply.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  questions!: object[];
}
export class ImportIssueDto {
  @ApiProperty() code!: string;
  @ApiProperty() detail!: string;
  @ApiProperty({ type: String, nullable: true }) sheet!: string | null;
  @ApiProperty({ type: Number, nullable: true }) row!: number | null;
}
export class ImportItemDto {
  @ApiPropertyOptional({ type: [ImportIssueDto] }) issues?: ImportIssueDto[];
  @ApiProperty() externalId!: string;
  @ApiProperty() canImportDraft!: boolean;
  @ApiProperty() canPreview!: boolean;
  @ApiProperty({ type: [String] }) blockers!: string[];
  @ApiProperty({
    enum: ['VALIDATED', 'CREATED', 'CREATED_REVISION', 'SKIPPED_UNCHANGED', 'INVALID'],
  })
  outcome!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) questionVersionId!: string | null;
  @ApiPropertyOptional({ enum: ['ADD', 'REVISE', 'KEEP', 'REUSE', 'INVALID'] }) change?: string;
}
export class PackageCheckDto {
  @ApiProperty() code!: string;
  @ApiProperty() passed!: boolean;
  @ApiProperty() detail!: string;
}
export class PackageValidationDto {
  @ApiProperty({ format: 'uuid' }) packageId!: string;
  @ApiProperty() contentRevision!: number;
  @ApiProperty() canSaveDraft!: boolean;
  @ApiProperty() canPublish!: boolean;
  @ApiProperty() expectedCount!: number;
  @ApiProperty() actualCount!: number;
  @ApiProperty({ type: [String] }) blockers!: string[];
  @ApiProperty({ type: [String] }) removedVersionIds!: string[];
  @ApiProperty({ type: [PackageCheckDto] }) checks!: PackageCheckDto[];
}
export class ImportReportDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) id!: string | null;
  @ApiProperty() sourceNamespace!: string;
  @ApiProperty() canImportDraft!: boolean;
  @ApiProperty({ type: [ImportItemDto] }) items!: ImportItemDto[];
  @ApiPropertyOptional({ type: PackageValidationDto }) package?: PackageValidationDto;
}
export class CreatePreviewDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  questionVersionIds!: string[];
}
export const answerSchema = {
  nullable: true,
  oneOf: [
    {
      type: 'object' as const,
      required: ['optionId'],
      additionalProperties: false,
      properties: { optionId: { type: 'string' as const } },
    },
    {
      type: 'object' as const,
      required: ['optionIds'],
      additionalProperties: false,
      properties: { optionIds: { type: 'array' as const, items: { type: 'string' as const } } },
    },
    {
      type: 'object' as const,
      required: ['categoryByStatementId'],
      additionalProperties: false,
      properties: {
        categoryByStatementId: {
          type: 'object' as const,
          additionalProperties: { type: 'string' as const },
        },
      },
    },
  ],
};
export class SavePreviewAnswerDto {
  @ApiProperty(answerSchema) @Allow() answer!: ContentAnswer;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedRevision!: number;
}
export class PreviewAckDto {
  @ApiProperty({ format: 'uuid' }) instanceId!: string;
  @ApiProperty(answerSchema) answer!: ContentAnswer;
  @ApiProperty() revision!: number;
  @ApiProperty({ format: 'date-time' }) serverSavedAt!: string;
}
export class RichContentDto {
  @ApiProperty() text!: string;
}
export class PreviewOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: RichContentDto }) content!: RichContentDto;
}
export class PreviewCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
}
export class PreviewMediaDto {
  @ApiProperty({ format: 'uuid' }) instanceId!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty() altText!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class PreviewItemDto extends PreviewAckDto {
  @ApiProperty({ format: 'uuid' }) questionVersionId!: string;
  @ApiProperty() externalId!: string;
  @ApiProperty({ enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] })
  type!: ContentKind;
  @ApiProperty({ type: RichContentDto }) stem!: RichContentDto;
  @ApiProperty({ type: [PreviewOptionDto] }) options!: PreviewOptionDto[];
  @ApiProperty({ type: [PreviewCategoryDto] }) categories!: PreviewCategoryDto[];
  @ApiPropertyOptional(answerSchema) answerKey?: ContentAnswer;
  @ApiPropertyOptional({ type: RichContentDto }) explanation?: RichContentDto;
  @ApiProperty({ type: Number, nullable: true }) score!: null;
}
export class PreviewSessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['IN_PROGRESS', 'SUBMITTED'] }) state!: 'IN_PROGRESS' | 'SUBMITTED';
  @ApiProperty({ enum: ['NOT_SCORED'] }) scoringStatus!: 'NOT_SCORED';
  @ApiProperty({ type: Number, nullable: true }) score!: null;
  @ApiProperty({ type: [PreviewItemDto] }) items!: PreviewItemDto[];
  @ApiProperty({ type: [PreviewMediaDto] }) media!: PreviewMediaDto[];
}
export class MediaLinkRequestDto {
  @ApiProperty({ enum: ['WORK', 'REVIEW'] }) @Matches(/^(WORK|REVIEW)$/) phase!: 'WORK' | 'REVIEW';
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') instanceId!: string;
  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  assetIds!: string[];
}
export class MediaLinksDto {
  @ApiProperty({ type: [PreviewMediaDto] }) media!: PreviewMediaDto[];
}
