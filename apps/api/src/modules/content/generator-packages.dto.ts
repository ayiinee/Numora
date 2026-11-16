import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
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
    description: 'Paket Tryout original yang menjadi sumber.',
  })
  @IsOptional()
  @IsUUID()
  sourcePackageId?: string;
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
  @ApiProperty({ enum: ['GENERATING', 'FAILED', 'READY', 'IMPORTED'] }) status!:
    'GENERATING' | 'FAILED' | 'READY' | 'IMPORTED';
  @ApiProperty({ type: String, nullable: true }) packageId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [GeneratorRequestDto] }) requests!: GeneratorRequestDto[];
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
}
export class ValidateGeneratorJsonDto {
  @ApiProperty({ type: GeneratorPackageFileDto }) @IsObject() file!: object;
}
export class GeneratorJsonPreviewDto {
  @ApiProperty({ type: GeneratorPackageFileDto }) file!: GeneratorPackageFileDto;
  @ApiProperty({ type: ImportReportDto }) report!: ImportReportDto;
}
