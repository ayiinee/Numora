import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ContentPageDto } from '../content/content.dto';

export class AdminUserQueryDto extends ContentPageDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  schoolId?: string;
  @ApiPropertyOptional({ enum: ['MANDIRI', 'SCHOOL'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['MANDIRI', 'SCHOOL'])
  affiliation?: 'MANDIRI' | 'SCHOOL';
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
export class AdminUserDetailDto extends AdminUserDto {
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['MANDIRI', 'SCHOOL'], nullable: true }) affiliation!:
    'MANDIRI' | 'SCHOOL' | null;
  @ApiProperty({ type: Boolean, nullable: true }) teacherVerified!: boolean | null;
}
export class AdminMembershipDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) schoolId!: string;
  @ApiProperty() schoolName!: string;
  @ApiProperty({ type: String, nullable: true }) classId!: string | null;
  @ApiProperty({ type: String, nullable: true }) className!: string | null;
  @ApiProperty() startedAt!: string;
  @ApiProperty({ type: String, nullable: true }) endedAt!: string | null;
  @ApiProperty() active!: boolean;
}
export class AdminMembershipsDto {
  @ApiProperty({ type: [AdminMembershipDto] }) items!: AdminMembershipDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class AdminRosterQueryDto extends ContentPageDto {
  @ApiPropertyOptional({ enum: ['active', 'former'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['active', 'former'])
  state?: 'active' | 'former';
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  search?: string;
}
export class AdminRosterMemberDto extends AdminUserDto {
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty() joinedAt!: string;
  @ApiProperty({ type: String, nullable: true }) leftAt!: string | null;
}
export class AdminRosterDto {
  @ApiProperty({ type: [AdminRosterMemberDto] }) items!: AdminRosterMemberDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class AdminClassDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid' }) schoolId!: string;
  @ApiProperty() schoolName!: string;
  @ApiProperty({ format: 'uuid', type: String, nullable: true }) teacherId!: string | null;
  @ApiProperty({ type: String, nullable: true }) teacherName!: string | null;
  @ApiProperty() teacherActive!: boolean;
  @ApiProperty() studentCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) archivedAt!: string | null;
}
export class AdminClassListDto {
  @ApiProperty({ type: [AdminClassDto] }) items!: AdminClassDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
