import { assessmentAnswerInput } from './assessment-answer.input';
import { MaterialsService } from './materials.service';
import { StudentMaterialsDto } from './materials.dto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DrillAssessmentService } from './drill-assessment.service';
import { AssessmentHistoryService } from './assessment-history.service';
import { LearningCatalogService } from './learning-catalog.service';
import { StudentDashboardService } from './student-dashboard.service';
import { StudentDashboardDto } from './student-dashboard.dto';
import {
  CatalogDto,
  AssessmentHistoryDto,
  ChapterDetailDto,
  DrillAttemptDto,
  DrillResultDto,
  SaveDrillAnswerDto,
  SavedAnswerDto,
  StartDrillDto,
  StudentProgressDto,
  SubchapterDetailDto,
} from './learning.dto';

@ApiTags('core-learning')
@ApiBearerAuth()
@Controller()
export class LearningController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly catalogService: LearningCatalogService,
    private readonly drillService: DrillAssessmentService,
    private readonly historyService: AssessmentHistoryService,
    private readonly dashboardService: StudentDashboardService,
  ) {}

  @Get('students/me/dashboard')
  @ApiOkResponse({ type: StudentDashboardDto })
  dashboard(@Headers('authorization') authorization?: string) {
    return this.dashboardService.dashboard(authorization);
  }

  @Get('students/me/materials')
  @ApiOkResponse({ type: StudentMaterialsDto })
  materials(@Headers('authorization') auth?: string) {
    return this.materialsService.list(auth);
  }

  @Get('chapters')
  @ApiOkResponse({ type: CatalogDto })
  catalog(@Headers('authorization') authorization?: string) {
    return this.catalogService.catalog(authorization);
  }

  @Get('chapters/:chapterId')
  @ApiOkResponse({ type: ChapterDetailDto })
  chapter(
    @Headers('authorization') authorization: string | undefined,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
  ) {
    return this.catalogService.chapter(authorization, chapterId);
  }

  @Get('subchapters/:subchapterId')
  @ApiOkResponse({ type: SubchapterDetailDto })
  subchapter(
    @Headers('authorization') authorization: string | undefined,
    @Param('subchapterId', ParseUUIDPipe) subchapterId: string,
  ) {
    return this.catalogService.subchapter(authorization, subchapterId);
  }

  @Get('students/me/progress')
  @ApiOkResponse({ type: StudentProgressDto })
  progress(@Headers('authorization') authorization?: string) {
    return this.catalogService.progress(authorization);
  }

  @Get('students/me/assessment-results')
  @ApiOkResponse({ type: AssessmentHistoryDto })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: { type: 'string', format: 'uuid' },
    description: 'Last record from the previous page of this Student and level filter.',
  })
  @ApiQuery({
    name: 'levelId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
    description: 'Optional pinned level ID; use the same filter on every page.',
  })
  history(
    @Headers('authorization') authorization: string | undefined,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('levelId', new ParseUUIDPipe({ optional: true })) levelId?: string,
  ) {
    return this.historyService.list(authorization, cursor, levelId);
  }

  @Post('assessments/drill/attempts')
  @ApiCreatedResponse({ type: DrillAttemptDto })
  start(@Headers('authorization') authorization: string | undefined, @Body() input: StartDrillDto) {
    return this.drillService.start(authorization, input.levelId);
  }

  @Get('assessment-attempts/:attemptId')
  @ApiOkResponse({ type: DrillAttemptDto })
  attempt(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.drillService.attempt(authorization, attemptId);
  }

  @Patch('assessment-attempts/:attemptId/answers/:questionInstanceId')
  @ApiOkResponse({ type: SavedAnswerDto })
  saveAnswer(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionInstanceId', ParseUUIDPipe) questionInstanceId: string,
    @Body() input: SaveDrillAnswerDto,
  ) {
    return this.drillService.saveAnswer(
      authorization,
      attemptId,
      questionInstanceId,
      assessmentAnswerInput(input),
    );
  }

  @Post('assessment-attempts/:attemptId/submit')
  @ApiCreatedResponse({ type: DrillResultDto })
  submit(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.drillService.submit(authorization, attemptId);
  }

  @Get('assessment-attempts/:attemptId/result')
  @ApiOkResponse({ type: DrillResultDto })
  result(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.drillService.result(authorization, attemptId);
  }
}
