import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { assessmentAnswerInput } from './assessment-answer.input';
import { PretestService } from './pretest.service';
import {
  PretestAttemptDto,
  PretestChapterDto,
  PretestResultDto,
  PretestSavedAnswerDto,
  SavePretestAnswerDto,
  StartPretestDto,
} from './pretest.dto';

@ApiTags('pretest')
@ApiBearerAuth()
@Controller('pretest')
export class PretestController {
  constructor(private readonly pretest: PretestService) {}
  @Get('chapters/:chapterId')
  @ApiOkResponse({ type: PretestChapterDto })
  chapter(
    @Headers('authorization') auth: string | undefined,
    @Param('chapterId', ParseUUIDPipe) id: string,
  ) {
    return this.pretest.chapter(auth, id);
  }
  @Post('chapters/:chapterId/skip')
  @ApiOkResponse({ type: PretestChapterDto })
  skip(
    @Headers('authorization') auth: string | undefined,
    @Param('chapterId', ParseUUIDPipe) id: string,
  ) {
    return this.pretest.skip(auth, id);
  }
  @Post('attempts')
  @ApiCreatedResponse({ type: PretestAttemptDto })
  start(@Headers('authorization') auth: string | undefined, @Body() input: StartPretestDto) {
    return this.pretest.start(auth, input.chapterId);
  }
  @Get('attempts/:attemptId')
  @ApiOkResponse({ type: PretestAttemptDto })
  attempt(
    @Headers('authorization') auth: string | undefined,
    @Param('attemptId', ParseUUIDPipe) id: string,
  ) {
    return this.pretest.attempt(auth, id);
  }
  @Patch('attempts/:attemptId/answers/:questionInstanceId')
  @ApiOkResponse({ type: PretestSavedAnswerDto })
  save(
    @Headers('authorization') auth: string | undefined,
    @Param('attemptId', ParseUUIDPipe) id: string,
    @Param('questionInstanceId', ParseUUIDPipe) question: string,
    @Body() input: SavePretestAnswerDto,
  ) {
    return this.pretest.saveAnswer(
      auth,
      id,
      question,
      assessmentAnswerInput(input),
      input.expectedRevision,
    );
  }
  @Post('attempts/:attemptId/submit')
  @ApiCreatedResponse({ type: PretestResultDto })
  submit(
    @Headers('authorization') auth: string | undefined,
    @Param('attemptId', ParseUUIDPipe) id: string,
  ) {
    return this.pretest.submit(auth, id);
  }
  @Get('attempts/:attemptId/result')
  @ApiOkResponse({ type: PretestResultDto })
  result(
    @Headers('authorization') auth: string | undefined,
    @Param('attemptId', ParseUUIDPipe) id: string,
  ) {
    return this.pretest.result(auth, id);
  }
}
