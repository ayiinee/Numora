import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Optional,
  ConflictException,
  ServiceUnavailableException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { GeneratorPackagesService } from './generator-packages.service';
import {
  CreateGeneratorPackageDto,
  GeneratorJsonPreviewDto,
  GeneratorPackageCatalogDto,
  GeneratorPackageDto,
  GeneratorPackageFileDto,
  GeneratorPackagesDto,
  ValidateGeneratorJsonDto,
} from './generator-packages.dto';
import { GeneratorDraftDto } from './generator.dto';
import { ContentPackagesService } from './content-packages.service';
import { ContentPackageDetailDto, PublishContentPackageDto } from './content-packages.dto';
@ApiTags('admin-generator-packages')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content/generator/packages')
export class GeneratorPackagesController {
  constructor(
    @Inject(GeneratorPackagesService) private readonly service: GeneratorPackagesService,
    @Optional() @Inject(ContentPackagesService) private readonly packages?: ContentPackagesService,
  ) {}
  private async canonical(id: string) {
    const group = await this.service.detail(id);
    if (!group.packageId) throw new ConflictException({ code: 'GENERATOR_IMPORT_REQUIRED' });
    if (!this.packages)
      throw new ServiceUnavailableException({ code: 'CONTENT_IMPORT_PREVIEW_DISABLED' });
    return { id: group.packageId, packages: this.packages };
  }
  @Get(':id/content-package')
  @ApiOkResponse({ type: ContentPackageDetailDto })
  async contentPackage(@Param('id', ParseUUIDPipe) id: string) {
    const canonical = await this.canonical(id);
    return canonical.packages.detail(canonical.id);
  }
  @Post(':id/publish') @HttpCode(200) @ApiOkResponse({ type: GeneratorDraftDto }) async publish(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishContentPackageDto,
  ) {
    const canonical = await this.canonical(id);
    return canonical.packages.publish(r.adminId, canonical.id, body);
  }
  @Get('catalog') @ApiOkResponse({ type: GeneratorPackageCatalogDto }) catalog() {
    return this.service.catalog();
  }
  @Get() @ApiOkResponse({ type: GeneratorPackagesDto }) list() {
    return this.service.list();
  }
  @Post()
  @HttpCode(202)
  @ApiAcceptedResponse({ type: GeneratorPackageDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  prepare(
    @Req() r: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateGeneratorPackageDto,
  ) {
    return this.service.prepare(r.adminId, key ?? '', body);
  }
  @Get(':id') @ApiOkResponse({ type: GeneratorPackageDto }) detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(id);
  }
  @Get(':id/file') @ApiOkResponse({ type: GeneratorPackageFileDto }) file(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.export(id);
  }
  @Post(':id/retry')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: GeneratorPackageDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  retry(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.service.retry(r.adminId, key ?? '', id);
  }
  @Post(':id/validate-json')
  @HttpCode(200)
  @ApiOkResponse({ type: GeneratorJsonPreviewDto })
  validate(@Param('id', ParseUUIDPipe) id: string, @Body() body: ValidateGeneratorJsonDto) {
    return this.service.validate(id, body.file);
  }
  @Post(':id/import-json')
  @HttpCode(200)
  @ApiOkResponse({ type: GeneratorDraftDto })
  import(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ValidateGeneratorJsonDto,
  ) {
    return this.service.import(r.adminId, id, body.file);
  }
}
