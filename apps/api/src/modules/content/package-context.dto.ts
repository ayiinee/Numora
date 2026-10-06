import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { PackageSource } from '@tka/database';

export class PackageSourceDto implements PackageSource {
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,128}$/) sourceNamespace!: string;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(240) sourceName!: string;
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(1000) sourceReference!: string;
}
export class PackageTargetDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() packageId!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) expectedRevision!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/\S/) @MaxLength(255) fileName?: string;
}
export class DirectedImportContextDto {
  @ApiPropertyOptional({ type: PackageTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PackageTargetDto)
  target?: PackageTargetDto;
}
export class WorkbookBindingDto {
  @ApiProperty() packageId!: string;
  @ApiProperty() familyCode!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty({ enum: ['DRILL', 'PRETEST', 'TRYOUT'] }) assessmentType!:
    'DRILL' | 'PRETEST' | 'TRYOUT';
  @ApiProperty({ type: String, nullable: true }) chapterCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) subchapterCode!: string | null;
  @ApiProperty({ type: Number, nullable: true }) levelNumber!: number | null;
  @ApiProperty() sourceNamespace!: string;
  @ApiProperty() sourceName!: string;
  @ApiProperty() sourceReference!: string;
  @ApiProperty() isDemo!: boolean;
}
