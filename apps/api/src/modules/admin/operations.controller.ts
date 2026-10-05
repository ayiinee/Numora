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
  AdminUserDto,
  AdminUserListDto,
  AdminUserQueryDto,
} from './operations.dto';
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
  @ApiOkResponse({ type: AdminUserDto })
  user(@Req() request: AdminRequest, @Param('userId', ParseUUIDPipe) id: string) {
    return this.operations.user(id, request.adminRole);
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
