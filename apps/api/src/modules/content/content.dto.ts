import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsYouTubeVideoUrl } from './youtube-url';

export const statuses = ['DRAFT', 'READY', 'ARCHIVED', 'REVISION'] as const;
export type ContentState = (typeof statuses)[number];

export class ContentPageDto {
  @ApiPropertyOptional({ default: 0 })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  offset = 0;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class TaxonomyBaseDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9-]{1,64}$/) code!: string;
  @ApiPropertyOptional({
    description: 'Stable lowercase URL slug; generated from name when omitted on create.',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MaxLength(200)
  slug?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) @Matches(/\S/) name!: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(100_000) displayOrder!: number;
  @ApiPropertyOptional({ enum: statuses, default: 'DRAFT' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(statuses)
  status?: ContentState;
}
export class CreateChapterDto extends TaxonomyBaseDto {
  @ApiPropertyOptional({
    enum: ['algebra', 'geometry', 'numbers', 'statistics'],
    nullable: true,
    type: String,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsIn(['algebra', 'geometry', 'numbers', 'statistics'])
  materialCategory?: string | null;
}
export class UpdateChapterDto extends PartialType(CreateChapterDto, {
  skipNullProperties: false,
}) {}
export class CreateSubchapterDto extends TaxonomyBaseDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() chapterId!: string;
}
export class UpdateSubchapterDto extends PartialType(OmitType(CreateSubchapterDto, ['chapterId']), {
  skipNullProperties: false,
}) {}
export class CreateCompetencyDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() subchapterId!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9-]{1,64}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) description!: string;
  @ApiPropertyOptional({ enum: statuses })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(statuses)
  status?: ContentState;
}
export class UpdateCompetencyDto extends PartialType(
  OmitType(CreateCompetencyDto, ['subchapterId']),
  { skipNullProperties: false },
) {}
export class CreateLevelDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() subchapterId!: string;
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  levelNumber!: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ enum: statuses })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(statuses)
  status?: ContentState;
}
export class UpdateLevelDto extends PartialType(
  OmitType(CreateLevelDto, ['subchapterId', 'levelNumber']),
  { skipNullProperties: false },
) {}
export class ContentStatusDto {
  @ApiProperty({ enum: statuses }) @IsIn(statuses) status!: ContentState;
}
export class ContentOptionDto {
  @ApiProperty() @IsIn(['A', 'B', 'C', 'D']) id!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) @Matches(/\S/) text!: string;
}
// The first authoring UI supports the approved prototype SINGLE_CHOICE shape.
// PGK remains in the durable schema, pending OPEN-04; this DTO does not invent its scoring.
export class QuestionContentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(8000) @Matches(/\S/) stem!: string;
  @ApiProperty({ type: [ContentOptionDto], minItems: 4, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ContentOptionDto)
  options!: ContentOptionDto[];
  @ApiProperty() @IsIn(['A', 'B', 'C', 'D']) answerOptionId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(8000) @Matches(/\S/) explanation!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) @Matches(/\S/) difficulty!: string;
}
export class CreateQuestionDto extends QuestionContentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() primaryCompetencyId!: string;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Curriculum level within the indicator; not difficulty.',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  curriculumLevelNumber?: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(300)
  sourceRef?: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9-]{1,64}$/) variantCode!: string;
}
export class CreateVariantDto extends QuestionContentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() originalVariantId!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9-]{1,64}$/) variantCode!: string;
}
const videoStatuses = statuses;
export class CreateVideoDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(240) @Matches(/\S/) title!: string;
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsYouTubeVideoUrl()
  @MaxLength(2000)
  url!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) @Matches(/\S/) source!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() subchapterId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(100_000) recommendationOrder!: number;
  @ApiPropertyOptional({ enum: videoStatuses })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(videoStatuses)
  status?: (typeof videoStatuses)[number];
}
export class UpdateVideoDto extends PartialType(CreateVideoDto, { skipNullProperties: false }) {}

export class AdminTaxonDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['algebra', 'geometry', 'numbers', 'statistics'],
  })
  materialCategory?: string | null;
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['CHAPTER', 'SUBCHAPTER', 'COMPETENCY', 'LEVEL'] }) kind!:
    'CHAPTER' | 'SUBCHAPTER' | 'COMPETENCY' | 'LEVEL';
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) slug?: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ enum: statuses }) status!: ContentState;
}
export class AdminCurriculumDto {
  @ApiProperty({ type: [AdminTaxonDto] }) items!: AdminTaxonDto[];
}
export class AdminVersionDto {
  @ApiProperty({ required: false }) imported?: boolean;
  @ApiProperty() id!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty() primaryCompetencyId!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) curriculumLevelNumber?: number | null;
  @ApiProperty() variantId!: string;
  @ApiProperty() variantCode!: string;
  @ApiProperty({ enum: ['ORIGINAL', 'VARIANT'] }) variantKind!: 'ORIGINAL' | 'VARIANT';
  @ApiProperty({ type: String, nullable: true }) originalVariantId!: string | null;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() questionType!: string;
  @ApiProperty() stem!: string;
  @ApiProperty({ type: [ContentOptionDto] }) options!: ContentOptionDto[];
  @ApiProperty({ type: String, nullable: true }) answerOptionId!: string | null;
  @ApiProperty() explanation!: string;
  @ApiProperty({ type: String, nullable: true }) difficulty!: string | null;
  @ApiProperty({ enum: statuses }) contentStatus!: ContentState;
  @ApiProperty({ enum: statuses }) questionStatus!: ContentState;
  @ApiProperty({ type: String, nullable: true }) reviewedByUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedAt!: string | null;
}
export class AdminVersionsDto {
  @ApiProperty({ type: [AdminVersionDto] }) items!: AdminVersionDto[];
}
export class AdminVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() mappingId!: string;
  @ApiProperty() subchapterId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() url!: string;
  @ApiProperty() source!: string;
  @ApiProperty() recommendationOrder!: number;
  @ApiProperty({ enum: videoStatuses }) status!: (typeof videoStatuses)[number];
}
export class AdminVideosDto {
  @ApiProperty({ type: [AdminVideoDto] }) items!: AdminVideoDto[];
}
export class ContentMutationDto {
  @ApiProperty() id!: string;
}

export class CreateTryoutDraftDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9-]{1,64}$/) familyCode!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100_000) packageVersion!: number;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) @Matches(/\S/) name!: string;
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  questionVersionIds!: string[];
}
export class UpdateTryoutDraftDto extends OmitType(CreateTryoutDraftDto, [
  'familyCode',
  'packageVersion',
]) {}
export class AdminTryoutDraftDto {
  @ApiProperty() id!: string;
  @ApiProperty() familyCode!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [String] }) questionVersionIds!: string[];
}
export class AdminTryoutDraftsDto {
  @ApiProperty({ type: [AdminTryoutDraftDto] }) items!: AdminTryoutDraftDto[];
}
export class PublishTryoutPackageDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() scoringPolicyVersionId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) releaseAt!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(604800) durationSeconds!: number;
}
