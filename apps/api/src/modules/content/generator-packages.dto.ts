import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { GeneratorRequestDto } from './generator.dto';
import { ExcelQuestionDto } from './excel-import.dto';
import { ImportReportDto } from './content-preview.dto';
export class CreateGeneratorPackageDto {
  @ApiProperty({ enum: ['DRILL', 'PRETEST', 'TRYOUT'] })
  @IsIn(['DRILL', 'PRETEST', 'TRYOUT'])
  assessmentType!: 'DRILL' | 'PRETEST' | 'TRYOUT';
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() scopeId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Paket original yang menjadi sumber Tryout atau varian Drill.',
  })
  @IsOptional()
  @IsUUID()
  sourcePackageId?: string;
  @ApiPropertyOptional({ type: [String], minItems: 3, maxItems: 3 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  anchorQuestionVersionIds?: string[];
  @ApiPropertyOptional({ type: [String], minItems: 7, maxItems: 7 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  focalQuestionVersionIds?: string[];
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-f0-9]{64}$/) sourceDigest?: string;
}
export class DrillGeneratorRuntimeDto {
  @ApiProperty() runtimeProfile!: string;
  @ApiProperty() imageDigest!: string;
}
export class DrillGeneratorMappingDto {
  @ApiProperty() approvalId!: string;
  @ApiProperty() configId!: string;
  @ApiProperty() configVersion!: number;
  @ApiProperty() configDigest!: string;
  @ApiProperty({ enum: ['NUMERIC', 'CONCEPTUAL_STOCK'] }) mode!: 'NUMERIC' | 'CONCEPTUAL_STOCK';
}
export class DrillGeneratorSourceItemDto {
  @ApiProperty() displayOrder!: number;
  @ApiProperty() questionVersionId!: string;
  @ApiProperty() familyId!: string;
  @ApiProperty({ type: String, nullable: true }) rubricVersionId!: string | null;
  @ApiProperty({ type: DrillGeneratorMappingDto, nullable: true })
  mapping!: DrillGeneratorMappingDto | null;
  @ApiProperty({ type: [String] }) blockers!: string[];
}
export class DrillGeneratorSourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() levelId!: string;
  @ApiProperty() levelLabel!: string;
  @ApiProperty({ type: String, nullable: true }) contextId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) contextRevision!: number | null;
  @ApiProperty() sourceDigest!: string;
  @ApiProperty({ type: [String] }) anchorIds!: string[];
  @ApiProperty({ type: [String] }) blockers!: string[];
  @ApiProperty({ type: [DrillGeneratorSourceItemDto] }) items!: DrillGeneratorSourceItemDto[];
}
export class DrillGeneratorCatalogDto {
  @ApiProperty({ type: DrillGeneratorRuntimeDto, nullable: true })
  runtime!: DrillGeneratorRuntimeDto | null;
  @ApiProperty({ type: [String] }) blockers!: string[];
  @ApiProperty({ type: [DrillGeneratorSourceDto] }) items!: DrillGeneratorSourceDto[];
}
export class DrillGeneratorLineageDto {
  @ApiProperty({ enum: ['ANCHOR', 'FOCAL'] }) role!: 'ANCHOR' | 'FOCAL';
  @ApiProperty() displayOrder!: number;
  @ApiProperty() parentQuestionVersionId!: string;
  @ApiProperty() familyId!: string;
  @ApiProperty() rubricVersionId!: string;
  @ApiProperty() sourceFingerprint!: string;
  @ApiProperty() contentHash!: string;
  @ApiProperty({ type: String, nullable: true }) requestId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) seed!: number | null;
  @ApiProperty({ type: DrillGeneratorMappingDto, nullable: true })
  mapping!: DrillGeneratorMappingDto | null;
  @ApiPropertyOptional({ type: String }) artifactDigest?: string;
  @ApiPropertyOptional({ type: String }) questionVersionId?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedBy?: string | null;
  @ApiPropertyOptional({ type: [String] }) mediaReceiptIds?: string[];
}
export class DrillGeneratorManifestDto {
  @ApiProperty() sourcePackageVersion!: number;
  @ApiProperty() contextId!: string;
  @ApiProperty() contextRevision!: number;
  @ApiProperty() policyVersionId!: string;
  @ApiProperty() manifestDigest!: string;
  @ApiProperty({ type: DrillGeneratorRuntimeDto }) runtime!: DrillGeneratorRuntimeDto;
  @ApiProperty({ type: [DrillGeneratorLineageDto] }) items!: DrillGeneratorLineageDto[];
  @ApiPropertyOptional({ type: String }) curriculumApprovalReference?: string;
}
export class GeneratorPackageOptionDto {
  @ApiProperty({ enum: ['DRILL', 'PRETEST', 'TRYOUT'] })
  assessmentType!: CreateGeneratorPackageDto['assessmentType'];
  @ApiProperty({ type: String, nullable: true }) scopeId!: string | null;
  @ApiProperty() scopeLabel!: string;
  @ApiProperty() availableCount!: number;
  @ApiProperty() requiredCount!: number;
  @ApiProperty() canGenerate!: boolean;
}
export class GeneratorSourcePackageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty() familyCount!: number;
  @ApiProperty() eligibleCount!: number;
  @ApiProperty() canGenerate!: boolean;
  @ApiProperty({ type: [String] }) blockers!: string[];
}
export class GeneratorPackageCatalogDto {
  @ApiProperty({ type: [GeneratorPackageOptionDto] }) options!: GeneratorPackageOptionDto[];
  @ApiProperty({ type: [GeneratorSourcePackageDto] }) sourcePackages!: GeneratorSourcePackageDto[];
}
export class GeneratorPackageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['DRILL', 'PRETEST', 'TRYOUT'] })
  assessmentType!: CreateGeneratorPackageDto['assessmentType'];
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) sourcePackageId!: string | null;
  @ApiProperty() expectedCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() failedCount!: number;
  @ApiProperty({ enum: ['GENERATING', 'FAILED', 'READY', 'IMPORTED', 'CANCELLED'] }) status!:
    'GENERATING' | 'FAILED' | 'READY' | 'IMPORTED' | 'CANCELLED';
  @ApiProperty({ type: String, nullable: true }) packageId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [GeneratorRequestDto] }) requests!: GeneratorRequestDto[];
  @ApiPropertyOptional({ type: DrillGeneratorManifestDto })
  drillVariant?: DrillGeneratorManifestDto;
  @ApiPropertyOptional({ type: [String] }) blockers?: string[];
}
export class GeneratorPackagesDto {
  @ApiProperty({ type: [GeneratorPackageDto] }) items!: GeneratorPackageDto[];
}
export class GeneratorPackageFileItemDto {
  @ApiProperty() requestId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty({ type: ExcelQuestionDto }) question!: ExcelQuestionDto;
  @ApiProperty({
    type: Object,
    description: 'Exact immutable generator-service-v1 candidate payload',
  })
  content!: object;
  @ApiPropertyOptional({ type: DrillGeneratorLineageDto }) lineage?: DrillGeneratorLineageDto;
}
export class DrillGeneratorAnchorDto {
  @ApiProperty({ type: ExcelQuestionDto }) question!: ExcelQuestionDto;
  @ApiProperty({ type: DrillGeneratorLineageDto }) lineage!: DrillGeneratorLineageDto;
}
export class GeneratorPackageFileDto {
  @ApiProperty({ enum: ['numora-generator-package-v1'] })
  contractVersion!: 'numora-generator-package-v1';
  @ApiProperty() generatorPackageId!: string;
  @ApiProperty({ enum: ['DRILL', 'PRETEST', 'TRYOUT'] })
  assessmentType!: CreateGeneratorPackageDto['assessmentType'];
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) sourcePackageId!: string | null;
  @ApiProperty() expectedCount!: number;
  @ApiProperty({ type: [GeneratorPackageFileItemDto] }) items!: GeneratorPackageFileItemDto[];
  @ApiPropertyOptional({ type: [DrillGeneratorAnchorDto] }) anchors?: DrillGeneratorAnchorDto[];
  @ApiPropertyOptional({ type: DrillGeneratorManifestDto })
  drillVariant?: DrillGeneratorManifestDto;
}
export class ValidateGeneratorJsonDto {
  @ApiProperty({ type: GeneratorPackageFileDto }) @IsObject() file!: object;
}
export class GeneratorJsonPreviewDto {
  @ApiProperty({ type: GeneratorPackageFileDto }) file!: GeneratorPackageFileDto;
  @ApiProperty({ type: ImportReportDto }) report!: ImportReportDto;
}
