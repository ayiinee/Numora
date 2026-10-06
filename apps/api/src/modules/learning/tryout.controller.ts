import { assessmentAnswerInput } from './assessment-answer.input';
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SaveDrillAnswerDto, SavedAnswerDto } from './learning.dto';
import {
  CurrentTryoutDto,
  StartTryoutDto,
  TryoutAttemptDto,
  TryoutResultDto,
  TryoutSubmitDto,
  TryoutPackagesDto,
  TryoutPackageDto,
} from './tryout.dto';
import { TryoutService } from './tryout.service';

@ApiTags('tryout')
@ApiBearerAuth()
@Controller('tryout')
export class TryoutController {
  constructor(private readonly tryout: TryoutService) {}

  @Get('packages/current')
  @ApiOkResponse({ type: CurrentTryoutDto })
  current(@Headers('authorization') authorization?: string) {
    return this.tryout.current(authorization);
  }

  @Get('packages') @ApiOkResponse({ type: TryoutPackagesDto })
  packages(@Headers('authorization') authorization?: string, @Query('cursor') cursor?: string) {
    return this.tryout.packages(authorization, cursor);
  }

  @Get('packages/:packageId') @ApiOkResponse({ type: TryoutPackageDto })
  packageDetail(@Headers('authorization') authorization: string | undefined, @Param('packageId', ParseUUIDPipe) packageId: string) {
    return this.tryout.packageDetail(authorization, packageId);
  }

  @Post('attempts')
  @ApiCreatedResponse({ type: TryoutAttemptDto })
  start(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: StartTryoutDto,
  ) {
    return this.tryout.start(authorization, input.packageId);
  }

  @Get('attempts/:attemptId')
  @ApiOkResponse({ type: TryoutAttemptDto })
  attempt(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.tryout.attempt(authorization, attemptId);
  }

  @Patch('attempts/:attemptId/answers/:questionInstanceId')
  @ApiOkResponse({ type: SavedAnswerDto })
  saveAnswer(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionInstanceId', ParseUUIDPipe) questionInstanceId: string,
    @Body() input: SaveDrillAnswerDto,
  ) {
    return this.tryout.saveAnswer(
      authorization,
      attemptId,
      questionInstanceId,
      assessmentAnswerInput(input),
    );
  }

  @Post('attempts/:attemptId/submit')
  @ApiCreatedResponse({ type: TryoutSubmitDto })
  submit(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.tryout.submit(authorization, attemptId);
  }

  @Get('attempts/:attemptId/result')
  @ApiOkResponse({ type: TryoutResultDto })
  result(
    @Headers('authorization') authorization: string | undefined,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.tryout.result(authorization, attemptId);
  }
}
