import {
  Body,
  Controller,
  Get,
  Inject,
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
import { ContentMutationDto } from './content.dto';
import { ContentPackagesService } from './content-packages.service';
import {
  ClassifyQuestionDto,
  ApproveContentPackageDto,
  PublishContentPackageDto,
  ArchiveContentPackageDto,
  ContentPackageDetailDto,
  ContentPackageQueryDto,
  ContentPackagesDto,
  CreateContentPackageDto,
  UpdateContentPackageDto,
} from './content-packages.dto';

@ApiTags('admin-content-packages')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content')
export class ContentPackagesController {
  constructor(@Inject(ContentPackagesService) private readonly packages: ContentPackagesService) {}
  @Get('packages') @ApiOkResponse({ type: ContentPackagesDto }) list(
    @Query() query: ContentPackageQueryDto,
  ) {
    return this.packages.list(query);
  }
  @Post('packages') @ApiCreatedResponse({ type: ContentMutationDto }) create(
    @Req() r: AdminRequest,
    @Body() body: CreateContentPackageDto,
  ) {
    return this.packages.create(r.adminId, body);
  }
  @Get('packages/:id') @ApiOkResponse({ type: ContentPackageDetailDto }) detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.packages.detail(id);
  }
  @Patch('packages/:id') @ApiOkResponse({ type: ContentMutationDto }) update(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateContentPackageDto,
  ) {
    return this.packages.update(r.adminId, id, body);
  }
  @Patch('questions/:id/usage') @ApiOkResponse({ type: ContentMutationDto }) classify(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ClassifyQuestionDto,
  ) {
    return this.packages.classify(r.adminId, id, body);
  }
  @Post('packages/:id/approval') @ApiOkResponse({ type: ContentMutationDto }) approve(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveContentPackageDto,
  ) {
    return this.packages.approve(r.adminId, id, body);
  }
  @Post('packages/:id/publish') @ApiOkResponse({ type: ContentMutationDto }) publish(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishContentPackageDto,
  ) {
    return this.packages.publish(r.adminId, id, body);
  }
  @Post('packages/:id/archive') @ApiOkResponse({ type: ContentMutationDto }) archive(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ArchiveContentPackageDto,
  ) {
    return this.packages.archive(r.adminId, id, body.expectedRevision);
  }
}
