import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ContentPageDto } from '../content/content.dto';

export class AdminReportQueryDto extends ContentPageDto {
  @ApiPropertyOptional({ enum: ['QUESTION', 'VIDEO'] })
  @IsOptional()
  @IsIn(['QUESTION', 'VIDEO'])
  kind?: 'QUESTION' | 'VIDEO';

  @ApiPropertyOptional({ enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'])
  status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
}

export class ResolveReportDto {
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
  @ApiProperty() total!: number;
}
