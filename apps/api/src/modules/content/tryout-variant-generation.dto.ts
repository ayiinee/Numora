import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class TryoutVariantAnchorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() label!: string;
  @ApiProperty() externalId!: string;
}

export class TryoutVariantGeneratorMappingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() serviceContract!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() originalHash!: string;
  @ApiProperty() originalVersion!: number;
  @ApiProperty() configVersion!: number;
}

export class TryoutVariantFocalDto extends TryoutVariantAnchorDto {
  @ApiProperty({ type: TryoutVariantGeneratorMappingDto, nullable: true })
  mapping!: TryoutVariantGeneratorMappingDto | null;
  @ApiProperty({ type: [String] }) blockers!: string[];
}

export class TryoutVariantOptionsDto {
  @ApiProperty({ format: 'uuid' }) packageId!: string;
  @ApiProperty() packageName!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() contentRevision!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [TryoutVariantAnchorDto] }) questions!: TryoutVariantAnchorDto[];
  @ApiProperty({ type: [TryoutVariantFocalDto] }) focalQuestions!: TryoutVariantFocalDto[];
  @ApiProperty({ type: [String] }) blockers!: string[];
  @ApiProperty({ type: [String] }) generatorBlockers!: string[];
  @ApiProperty() generatorAvailable!: boolean;
  @ApiProperty() canGenerate!: boolean;
}

export class CreateTryoutVariantDto {
  @ApiProperty({ type: [String], minItems: 5, maxItems: 5 })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  anchorQuestionVersionIds!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  operationKey!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class TryoutVariantRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: String, nullable: true }) executionStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
}

export class TryoutVariantProcessDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sourcePackageId!: string;
  @ApiProperty() sourcePackageVersion!: number;
  @ApiProperty({ type: [String] }) anchorQuestionVersionIds!: string[];
  @ApiProperty({ type: [String] }) focalQuestionVersionIds!: string[];
  @ApiProperty({ enum: ['GENERATING', 'FAILED', 'READY', 'IMPORTED'] })
  status!: 'GENERATING' | 'FAILED' | 'READY' | 'IMPORTED';
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) generatedPackageId!: string | null;
  @ApiProperty({ type: [TryoutVariantRequestDto] }) requests!: TryoutVariantRequestDto[];
  @ApiProperty() createdAt!: string;
}

