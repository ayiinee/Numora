import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import {
  RichContentDto,
  PreviewOptionDto,
  PreviewCategoryDto,
  answerSchema,
} from './content-preview.dto';
import type { CandidatePayload } from '@tka/irt-orchestration';
export class PrepareGeneratorDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') mappingId!: string;
}
export class GeneratorMappingDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() originalQuestionVersionId!: string;
  @ApiProperty() contextId!: string;
}
export class GeneratorCatalogDto {
  @ApiProperty({ type: [GeneratorMappingDto] }) items!: GeneratorMappingDto[];
}
export class GeneratorRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() status!: string;
  @ApiProperty() dispatchGeneration!: number;
  @ApiProperty({ type: String, nullable: true }) executionStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty() leaseExpired!: boolean;
  @ApiProperty() accepted!: boolean;
}
export class GeneratorRequestsDto {
  @ApiProperty({ type: [GeneratorRequestDto] }) items!: GeneratorRequestDto[];
}
export class GeneratorPreviewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['NOT_SCORED'] }) scoringStatus!: 'NOT_SCORED';
  @ApiProperty({ type: Number, nullable: true }) score!: null;
  @ApiProperty({ enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] })
  type!: CandidatePayload['questionType'];
  @ApiProperty({ type: RichContentDto }) stem!: RichContentDto;
  @ApiProperty({ type: [PreviewOptionDto] }) options!: PreviewOptionDto[];
  @ApiProperty({ type: [PreviewCategoryDto] }) categories!: PreviewCategoryDto[];
  @ApiProperty(answerSchema) answerKey!: CandidatePayload['answerKey'];
  @ApiProperty({ type: RichContentDto }) explanation!: RichContentDto;
}
export class GeneratorDraftDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
