import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateFeedbackDto, FeedbackListDto, FeedbackMutationDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('teacher-feedback')
@ApiBearerAuth()
@Controller('classes/:classId/students/:studentId/feedback')
export class TeacherFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOkResponse({ type: FeedbackListDto })
  list(
    @Headers('authorization') authorization: string | undefined,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.feedback.forTeacher(authorization, classId, studentId);
  }

  @Post()
  @ApiCreatedResponse({ type: FeedbackMutationDto })
  send(
    @Headers('authorization') authorization: string | undefined,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: CreateFeedbackDto,
  ) {
    return this.feedback.send(authorization, classId, studentId, body.body, body.clientRequestId);
  }
}

@ApiTags('student-feedback')
@ApiBearerAuth()
@Controller('students/me/feedback')
export class StudentFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOkResponse({ type: FeedbackListDto })
  list(@Headers('authorization') authorization: string | undefined) {
    return this.feedback.forStudent(authorization);
  }

  @Patch(':feedbackId/read')
  @ApiOkResponse({ type: FeedbackMutationDto })
  markRead(
    @Headers('authorization') authorization: string | undefined,
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
  ) {
    return this.feedback.markRead(authorization, feedbackId);
  }
}