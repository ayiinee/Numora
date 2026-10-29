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
import type { AdminRequest } from '../identity/admin.guard';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { ContentMutationDto, ContentPageDto } from './content.dto';
import {
  AdminDrillPackageDto,
  AdminDrillPackagesDto,
  CreateDrillPackageDto,
  UpdateDrillPackageDto,
  PublishDrillPackageDto,
} from './drill-packages.dto';
import { DrillPackagesService } from './drill-packages.service';

@ApiTags('admin-drill-packages')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content/drill-packages')
export class DrillPackagesController {
  constructor(@Inject(DrillPackagesService) private readonly packages: DrillPackagesService) {}
  @Get()
  @ApiOkResponse({ type: AdminDrillPackagesDto })
  list(@Query() page: ContentPageDto) {
    return this.packages.list(page);
  }
  @Get(':id')
  @ApiOkResponse({ type: AdminDrillPackageDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.packages.detail(id);
  }
  @Post()
  @ApiCreatedResponse({ type: ContentMutationDto })
  create(@Req() request: AdminRequest, @Body() body: CreateDrillPackageDto) {
    return this.packages.create(request.adminId, body);
  }
  @Patch(':id')
  @ApiOkResponse({ type: ContentMutationDto })
  update(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDrillPackageDto,
  ) {
    return this.packages.update(request.adminId, id, body);
  }
  @Post(':id/publish')
  @ApiCreatedResponse({ type: ContentMutationDto })
  publish(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishDrillPackageDto,
  ) {
    return this.packages.publish(request.adminId, id, body.curriculumApprovalReference);
  }
  @Post(':id/archive')
  @ApiCreatedResponse({ type: ContentMutationDto })
  archive(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.packages.archive(request.adminId, id);
  }
}
