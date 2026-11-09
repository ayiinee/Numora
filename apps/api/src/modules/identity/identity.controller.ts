import { Body, Controller, Get, Headers, Header, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IdentityProfileDto, RegisterProfileDto } from './identity.dto';
import { IdentityService } from './identity.service';

@ApiTags('identity')
@ApiBearerAuth()
@Controller('identity/me')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: IdentityProfileDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({ description: 'Authenticated account has no internal profile yet.' })
  getProfile(@Headers('authorization') authorization?: string) {
    return this.identityService.getProfile(authorization);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: IdentityProfileDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: 'Profile already exists or email is already in use.' })
  registerProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: RegisterProfileDto,
  ) {
    return this.identityService.registerProfile(authorization, input);
  }
}
