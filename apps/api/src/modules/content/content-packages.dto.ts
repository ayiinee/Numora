import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { QuestionUsage } from '@tka/database';
import { PackageSourceDto } from './package-context.dto';
import { ExcelQuestionDto } from './excel-import.dto';
import { PackageValidationDto } from './content-preview.dto';

export const usages = ['DRILL', 'PRETEST', 'TRYOUT'] as const;
export class CreateContentPackageDto {
  @ApiProperty() @Matches(/^[A-Za-z0-9-]{1,64}$/) familyCode!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100000) packageVersion!: number;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @ApiProperty({ enum: usages }) @IsIn(usages) assessmentType!: QuestionUsage;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() chapterId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() levelId?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isDemo?: boolean;
  @ApiProperty({ type: PackageSourceDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PackageSourceDto)
  source!: PackageSourceDto;
}
export class UpdateContentPackageDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  questionVersionIds!: string[];
}
export class ClassifyQuestionDto {
  @ApiProperty({ enum: usages }) @IsIn(usages) usageType!: QuestionUsage;
}
export class ReviewImportedQuestionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() packageId!: string;
  @ApiProperty({ enum: [true] }) @Equals(true) confirmed!: boolean;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(1000) notes!: string;
}
export class ApproveContentPackageDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
  @ApiProperty({ enum: [true] }) @Equals(true) confirmed!: boolean;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(1000) reference!: string;
}
export class PublishContentPackageDto {
  @ApiPropertyOptional({ enum: [true] }) @IsOptional() @Equals(true) confirmed?: true;
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() releaseAt?: string;
}
export class ContentPackageQueryDto {
  @ApiPropertyOptional({ enum: usages }) @IsOptional() @IsIn(usages) usageType?: QuestionUsage;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) source?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() chapterId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  offset?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
export class ArchiveContentPackageDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
}
export class PackageApprovalDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ format: 'date-time' }) approvedAt!: string;
}
export class ContentPackageDto {
  @ApiPropertyOptional({ type: PackageApprovalDto, nullable: true })
  curriculumApproval?: PackageApprovalDto | null;
  @ApiProperty() id!: string;
  @ApiProperty() familyCode!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: usages }) assessmentType!: QuestionUsage;
  @ApiProperty() contentRevision!: number;
  @ApiProperty() status!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: PackageSourceDto, nullable: true }) source!: PackageSourceDto | null;
  @ApiProperty({ type: String, nullable: true }) chapterId!: string | null;
  @ApiProperty({ type: String, nullable: true }) levelId!: string | null;
  @ApiProperty({ type: String, nullable: true }) chapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) chapterName!: string | null;
  @ApiProperty({ type: String, nullable: true }) subchapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) subchapterName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) levelNumber!: number | null;
}
export class ContentPackagesDto {
  @ApiProperty({ type: [ContentPackageDto] }) items!: ContentPackageDto[];
}
export class ContentPackageItemDto {
  @ApiProperty() questionVersionId!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty() displayOrder!: number;
  @ApiProperty({ enum: usages, nullable: true }) usageType!: QuestionUsage | null;
  @ApiProperty() contentStatus!: string;
  @ApiProperty({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedByUserId!: string | null;
  @ApiProperty({ type: ExcelQuestionDto, nullable: true }) question!: ExcelQuestionDto | null;
}
export class ContentDistributionDto {
  @ApiProperty() dimension!: string;
  @ApiProperty() value!: string;
  @ApiProperty() count!: number;
}
export class ContentPackageDetailDto extends ContentPackageDto {
  @ApiProperty({ type: [ContentPackageItemDto] }) items!: ContentPackageItemDto[];
  @ApiProperty({ type: PackageValidationDto }) readiness!: PackageValidationDto;
  @ApiProperty({ type: [ContentDistributionDto] }) distribution!: ContentDistributionDto[];
}
