import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Matches, IsOptional, IsUUID } from 'class-validator';
import { WorkbookBindingDto } from './package-context.dto';
import type { ContentAnswer, ContentAsset, ContentKind, ImportQuestion } from '@tka/database';
import {
  answerSchema,
  ImportReportDto,
  PreviewCategoryDto,
  PreviewOptionDto,
  RichContentDto,
} from './content-preview.dto';

export class ExcelParseInputDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() packageId?: string;
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{1,128}$' })
  @Matches(/^[A-Za-z0-9_-]{1,128}$/)
  sourceNamespace!: string;
}
export class ExcelAssetDto implements ContentAsset {
  @ApiProperty() externalId!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty() textMarker!: string;
  @ApiProperty({ enum: ['STEM', 'OPTION', 'STATEMENT', 'EXPLANATION'] })
  placement!: ContentAsset['placement'];
  @ApiProperty({ type: String, nullable: true }) itemId!: string | null;
  @ApiProperty() assetOrder!: number;
  @ApiProperty() altText!: string;
  @ApiProperty({ type: String, nullable: true }) objectKey!: string | null;
  @ApiProperty() sha256!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty() byteLength!: number;
  @ApiProperty() bucket!: string;
}
export class ExcelMetadataDto {
  [key: string]: unknown;
  @ApiProperty({ type: Number, nullable: true }) sourceLevelNumber!: number | null;
  @ApiPropertyOptional() sourceOrder?: number;
  @ApiPropertyOptional() sourceQuestionId?: string;
  @ApiPropertyOptional({ type: String }) chapterName?: string | undefined;
  @ApiPropertyOptional({ type: String }) subchapterName?: string | undefined;
  @ApiPropertyOptional({ type: String }) competencyName?: string | undefined;
  @ApiProperty() sourceSheet!: string;
  @ApiProperty() sourceRowNumber!: number;
  @ApiProperty({ type: [ExcelAssetDto] }) assetManifest!: ExcelAssetDto[];
  @ApiPropertyOptional({ type: [PreviewCategoryDto] }) categories?: PreviewCategoryDto[];
}
export class ExcelQuestionDto implements ImportQuestion {
  @ApiProperty() externalId!: string;
  @ApiProperty({ enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] })
  type!: ContentKind;
  @ApiProperty({ type: String, nullable: true }) chapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) subchapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) competencyCode!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['EASY', 'MEDIUM', 'HARD'] })
  difficulty!: Exclude<ImportQuestion['difficulty'], undefined>;
  @ApiProperty({ type: RichContentDto }) stem!: RichContentDto;
  @ApiProperty({ type: [PreviewOptionDto] }) options!: PreviewOptionDto[];
  @ApiProperty({ ...answerSchema, nullable: false }) answer!: Exclude<ContentAnswer, null>;
  @ApiProperty({ type: RichContentDto }) explanation!: RichContentDto;
  @ApiProperty({ type: ExcelMetadataDto }) metadata!: ExcelMetadataDto;
}
export class ExcelEnvelopeDto {
  @ApiPropertyOptional({ type: WorkbookBindingDto }) binding?: WorkbookBindingDto;
  @ApiProperty({ enum: [2] }) schemaVersion!: 2;
  @ApiProperty() sourceNamespace!: string;
  @ApiProperty({ type: [ExcelQuestionDto] }) questions!: ExcelQuestionDto[];
}
export class ExcelIssueDto {
  @ApiProperty() sheet!: string;
  @ApiProperty() row!: number;
  @ApiProperty() cell!: string;
  @ApiProperty() code!: string;
  @ApiProperty() detail!: string;
}
export class ExcelMediaDto {
  @ApiPropertyOptional() url?: string;
  @ApiProperty() externalId!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty({ description: 'Exact embedded bytes, separate from the import JSON.' })
  base64!: string;
}
export class ExcelParseDto {
  @ApiProperty({ type: ExcelEnvelopeDto }) envelope!: ExcelEnvelopeDto;
  @ApiProperty({ type: [ExcelMediaDto] }) media!: ExcelMediaDto[];
  @ApiProperty({ type: [ExcelIssueDto] }) issues!: ExcelIssueDto[];
  @ApiProperty({ type: ImportReportDto, nullable: true }) report!: ImportReportDto | null;
}
