import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ContentPageDto } from '../content/content.dto';

export class AdminUserQueryDto extends ContentPageDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ enum: ['STUDENT', 'TEACHER', 'ADMIN'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['STUDENT', 'TEACHER', 'ADMIN'])
  role?: 'STUDENT' | 'TEACHER' | 'ADMIN';
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
export class AdminClassQueryDto extends ContentPageDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  schoolId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  teacherId?: string;
  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['active', 'archived'])
  state?: 'active' | 'archived';
}
export class AdminUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['STUDENT', 'TEACHER', 'ADMIN'] }) role!: string;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserDto] }) items!: AdminUserDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class AdminClassDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid' }) schoolId!: string;
  @ApiProperty() schoolName!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) teacherId!: string | null;
  @ApiProperty({ type: String, nullable: true }) teacherName!: string | null;
  @ApiProperty() studentCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) archivedAt!: string | null;
}
export class AdminClassListDto {
  @ApiProperty({ type: [AdminClassDto] }) items!: AdminClassDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
