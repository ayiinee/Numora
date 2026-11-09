import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IdentityProfileDto, ProfilePhotoDto, UpdateProfileDto } from './identity.dto';
import { ProfileService, PROFILE_PHOTO_MAX_BYTES } from './profile.service';

@Injectable()
export class ProfileOwnerGuard implements CanActivate {
  constructor(@Inject(ProfileService) private readonly service: ProfileService) {}
  async canActivate(context: ExecutionContext) {
    await this.service.owner(
      context.switchToHttp().getRequest<{ headers: { authorization?: string } }>().headers
        .authorization,
    );
    return true;
  }
}
@ApiTags('identity')
@ApiBearerAuth()
@Controller('identity')
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly service: ProfileService) {}
  @Patch('me')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: IdentityProfileDto })
  rename(@Headers('authorization') auth: string | undefined, @Body() body: UpdateProfileDto) {
    return this.service.rename(auth, body.displayName);
  }
  @Post('me/photo')
  @HttpCode(200)
  @UseGuards(ProfileOwnerGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1, fields: 0 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: IdentityProfileDto })
  upload(
    @Headers('authorization') auth: string | undefined,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    return this.service.upload(auth, file);
  }
  @Delete('me/photo')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: IdentityProfileDto })
  remove(@Headers('authorization') auth?: string) {
    return this.service.remove(auth);
  }
  @Get('profile-photos/:userId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: ProfilePhotoDto })
  photo(
    @Headers('authorization') auth: string | undefined,
    @Param('userId', ParseUUIDPipe) id: string,
  ) {
    return this.service.photo(auth, id);
  }
}
