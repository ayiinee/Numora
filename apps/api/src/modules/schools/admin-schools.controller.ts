import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { AdminGuard } from '../identity/admin.guard';
import { AdminAccess } from '../identity/admin-permissions';
import { SchoolsService } from './schools.service';

class AdminSchoolDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
}
class AdminSchoolsDto {
  @ApiProperty({ type: [AdminSchoolDto] }) items!: AdminSchoolDto[];
}
class CreateSchoolDto {
  @ApiProperty({ minLength: 2, maxLength: 32 })
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-zA-Z0-9-]+$/)
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  @Matches(/\S/)
  name!: string;
}
class UpdateSchoolDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/\S/)
  name?: string;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
class TokenDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() token!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
class TokenSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ type: String, nullable: true }) usedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) revokedAt!: Date | null;
}
class TokenListDto {
  @ApiProperty({ type: [TokenSummaryDto] }) items!: TokenSummaryDto[];
}
class RevokedDto {
  @ApiProperty() revoked!: boolean;
}

@ApiTags('admin-schools')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/schools')
export class AdminSchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Get()
  @AdminAccess('schoolRead')
  @ApiOkResponse({ type: AdminSchoolsDto })
  list(@Headers('authorization') authorization?: string) {
    return this.schools.listForAdmin(authorization);
  }

  @Post()
  @AdminAccess('operations')
  @ApiCreatedResponse({ type: AdminSchoolDto })
  create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateSchoolDto,
  ) {
    return this.schools.createSchool(authorization, body.code, body.name);
  }

  @Patch(':schoolId')
  @AdminAccess('operations')
  @ApiOkResponse({ type: AdminSchoolDto })
  update(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: UpdateSchoolDto,
  ) {
    return this.schools.updateSchool(authorization, schoolId, body);
  }

  @Get(':schoolId/teacher-tokens')
  @AdminAccess('operations')
  @ApiOkResponse({ type: TokenListDto })
  tokens(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ) {
    return this.schools.listTokens(authorization, schoolId);
  }

  @Post(':schoolId/teacher-tokens')
  @AdminAccess('operations')
  @ApiCreatedResponse({ type: TokenDto })
  issue(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ) {
    return this.schools.issueToken(authorization, schoolId);
  }

  @Post(':schoolId/teacher-tokens/:tokenId/reissue')
  @AdminAccess('operations')
  @ApiCreatedResponse({ type: TokenDto })
  reissue(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    return this.schools.reissueToken(authorization, schoolId, tokenId);
  }

  @Post(':schoolId/teacher-tokens/:tokenId/revoke')
  @AdminAccess('operations')
  @ApiOkResponse({ type: RevokedDto })
  revoke(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    return this.schools.revokeToken(authorization, schoolId, tokenId);
  }
}
