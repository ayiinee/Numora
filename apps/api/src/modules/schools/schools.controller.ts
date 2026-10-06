import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { SchoolsService } from './schools.service';
import { TEACHER_TOKEN_PATTERN } from './teacher-token';
import { CodeAttempt, CodeAttemptGuard } from '../security/code-attempt.guard';

class SchoolDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}
class SchoolListDto {
  @ApiProperty({ type: [SchoolDto] }) items!: SchoolDto[];
}
class VerifyTeacherDto {
  @ApiProperty({ minLength: 8, maxLength: 128, pattern: TEACHER_TOKEN_PATTERN })
  @IsString()
  @Length(8, 128)
  @Matches(new RegExp(TEACHER_TOKEN_PATTERN))
  token!: string;
}
class VerifiedDto {
  @ApiProperty() verified!: boolean;
}
class LeftSchoolDto {
  @ApiProperty() left!: boolean;
}

@ApiTags('schools')
@ApiBearerAuth()
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Get()
  @ApiOkResponse({ type: SchoolListDto })
  list(@Headers('authorization') authorization?: string) {
    return this.schools.listForTeacher(authorization);
  }

  @Post(':schoolId/teacher-verifications')
  @CodeAttempt('teacher')
  @UseGuards(CodeAttemptGuard)
  @ApiResponse({
    status: 429,
    description: 'Attempt limit exceeded.',
    headers: { 'Retry-After': { schema: { type: 'integer' } } },
  })
  @ApiResponse({ status: 503, description: 'Attempt limiter unavailable.' })
  @ApiCreatedResponse({ type: VerifiedDto })
  verify(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: VerifyTeacherDto,
  ) {
    return this.schools.verifyTeacher(authorization, schoolId, body.token);
  }

  @Post(':schoolId/leave')
  @ApiCreatedResponse({ type: LeftSchoolDto })
  leave(
    @Headers('authorization') authorization: string | undefined,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ) {
    return this.schools.leaveSchool(authorization, schoolId);
  }
}
