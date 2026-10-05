import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from '../identity/admin.guard';
import { AdminAccess } from '../identity/admin-permissions';
import { ContentPageDto } from '../content/content.dto';

export class AdminDashboardDto {
  @ApiProperty() schools!: number;
  @ApiProperty() chapters!: number;
  @ApiProperty() questions!: number;
  @ApiProperty() readyVersions!: number;
  @ApiProperty() openReports!: number;
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
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}
  @Get('dashboard')
  @AdminAccess('dashboard')
  @ApiOkResponse({ type: AdminDashboardDto })
  dashboard() {
    return this.admin.dashboard();
  }
  @Get('audit-logs')
  @ApiOkResponse({ type: AdminAuditListDto })
  audit(@Query() page: ContentPageDto) {
    return this.admin.audit(page);
  }
}
