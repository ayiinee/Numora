import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RegisterProfileDto {
  @ApiProperty({ enum: ['STUDENT', 'TEACHER'] })
  @IsIn(['STUDENT', 'TEACHER'])
  role!: 'STUDENT' | 'TEACHER';
}

export class IdentityProfileDto {
  @ApiProperty({
    enum: ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'],
    nullable: true,
    required: false,
  })
  adminRole?: 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION' | null;

  @ApiProperty({ type: [String], enum: ['CONTENT_MANAGE'], required: false })
  capabilities?: 'CONTENT_MANAGE'[];

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['STUDENT', 'TEACHER', 'ADMIN'] })
  role!: 'STUDENT' | 'TEACHER' | 'ADMIN';

  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] })
  status!: 'ACTIVE' | 'DISABLED';

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: Boolean, nullable: true })
  teacherVerified!: boolean | null;

  @ApiProperty({ enum: ['MANDIRI', 'SCHOOL'], nullable: true })
  studentAffiliation!: 'MANDIRI' | 'SCHOOL' | null;
}
