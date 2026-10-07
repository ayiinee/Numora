import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExcelIntakeDto, IntakeQuestionDto, UploadDestinationDto } from './content-intake.dto';
import { ContentPackageDetailDto, usages } from './content-packages.dto';

export class UpdateUploadPreviewDto {
  @ApiPropertyOptional({ type: UploadDestinationDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => UploadDestinationDto)
  destination?: UploadDestinationDto | null;
  @ApiProperty() @IsInt() @Min(0) expectedRevision!: number;
  @ApiProperty({ type: [IntakeQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  questions!: IntakeQuestionDto[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  selectedIds!: string[];
}
export class SaveUploadDraftDto {
  @ApiProperty() @IsInt() @Min(0) expectedRevision!: number;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(160) title!: string;
  @ApiProperty({ enum: usages }) @IsIn(usages) assessmentType!: 'DRILL' | 'PRETEST' | 'TRYOUT';
}
export class UploadQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) search?: string;
  @ApiPropertyOptional({ enum: usages }) @IsOptional() @IsIn(usages) assessmentType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['RECEIVED', 'INVALID', 'PREVIEW', 'VALIDATED', 'DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class UploadSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() state!: string;
  @ApiProperty() status!: string;
  @ApiProperty() questionCount!: number;
  @ApiPropertyOptional() validationResult?: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) assessmentType!: string | null;
  @ApiProperty({ type: String, nullable: true }) packageId!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}
export class UploadDetailDto extends UploadSummaryDto {
  @ApiPropertyOptional({ type: Boolean }) canEditPreview?: boolean;
  @ApiProperty({ type: ExcelIntakeDto, nullable: true }) excel!: ExcelIntakeDto | null;
  @ApiProperty({ type: UploadDestinationDto, nullable: true })
  destination!: UploadDestinationDto | null;
  @ApiProperty({ type: [String] }) selectedIds!: string[];
  @ApiProperty({ type: ContentPackageDetailDto, nullable: true })
  package!: ContentPackageDetailDto | null;
}
export class UploadListDto {
  @ApiProperty({ type: [UploadSummaryDto] }) items!: UploadSummaryDto[];
  @ApiProperty() total!: number;
}
