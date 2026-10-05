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
import { AdminGuard, type AdminRequest } from '../identity/admin.guard';
import { AdminAccess } from '../identity/admin-permissions';
import { ContentMutationDto, ContentPageDto } from '../content/content.dto';
import { AdminReportsDto, ResolveReportDto } from './reports.dto';
import { ReportsService } from './reports.service';

enum ReportKind {
  QUESTION = 'QUESTION',
  VIDEO = 'VIDEO',
}
@ApiTags('admin-reports')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@AdminAccess('content')
@Controller('admin/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get()
  @ApiOkResponse({ type: AdminReportsDto })
  list(@Query() q: ContentPageDto) {
    return this.reports.list(q);
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
