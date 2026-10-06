import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { ContentImportService } from './content-import.service';
import { ContentPreviewService } from './content-preview.service';
import {
  CreatePreviewDto,
  ImportBodyDto,
  ImportReportDto,
  MediaLinkRequestDto,
  MediaLinksDto,
  PreviewAckDto,
  PreviewSessionDto,
  SavePreviewAnswerDto,
} from './content-preview.dto';

@ApiTags('admin-content-preview')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content')
export class ContentPreviewController {
  constructor(
    @Inject(ContentImportService) private readonly importer: ContentImportService,
    @Inject(ContentPreviewService) private readonly preview: ContentPreviewService,
  ) {}
  @Post('import-validations')
  @HttpCode(200)
  @ApiOkResponse({ type: ImportReportDto })
  validate(@Body() body: ImportBodyDto) {
    return this.importer.validate(body);
  }
  @Post('imports')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: ImportReportDto })
  import(
    @Req() r: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: ImportBodyDto,
  ) {
    return this.importer.import(r.adminId, key, body);
  }
  @Get('imports/:id')
  @ApiOkResponse({ type: ImportReportDto })
  report(@Req() r: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.importer.get(r.adminId, id);
  }
  @Post('preview-sessions')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: PreviewSessionDto })
  create(
    @Req() r: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreatePreviewDto,
  ) {
    return this.preview.create(r.adminId, key, body);
  }
  @Get('preview-sessions/:id')
  @ApiOkResponse({ type: PreviewSessionDto })
  get(@Req() r: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.preview.get(r.adminId, id, false);
  }
  @Patch('preview-sessions/:id/answers/:instanceId')
  @ApiOkResponse({ type: PreviewAckDto })
  save(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Body() body: SavePreviewAnswerDto,
  ) {
    return this.preview.save(r.adminId, id, instanceId, body);
  }
  @Post('preview-sessions/:id/submit')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: PreviewSessionDto })
  submit(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.preview.submit(r.adminId, id, key);
  }
  @Get('preview-sessions/:id/result')
  @ApiOkResponse({ type: PreviewSessionDto })
  result(@Req() r: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.preview.get(r.adminId, id, true);
  }
  @Post('preview-sessions/:id/media-links')
  @HttpCode(200)
  @ApiOkResponse({ type: MediaLinksDto })
  media(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MediaLinkRequestDto,
  ) {
    return this.preview.media(r.adminId, id, body);
  }
}
