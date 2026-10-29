import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentMutationDto } from './content.dto';
import {
  PretestBlueprintsDto,
  PretestDraftDto,
  PretestDto,
  PretestEditDto,
  PretestReviewDto,
  PretestsDto,
} from './pretest.dto';
import { PretestService } from './pretest.service';
@ApiTags('admin-content')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content/pretest-packages')
export class PretestController {
  constructor(@Inject(PretestService) private readonly service: PretestService) {}
  @Get('blueprints') @ApiOkResponse({ type: PretestBlueprintsDto }) blueprints() {
    return this.service.blueprints();
  }
  @Get()
  @ApiOkResponse({ type: PretestsDto })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  list(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    if (limit < 1 || limit > 50 || offset < 0)
      throw new BadRequestException({ code: 'PAGINATION_INVALID' });
    return this.service.list(limit, offset);
  }
  @Get(':id') @ApiOkResponse({ type: PretestDto }) get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }
  @Post() @ApiCreatedResponse({ type: ContentMutationDto }) create(
    @Req() r: AdminRequest,
    @Body() b: PretestDraftDto,
  ) {
    return this.service.create(r.adminId, b);
  }
  @Put(':id') @ApiOkResponse({ type: ContentMutationDto }) update(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: PretestEditDto,
  ) {
    return this.service.update(r.adminId, id, b);
  }
  @Post(':id/revisions') @ApiCreatedResponse({ type: ContentMutationDto }) revise(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: PretestEditDto,
  ) {
    return this.service.revise(r.adminId, id, b);
  }
  @Post(':id/review') @HttpCode(200) @ApiOkResponse({ type: ContentMutationDto }) review(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: PretestReviewDto,
  ) {
    return this.service.review(r.adminId, id, b.reason);
  }
  @Post(':id/archive') @HttpCode(200) @ApiOkResponse({ type: ContentMutationDto }) archive(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.archive(r.adminId, id);
  }
  @Post(':id/publish') @HttpCode(200) publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publish(id);
  }
}
