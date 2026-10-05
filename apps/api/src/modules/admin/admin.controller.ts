import { AdminAnalyticsDto } from './analytics.dto';
import { AdminAnalyticsService } from './analytics.service';
import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard, type AdminRequest } from '../identity/admin.guard';
import { RequireAdminCapability } from '../identity/admin-capabilities';
import { IsOptional, IsString, IsISO8601, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentPageDto } from '../content/content.dto';

export class AdminDashboardDto {
  @ApiProperty() schools!: number;
  @ApiProperty({ type: Number, nullable: true }) chapters!: number | null;
  @ApiProperty({ type: Number, nullable: true }) questions!: number | null;
  @ApiProperty({ type: Number, nullable: true }) readyVersions!: number | null;
  @ApiProperty({ type: Number, nullable: true }) openReports!: number | null;
}
export class AdminAuditQueryDto extends ContentPageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) entityType?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() to?: string;
}
export class AdminAuditDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ type: String, nullable: true }) entityId!: string | null;
  @ApiProperty() createdAt!: string;
}
export class AdminAuditListDto {
  @ApiProperty({ type: [AdminAuditDto] }) items!: AdminAuditDto[];
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(AdminAnalyticsService) private readonly analytics: AdminAnalyticsService,
  ) {}
  @Get('analytics')
  @ApiOkResponse({ type: AdminAnalyticsDto })
  summary(@Req() request: AdminRequest) {
    return this.analytics.summary(request.adminRole);
  }
  @Get('dashboard')
  @RequireAdminCapability('OPERATIONS_LIMITED_READ')
  @ApiOkResponse({ type: AdminDashboardDto })
  dashboard(@Req() request: AdminRequest) {
    return this.admin.dashboard(request.adminRole);
  }
  @Get('audit-logs')
  @RequireAdminCapability('AUDIT_READ')
  @ApiOkResponse({ type: AdminAuditListDto })
  audit(@Req() request: AdminRequest, @Query() page: AdminAuditQueryDto) {
    return this.admin.audit(page, request.adminRole);
  }
}
