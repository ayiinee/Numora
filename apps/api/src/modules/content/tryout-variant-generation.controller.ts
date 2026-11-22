import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { TryoutVariantGenerationService } from './tryout-variant-generation.service';
import {
  CreateTryoutVariantDto,
  TryoutVariantOptionsDto,
  TryoutVariantProcessDto,
} from './tryout-variant-generation.dto';

@ApiTags('admin-tryout-variants')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/assessments/tryout')
export class TryoutVariantGenerationController {
  constructor(
    @Inject(TryoutVariantGenerationService)
    private readonly service: TryoutVariantGenerationService,
  ) {}

  @Get(':packageId/variant-options')
  @ApiOkResponse({ type: TryoutVariantOptionsDto })
  options(
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Query('anchors') anchors?: string,
  ) {
    const selected = (anchors ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return this.service.options(packageId, selected);
  }

  @Post(':packageId/variants')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: TryoutVariantProcessDto })
  prepare(
    @Req() request: AdminRequest,
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() body: CreateTryoutVariantDto,
  ) {
    return this.service.prepare(request.adminId, packageId, body);
  }

  @Get('variant-processes/:id')
  @ApiOkResponse({ type: TryoutVariantProcessDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post('variant-processes/:id/materialize')
  @ApiOkResponse({ schema: { properties: { id: { type: 'string', format: 'uuid' } } } })
  materialize(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.materialize(request.adminId, id);
  }
}
