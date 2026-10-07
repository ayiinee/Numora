import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ContentPageDto } from '../content/content.dto';
import type { AdminRole } from '../identity/admin-capabilities';

export const adminRoles = ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const;
export class AdminAccountQueryDto extends ContentPageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
}
export class AdminAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: [...adminRoles], nullable: true }) adminRole!: AdminRole | null;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] }) status!: 'ACTIVE' | 'DISABLED';
  @ApiProperty() createdAt!: string;
}
export class AdminAccountsDto {
  @ApiProperty({ type: [AdminAccountDto] }) items!: AdminAccountDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class UpdateAdminAccountDto {
  @ApiPropertyOptional({ enum: [...adminRoles] })
  @IsOptional()
  @IsIn(adminRoles)
  adminRole?: AdminRole;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
export class InviteAdminDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @Length(1, 120) @Matches(/\S/) displayName!: string;
  @ApiProperty({ enum: [...adminRoles] }) @IsIn(adminRoles) adminRole!: AdminRole;
}
export class AdminInvitationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: [...adminRoles] }) targetRole!: AdminRole;
  @ApiProperty({ enum: ['RESERVED', 'SENDING', 'INVITED', 'FAILED', 'ACCEPTED', 'CANCELLED'] })
  status!: string;
  @ApiProperty({ type: String, nullable: true }) userId!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
export class AdminInvitationsDto {
  @ApiProperty({ type: [AdminInvitationDto] }) items!: AdminInvitationDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class AdminRecoveryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['RESERVED', 'SENDING', 'SENT', 'FAILED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
}
