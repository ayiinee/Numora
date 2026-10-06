import {
  Body,
  Controller,
  Get,
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
  ApiOkResponse,
  ApiTags,
  ApiBody,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentMutationDto } from './content.dto';
import {
  ContentVersionDetailDto,
  ReviewContentDto,
  parseContentReview,
} from './content-lifecycle.dto';
import { ContentPackagesService } from './content-packages.service';
import { ReviewImportedQuestionDto } from './content-packages.dto';
import { ContentLifecycleService } from './content-lifecycle.service';
@ApiTags('admin-content')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content/versions')
export class ContentLifecycleController {
  constructor(
    @Inject(ContentLifecycleService) private readonly lifecycle: ContentLifecycleService,
    @Inject(ContentPackagesService) private readonly packages: ContentPackagesService,
  ) {}
  @Get(':id')
  @ApiOkResponse({ type: ContentVersionDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.get(id);
  }
  @ApiExtraModels(ReviewContentDto, ReviewImportedQuestionDto)
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ReviewContentDto) },
        { $ref: getSchemaPath(ReviewImportedQuestionDto) },
      ],
    },
  })
  @Post(':id/review')
  @HttpCode(200)
  @ApiOkResponse({ type: ContentMutationDto })
  review(@Req() r: AdminRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: unknown) {
    const body = parseContentReview(input);
    return 'packageId' in body
      ? this.packages.review(r.adminId, id, body)
      : this.lifecycle.review(r.adminId, id, body);
  }
}
