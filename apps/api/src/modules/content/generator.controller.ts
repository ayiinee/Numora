import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentPageDto } from './content.dto';
import { GeneratorService } from './generator.service';
import {
  GeneratorCatalogDto,
  GeneratorDraftDto,
  GeneratorPreviewDto,
  GeneratorRequestDto,
  GeneratorRequestsDto,
  PrepareGeneratorDto,
} from './generator.dto';
@ApiTags('admin-generator')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content/generator')
export class GeneratorController {
  constructor(@Inject(GeneratorService) private readonly service: GeneratorService) {}
  @Get('catalog')
  @ApiOkResponse({ type: GeneratorCatalogDto })
  catalog() {
    return this.service.catalog();
  }
  @Post('requests')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: GeneratorRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  prepare(
    @Req() r: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() b: PrepareGeneratorDto,
  ) {
    return this.service.prepare(r.adminId, key ?? '', b.mappingId);
  }
  @Get('requests')
  @ApiOkResponse({ type: GeneratorRequestsDto })
  list(@Query() p: ContentPageDto) {
    return this.service.list(p.limit, p.offset);
  }
  @Get('requests/:id')
  @ApiOkResponse({ type: GeneratorRequestDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Post('requests/:id/retry')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: GeneratorRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  retry(
    @Req() r: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.retry(r.adminId, key ?? '', id);
  }
  @Get('requests/:id/preview')
  @ApiOkResponse({ type: GeneratorPreviewDto })
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.preview(id);
  }
  @Post('requests/:id/draft')
  @HttpCode(200)
  @ApiOkResponse({ type: GeneratorDraftDto })
  save(@Req() r: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.save(r.adminId, id);
  }
}
