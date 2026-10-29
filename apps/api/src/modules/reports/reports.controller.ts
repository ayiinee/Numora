import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { ContentMutationDto } from '../content/content.dto';
import {
  AdminReportsDto,
  AdminReportDetailDto,
  AdminReportQueryDto,
  ResolveReportDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

enum ReportKind {
  QUESTION = 'QUESTION',
  VIDEO = 'VIDEO',
}
@ApiTags('admin-reports')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get()
  @ApiOkResponse({ type: AdminReportsDto })
  list(@Query() q: AdminReportQueryDto) {
    return this.reports.list(q);
  }
  @Get(':kind/:id')
  @ApiOkResponse({ type: AdminReportDetailDto })
  detail(
    @Param('kind', new ParseEnumPipe(ReportKind)) kind: ReportKind,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.detail(kind, id);
  }
  @Patch(':kind/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  update(
    @Req() r: AdminRequest,
    @Param('kind', new ParseEnumPipe(ReportKind)) kind: ReportKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ResolveReportDto,
  ) {
    return this.reports.update(r.adminId, kind, id, b);
  }
}
