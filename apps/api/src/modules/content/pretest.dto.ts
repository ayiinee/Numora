import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class PretestDraftDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) familyCode!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100000) packageVersion!: number;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') chapterId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  blueprintVersionId?: string | null;
  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  questionVersionIds!: string[];
}
export class PretestEditDto extends OmitType(PretestDraftDto, [
  'familyCode',
  'packageVersion',
  'chapterId',
] as const) {}
export class PretestReviewDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class PretestDto {
  @ApiProperty() id!: string;
  @ApiProperty() familyCode!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() name!: string;
  @ApiProperty() chapterId!: string;
  @ApiProperty({ type: String, nullable: true }) blueprintVersionId!: string | null;
  @ApiProperty({ enum: ['DRAFT', 'REVIEWED', 'ARCHIVED'] }) state!:
    'DRAFT' | 'REVIEWED' | 'ARCHIVED';
  @ApiProperty({ type: String, nullable: true }) manifestDigest!: string | null;
  @ApiProperty({ type: [String] }) questionVersionIds!: string[];
  @ApiProperty({ type: [String] }) reviewBlockers!: string[];
  @ApiProperty({ type: [String] }) publicationBlockers!: string[];
}
export class PretestsDto {
  @ApiProperty({ type: [PretestDto] }) items!: PretestDto[];
}
export class PretestBlueprintDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() version!: number;
  @ApiProperty() approvalReference!: string;
  @ApiProperty() approvedAt!: string;
}
export class PretestBlueprintsDto {
  @ApiProperty({ type: [PretestBlueprintDto] }) items!: PretestBlueprintDto[];
}
