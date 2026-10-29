import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../identity/admin.guard';
import { RequireAdminCapability } from '../identity/admin-capabilities';
import { AdminAccountQueryDto } from './accounts.dto';
import {
  AdminStructureClassQueryDto,
  AdminStructureClassesDto,
  AdminStructureSchoolsDto,
} from './structures.dto';
import { AdminStructuresService } from './structures.service';
@ApiTags('admin-structures')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@RequireAdminCapability('OPERATIONS_LIMITED_READ')
@Controller('admin/structures')
export class AdminStructuresController {
  constructor(
    @Inject(AdminStructuresService) private readonly structures: AdminStructuresService,
  ) {}
  @Get('schools') @ApiOkResponse({ type: AdminStructureSchoolsDto }) schools(
    @Query() query: AdminAccountQueryDto,
  ) {
    return this.structures.schools(query);
  }
  @Get('classes') @ApiOkResponse({ type: AdminStructureClassesDto }) classes(
    @Query() query: AdminStructureClassQueryDto,
  ) {
    return this.structures.classes(query);
  }
}
