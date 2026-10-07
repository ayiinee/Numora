import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CallHandler,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiExtraModels,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { from } from 'rxjs';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentUploadsService } from './content-uploads.service';
import { ContentService } from './content.service';
import { uploadTemplate } from './upload-template';
import {
  SaveUploadDraftDto,
  UpdateUploadPreviewDto,
  UploadDetailDto,
  UploadListDto,
  UploadQueryDto,
} from './content-uploads.dto';

const ExcelFileInterceptor = FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, fieldSize: 512 },
});
@Injectable()
export class TrackedExcelInterceptor extends ExcelFileInterceptor {
  constructor(@Inject(ContentUploadsService) private readonly uploads: ContentUploadsService) {
    super();
  }
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (!(error instanceof PayloadTooLargeException)) throw error;
      const req = context.switchToHttp().getRequest<
        AdminRequest & {
          body: { fileName?: string; byteLength?: string };
          headers: Record<string, string>;
        }
      >();
      return from(
        this.uploads.rejected(
          req.adminId,
          req.headers['idempotency-key'],
          req.body.fileName ?? '',
          Number(req.body.byteLength),
        ),
      );
    }
  }
}
@ApiTags('admin-content-uploads')
@ApiExtraModels(UploadQueryDto)
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content')
export class ContentUploadsController {
  constructor(
    @Inject(ContentUploadsService) private readonly uploads: ContentUploadsService,
    @Inject(ContentService) private readonly content: ContentService,
  ) {}
  @Get('upload-template')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template() {
    return new StreamableFile(await uploadTemplate(await this.content.curriculum()), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="NUMORA_EXCEL_V5.xlsx"',
    });
  }
  @Get('uploads') @ApiOkResponse({ type: UploadListDto }) list(@Query() query: UploadQueryDto) {
    return this.uploads.list(query);
  }
  @Post('uploads')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        fileName: { type: 'string' },
        byteLength: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: UploadDetailDto })
  @UseInterceptors(TrackedExcelInterceptor)
  receive(
    @Req() req: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file: { originalname: string; buffer: Buffer },
  ) {
    return this.uploads.receive(
      req.adminId,
      key,
      file ?? { originalname: 'File Excel', buffer: Buffer.alloc(0) },
    );
  }
  @Get('uploads/:id') @ApiOkResponse({ type: UploadDetailDto }) get(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.uploads.get(id);
  }
  @Patch('uploads/:id/preview') @ApiOkResponse({ type: UploadDetailDto }) validate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUploadPreviewDto,
  ) {
    return this.uploads.validate(id, body);
  }
  @Post('uploads/:id/draft')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: UploadDetailDto })
  save(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: SaveUploadDraftDto,
  ) {
    return this.uploads.save(req.adminId, id, key, body);
  }
}
