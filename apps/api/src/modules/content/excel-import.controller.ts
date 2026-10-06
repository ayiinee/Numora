import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { ExcelImportService } from './excel-import.service';
import { ExcelParseDto, ExcelParseInputDto } from './excel-import.dto';

@ApiTags('admin-content-preview')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content')
export class ExcelImportController {
  constructor(@Inject(ExcelImportService) private readonly excel: ExcelImportService) {}
  @Post('excel-parses')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'sourceNamespace'],
      properties: {
        file: { type: 'string', format: 'binary' },
        sourceNamespace: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' },
        packageId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOkResponse({ type: ExcelParseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, fieldSize: 128 },
    }),
  )
  parse(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() body: ExcelParseInputDto,
  ) {
    if (!file || !/\.xlsx$/i.test(file.originalname))
      throw new BadRequestException({
        code: 'EXCEL_FILE_REQUIRED',
        detail: 'Pilih satu file .xlsx.',
      });
    return this.excel.parse(file.buffer, body.sourceNamespace, body.packageId, file.originalname);
  }
  @Get('excel-template')
  @ApiQuery({ name: 'packageId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'examples', required: false, type: Boolean })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template(@Query('packageId') packageId?: string, @Query('examples') examples?: string) {
    if (packageId && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(packageId))
      throw new BadRequestException({ code: 'PACKAGE_ID_INVALID' });
    if (examples !== undefined && !['true', 'false'].includes(examples))
      throw new BadRequestException({ code: 'EXAMPLES_INVALID' });
    return new StreamableFile(await this.excel.template(packageId, examples === 'true'), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="NUMORA_EXCEL_${packageId ? 'V4' : 'V3'}.xlsx"`,
    });
  }
}
