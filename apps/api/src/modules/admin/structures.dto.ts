import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ContentPageDto } from '../content/content.dto';
export class AdminStructureClassQueryDto extends ContentPageDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  schoolId?: string;
  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['active', 'archived'])
  state?: 'active' | 'archived';
}
export class AdminStructureSchoolDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: string;
  @ApiProperty() classCount!: number;
  @ApiProperty() activeTeacherCount!: number;
  @ApiProperty() availableCredentialCount!: number;
  @ApiProperty() usedCredentialCount!: number;
  @ApiProperty() expiredCredentialCount!: number;
  @ApiProperty() revokedCredentialCount!: number;
  @ApiProperty() studentCount!: number;
}
export class AdminStructureSchoolsDto {
  @ApiProperty({ type: [AdminStructureSchoolDto] }) items!: AdminStructureSchoolDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class AdminStructureClassDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid' }) schoolId!: string;
  @ApiProperty() schoolName!: string;
  @ApiProperty() studentCount!: number;
  @ApiProperty() teacherActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) archivedAt!: string | null;
}
export class AdminStructureClassesDto {
  @ApiProperty({ type: [AdminStructureClassDto] }) items!: AdminStructureClassDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
