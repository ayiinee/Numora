import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { IntakeQuestion, UploadDestination } from '@tka/database';
import { ExcelQuestionDto, ExcelAssetDto, ExcelMediaDto, ExcelIssueDto } from './excel-import.dto';
import { PreviewCategoryDto, ImportReportDto } from './content-preview.dto';

export class SourceMaterialDto {
  @ApiProperty() chapter!: string;
  @ApiProperty() subchapter!: string;
  @ApiProperty() competency!: string;
  @ApiProperty() level!: string;
  @ApiProperty({ enum: ['NAME', 'CODE'] }) naming!: 'NAME' | 'CODE';
}
export class MaterialIdsDto {
  @ApiProperty({ type: String, nullable: true }) chapterId!: string | null;
  @ApiProperty({ type: String, nullable: true }) subchapterId!: string | null;
  @ApiProperty({ type: String, nullable: true }) competencyId!: string | null;
  @ApiProperty({ type: String, nullable: true }) levelId!: string | null;
}
export class UploadDestinationDto implements UploadDestination {
  @ApiProperty({ enum: ['DRILL', 'PRETEST', 'TRYOUT'] })
  @IsIn(['DRILL', 'PRETEST', 'TRYOUT'])
  assessmentType!: UploadDestination['assessmentType'];
  @ApiProperty() @IsString() @MaxLength(160) title!: string;
  @ApiProperty({ type: String, nullable: true }) @IsOptional() @IsUUID() chapterId!: string | null;
  @ApiProperty({ type: String, nullable: true }) @IsOptional() @IsUUID() subchapterId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) @IsOptional() @IsUUID() levelId!: string | null;
}
export class IntakeMetadataDto {
  [key: string]: unknown;
  @ApiProperty() sourceSheet!: string;
  @ApiProperty() sourceRowNumber!: number;
  @ApiProperty({ type: [ExcelAssetDto] }) assetManifest!: ExcelAssetDto[];
  @ApiPropertyOptional() sourceOrder?: number;
  @ApiPropertyOptional() sourceQuestionId?: string;
  @ApiPropertyOptional({ type: String }) chapterName?: string | undefined;
  @ApiPropertyOptional({ type: String }) subchapterName?: string | undefined;
  @ApiPropertyOptional({ type: String }) competencyName?: string | undefined;
  @ApiPropertyOptional({ type: [PreviewCategoryDto] }) categories?: PreviewCategoryDto[];
  @ApiProperty({ type: Number, nullable: true }) sourceLevelNumber!: number | null;
  @ApiPropertyOptional({ type: SourceMaterialDto }) sourceMaterial?: SourceMaterialDto;
  @ApiPropertyOptional({ type: MaterialIdsDto }) materialIds?: MaterialIdsDto;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['EXCEL', 'AUTO', 'USER'] },
  })
  materialOrigins?: Record<string, 'EXCEL' | 'AUTO' | 'USER'>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  materialReferences?: Record<string, string>;
}
export class IntakeQuestionDto
  extends OmitType(ExcelQuestionDto, [
    'chapterCode',
    'subchapterCode',
    'competencyCode',
    'metadata',
  ] as const)
  implements IntakeQuestion
{
  @ApiProperty({ type: String, nullable: true }) chapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) subchapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) competencyCode!: string | null;
  @ApiProperty({ type: IntakeMetadataDto }) metadata!: IntakeMetadataDto;
}
export class IntakeEnvelopeDto {
  @ApiProperty({ enum: [1] }) intakeVersion!: 1;
  @ApiProperty() sourceNamespace!: string;
  @ApiProperty({ type: [IntakeQuestionDto] }) questions!: IntakeQuestionDto[];
}
export class IntakeIssueDto extends ExcelIssueDto {
  @ApiProperty({ enum: ['CONTENT', 'METADATA', 'MAPPING'] }) category!:
    'CONTENT' | 'METADATA' | 'MAPPING';
  @ApiProperty() field!: string;
  @ApiPropertyOptional() externalId?: string;
}
export class ExcelIntakeDto {
  @ApiProperty({ type: IntakeEnvelopeDto }) envelope!: IntakeEnvelopeDto;
  @ApiProperty({ type: [ExcelMediaDto] }) media!: ExcelMediaDto[];
  @ApiProperty({ type: [ExcelIssueDto] }) issues!: ExcelIssueDto[];
  @ApiProperty({ type: [IntakeIssueDto] }) mappingIssues!: IntakeIssueDto[];
  @ApiProperty({ type: ImportReportDto, nullable: true }) report!: ImportReportDto | null;
}
