import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard, type AdminRequest } from '../identity/admin.guard';
import {
  CreateMediaUploadDto,
  MediaUploadReceiptDto,
  MediaUploadReservationDto,
} from './media-uploads.dto';
import { MediaUploadsService } from './media-uploads.service';

@ApiTags('admin-content-media')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/content/media/uploads')
export class MediaUploadsController {
  constructor(@Inject(MediaUploadsService) private readonly uploads: MediaUploadsService) {}
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: MediaUploadReservationDto })
  reserve(
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateMediaUploadDto,
  ) {
    return this.uploads.reserve(request.adminId, key, body);
  }
  @Post(':uploadId/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: MediaUploadReceiptDto })
  complete(@Req() request: AdminRequest, @Param('uploadId', ParseUUIDPipe) id: string) {
    return this.uploads.complete(request.adminId, id);
  }
}
