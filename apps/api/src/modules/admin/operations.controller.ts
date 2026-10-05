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
import { AdminAccess } from '../identity/admin-permissions';
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
@AdminAccess('operations')
@Controller('admin')
export class AdminOperationsController {
  constructor(
    @Inject(AdminOperationsService) private readonly operations: AdminOperationsService,
  ) {}
  @Get('users')
  @ApiOkResponse({ type: AdminUserListDto })
  users(@Query() query: AdminUserQueryDto, @Req() request: AdminRequest) {
    return this.operations.users(query, request.adminRole === 'SUPER_ADMIN');
  }
  @Get('users/:userId')
  @ApiOkResponse({ type: AdminUserDto })
  user(@Param('userId', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    return this.operations.user(id, request.adminRole === 'SUPER_ADMIN');
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
