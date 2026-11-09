import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { TryoutBatchesService } from '../learning/tryout-batches.service';
import {
  TryoutBatchOptionsDto,
  CancelTryoutBatchDto,
  SaveTryoutBatchDto,
  TryoutBatchDto,
  TryoutBatchesDto,
  TryoutBatchQueryDto,
  TryoutBatchRevisionDto,
} from '../learning/tryout-batches.dto';
import { ContentMutationDto } from './content.dto';

@ApiTags('admin-tryout-batches')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/tryout-batches')
export class AdminTryoutBatchesController {
  constructor(private readonly batches: TryoutBatchesService) {}
  @Get() @ApiOkResponse({ type: TryoutBatchesDto }) list(@Query() query: TryoutBatchQueryDto) {
    return this.batches.list(query);
  }
  @Get('options') @ApiOkResponse({ type: TryoutBatchOptionsDto }) options(
    @Query() query: TryoutBatchQueryDto,
  ) {
    return this.batches.options(query);
  }
  @Get(':id') @ApiOkResponse({ type: TryoutBatchDto }) detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.batches.detail(id);
  }
  @Post() @ApiCreatedResponse({ type: ContentMutationDto }) create(
    @Req() r: AdminRequest,
    @Body() body: SaveTryoutBatchDto,
  ) {
    return this.batches.save(r.adminId, body);
  }
  @Patch(':id') @ApiOkResponse({ type: ContentMutationDto }) update(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveTryoutBatchDto,
  ) {
    return this.batches.save(r.adminId, body, id);
  }
  @Post(':id/publish') @ApiCreatedResponse({ type: ContentMutationDto }) publish(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TryoutBatchRevisionDto,
  ) {
    return this.batches.publish(r.adminId, id, body.expectedRevision);
  }
  @Post(':id/cancel') @ApiCreatedResponse({ type: ContentMutationDto }) cancel(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelTryoutBatchDto,
  ) {
    return this.batches.cancel(r.adminId, id, body.expectedRevision, body.reason);
  }
}
