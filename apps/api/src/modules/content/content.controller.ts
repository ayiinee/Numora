import { AssessmentPoliciesService } from './assessment-policies.service';
import { AdminAssessmentPoliciesDto } from './assessment-policies.dto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AdminRequest } from '../identity/admin.guard';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { ContentService } from './content.service';
import {
  AdminCurriculumDto,
  AdminVersionsDto,
  AdminVideosDto,
  ContentMutationDto,
  ContentPageDto,
  ContentStatusDto,
  CreateChapterDto,
  CreateCompetencyDto,
  CreateLevelDto,
  CreateQuestionDto,
  CreateSubchapterDto,
  CreateVariantDto,
  CreateVideoDto,
  QuestionContentDto,
  UpdateChapterDto,
  UpdateCompetencyDto,
  UpdateLevelDto,
  UpdateSubchapterDto,
  UpdateVideoDto,
} from './content.dto';
import { AdminTryoutDraftsDto, CreateTryoutDraftDto, UpdateTryoutDraftDto } from './content.dto';
import { PublishTryoutPackageDto } from './content.dto';

@ApiTags('admin-content')
@ApiBearerAuth()
@UseGuards(ContentAdminGuard)
@Controller('admin/content')
export class ContentController {
  constructor(
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(AssessmentPoliciesService) private readonly policies: AssessmentPoliciesService,
  ) {}
  @Get('assessment-policies')
  @ApiOkResponse({ type: AdminAssessmentPoliciesDto })
  assessmentPolicies() {
    return this.policies.list();
  }
  @Get('curriculum')
  @ApiOkResponse({ type: AdminCurriculumDto })
  curriculum() {
    return this.content.curriculum();
  }
  @Post('chapters')
  @ApiCreatedResponse({ type: ContentMutationDto })
  chapter(@Req() r: AdminRequest, @Body() b: CreateChapterDto) {
    return this.content.createChapter(r.adminId, b);
  }
  @Patch('chapters/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  patchChapter(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateChapterDto,
  ) {
    return this.content.updateChapter(r.adminId, id, b);
  }
  @Post('subchapters')
  @ApiCreatedResponse({ type: ContentMutationDto })
  subchapter(@Req() r: AdminRequest, @Body() b: CreateSubchapterDto) {
    return this.content.createSubchapter(r.adminId, b);
  }
  @Patch('subchapters/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  patchSubchapter(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateSubchapterDto,
  ) {
    return this.content.updateSubchapter(r.adminId, id, b);
  }
  @Post('competencies')
  @ApiCreatedResponse({ type: ContentMutationDto })
  competency(@Req() r: AdminRequest, @Body() b: CreateCompetencyDto) {
    return this.content.createCompetency(r.adminId, b);
  }
  @Patch('competencies/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  patchCompetency(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateCompetencyDto,
  ) {
    return this.content.updateCompetency(r.adminId, id, b);
  }
  @Post('levels')
  @ApiCreatedResponse({ type: ContentMutationDto })
  level(@Req() r: AdminRequest, @Body() b: CreateLevelDto) {
    return this.content.createLevel(r.adminId, b);
  }
  @Patch('levels/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  patchLevel(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateLevelDto,
  ) {
    return this.content.updateLevel(r.adminId, id, b);
  }
  @Get('versions')
  @ApiOkResponse({ type: AdminVersionsDto })
  versions(@Query() q: ContentPageDto) {
    return this.content.versions(q);
  }
  @Post('questions')
  @ApiCreatedResponse({ type: ContentMutationDto })
  question(@Req() r: AdminRequest, @Body() b: CreateQuestionDto) {
    return this.content.createQuestion(r.adminId, b);
  }
  @Post('questions/:id/variants')
  @ApiCreatedResponse({ type: ContentMutationDto })
  variant(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: CreateVariantDto,
  ) {
    return this.content.createVariant(r.adminId, id, b);
  }
  @Patch('questions/:id/status')
  @ApiOkResponse({ type: ContentMutationDto })
  questionStatus(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ContentStatusDto,
  ) {
    return this.content.questionStatus(r.adminId, id, b.status);
  }
  @Post('versions/:id/revisions')
  @ApiCreatedResponse({ type: ContentMutationDto })
  revise(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: QuestionContentDto,
  ) {
    return this.content.revise(r.adminId, id, b);
  }
  @Patch('versions/:id/status')
  @ApiOkResponse({ type: ContentMutationDto })
  versionStatus(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ContentStatusDto,
  ) {
    return this.content.versionStatus(r.adminId, id, b.status);
  }
  @Get('videos')
  @ApiOkResponse({ type: AdminVideosDto })
  videos(@Query() q: ContentPageDto) {
    return this.content.videos(q);
  }
  @Post('videos')
  @ApiCreatedResponse({ type: ContentMutationDto })
  video(@Req() r: AdminRequest, @Body() b: CreateVideoDto) {
    return this.content.createVideo(r.adminId, b);
  }
  @Patch('videos/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  patchVideo(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateVideoDto,
  ) {
    return this.content.updateVideo(r.adminId, id, b);
  }
  @Get('tryout-packages')
  @ApiOkResponse({ type: AdminTryoutDraftsDto })
  packages(@Query() q: ContentPageDto) {
    return this.content.packages(q);
  }
  @Post('tryout-packages')
  @ApiCreatedResponse({ type: ContentMutationDto })
  createPackage(@Req() r: AdminRequest, @Body() b: CreateTryoutDraftDto) {
    return this.content.createPackage(r.adminId, b);
  }
  @Patch('tryout-packages/:id')
  @ApiOkResponse({ type: ContentMutationDto })
  updatePackage(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateTryoutDraftDto,
  ) {
    return this.content.updatePackage(r.adminId, id, b);
  }
  @Post('tryout-packages/:id/publish')
  @ApiCreatedResponse({ type: ContentMutationDto })
  publishPackage(
    @Req() r: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishTryoutPackageDto,
  ) {
    return this.content.publishPackage(r.adminId, id, body);
  }
}
