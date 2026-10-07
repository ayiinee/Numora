import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard, type AdminRequest } from '../identity/admin.guard';
import { RequireAdminCapability } from '../identity/admin-capabilities';
import {
  AdminClassDto,
  AdminClassListDto,
  AdminClassQueryDto,
  AdminUserListDto,
  AdminUserQueryDto,
  AdminUserDetailDto,
  AdminMembershipsDto,
  AdminRosterDto,
  AdminRosterQueryDto,
} from './operations.dto';
import { ContentPageDto } from '../content/content.dto';
import { AdminOperationsService } from './operations.service';

@ApiTags('admin-operations')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@RequireAdminCapability('OPERATIONS_MANAGE')
@Controller('admin')
export class AdminOperationsController {
  constructor(
    @Inject(AdminOperationsService) private readonly operations: AdminOperationsService,
  ) {}
  @Get('users')
  @ApiOkResponse({ type: AdminUserListDto })
  users(@Req() request: AdminRequest, @Query() query: AdminUserQueryDto) {
    return this.operations.users(query, request.adminRole);
  }
  @Get('users/:userId')
  @ApiOkResponse({ type: AdminUserDetailDto })
  user(@Req() request: AdminRequest, @Param('userId', ParseUUIDPipe) id: string) {
    return this.operations.user(id, request.adminRole);
  }
  @Get('users/:userId/memberships') @ApiOkResponse({ type: AdminMembershipsDto }) memberships(
    @Req() request: AdminRequest,
    @Param('userId', ParseUUIDPipe) id: string,
    @Query() query: ContentPageDto,
  ) {
    return this.operations.memberships(id, request.adminRole, query);
  }
  @Get('classes/:classId/roster') @ApiOkResponse({ type: AdminRosterDto }) roster(
    @Param('classId', ParseUUIDPipe) id: string,
    @Query() query: AdminRosterQueryDto,
  ) {
    return this.operations.roster(id, query);
  }
  @Get('classes')
  @ApiOkResponse({ type: AdminClassListDto })
  classes(@Query() query: AdminClassQueryDto) {
    return this.operations.classes(query);
  }
  @Get('classes/:classId')
  @ApiOkResponse({ type: AdminClassDto })
  class(@Param('classId', ParseUUIDPipe) id: string) {
    return this.operations.class(id);
  }
}
