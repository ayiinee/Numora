import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentMutationDto } from './content.dto';
import { ContentVersionDetailDto, ReviewContentDto } from './content-lifecycle.dto';
import { ContentLifecycleService } from './content-lifecycle.service';
@ApiTags('admin-content')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content/versions')
export class ContentLifecycleController {
  constructor(
    @Inject(ContentLifecycleService) private readonly lifecycle: ContentLifecycleService,
  ) {}
  @Get(':id')
  @ApiOkResponse({ type: ContentVersionDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.get(id);
  }
  @Post(':id/review')
  @HttpCode(200)
  @ApiOkResponse({ type: ContentMutationDto })
  review(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewContentDto,
  ) {
    return this.lifecycle.review(r.adminId, id, body);
  }
}
