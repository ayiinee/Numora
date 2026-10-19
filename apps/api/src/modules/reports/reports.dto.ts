import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsOptional,
  IsUUID,
  IsISO8601,
} from 'class-validator';
import { ContentPageDto } from '../content/content.dto';
import { ContentVersionDetailDto } from '../content/content-lifecycle.dto';
export class AdminReportQueryDto extends ContentPageDto {
  @ApiPropertyOptional({ enum: ['QUESTION', 'VIDEO'] })
  @IsOptional()
  @IsIn(['QUESTION', 'VIDEO'])
  kind?: 'QUESTION' | 'VIDEO';
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'])
  status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) category?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() to?: string;
}
export class ResolveReportDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  revisionQuestionVersionId?: string;
  @ApiProperty({ enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'])
  status!: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) followUp!: string;
}
export class AdminReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['QUESTION', 'VIDEO'] }) kind!: 'QUESTION' | 'VIDEO';
  @ApiProperty() referenceId!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: String, nullable: true }) details!: string | null;
  @ApiProperty({ enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) followUp!: string | null;
  @ApiProperty() reportedAt!: string;
}
export class AdminReportsDto {
  @ApiProperty({ type: [AdminReportDto] }) items!: AdminReportDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class AdminVideoReportTargetDto {
  @ApiProperty() title!: string;
  @ApiProperty() url!: string;
  @ApiProperty() source!: string;
  @ApiProperty() videoId!: string;
  @ApiProperty() subchapterId!: string;
  @ApiProperty() recommendationOrder!: number;
  @ApiProperty({ enum: ['REPORT_SNAPSHOT', 'CURRENT_METADATA'] }) evidence!:
    'REPORT_SNAPSHOT' | 'CURRENT_METADATA';
}
export class AdminReportDetailDto extends AdminReportDto {
  @ApiProperty({ type: ContentVersionDetailDto, nullable: true })
  question!: ContentVersionDetailDto | null;
  @ApiProperty({ type: AdminVideoReportTargetDto, nullable: true })
  video!: AdminVideoReportTargetDto | null;
  @ApiProperty({ type: String, nullable: true }) revisionQuestionVersionId!: string | null;
}
