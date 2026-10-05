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
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, IsUUID, ValidateIf, Length, Matches } from 'class-validator';
import { ClassesService } from './classes.service';
import { CodeAttempt, CodeAttemptGuard } from '../security/code-attempt.guard';

class ClassSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ required: false }) joinCode?: string;
}

class CreatedClassDto extends ClassSummaryDto {
  @ApiProperty({ required: true }) declare joinCode: string;
}
class CreateClassDto {
  @ApiProperty({ required: false, format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  schoolId?: string;
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  name!: string;
}
class JoinClassDto {
  @ApiProperty({ minLength: 6, maxLength: 32, pattern: '^(?:[A-Za-z0-9]{6}|[A-Za-z0-9_-]{8,32})$' })
  @IsString()
  @Length(6, 32)
  @Matches(/^(?:[A-Za-z0-9]{6}|[A-Za-z0-9_-]{8,32})$/)
  joinCode!: string;
}
class JoinedClassDto {
  @ApiProperty({ type: ClassSummaryDto }) class!: ClassSummaryDto;
  @ApiProperty() joined!: boolean;
}
class LeftClassDto {
  @ApiProperty() left!: boolean;
}
class ClassBanDto {
  @ApiProperty() banned!: boolean;
}

class StudentSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

class ClassesResponseDto {
  @ApiProperty({ type: [ClassSummaryDto] }) items!: ClassSummaryDto[];
}

class ClassStudentsResponseDto {
  @ApiProperty({ type: ClassSummaryDto }) class!: ClassSummaryDto;
  @ApiProperty({ type: [StudentSummaryDto] }) items!: StudentSummaryDto[];
}

@ApiTags('classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @ApiOkResponse({ type: ClassesResponseDto })
  list(@Headers('authorization') authorization?: string) {
    return this.classes.list(authorization);
  }

  @Post()
  @ApiCreatedResponse({ type: CreatedClassDto })
  create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateClassDto,
  ) {
    return this.classes.create(authorization, body.name, body.schoolId);
  }

  @Post('takeover')
  @CodeAttempt('class')
  @UseGuards(CodeAttemptGuard)
  @ApiCreatedResponse({ type: CreatedClassDto })
  takeover(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: JoinClassDto,
  ) {
    return this.classes.takeover(authorization, body.joinCode);
  }

  @Post(':classId/leave')
  @ApiCreatedResponse({ type: LeftClassDto })
  leave(
    @Headers('authorization') authorization: string | undefined,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classes.leave(authorization, classId);
  }

  @Post(':classId/students/:studentId/ban')
  @ApiCreatedResponse({ type: ClassBanDto })
  ban(
    @Headers('authorization') authorization: string | undefined,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.classes.setBan(authorization, classId, studentId, true);
  }

  @Post(':classId/students/:studentId/unban')
  @ApiCreatedResponse({ type: ClassBanDto })
  unban(
    @Headers('authorization') authorization: string | undefined,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.classes.setBan(authorization, classId, studentId, false);
  }

  @Post('join')
  @CodeAttempt('class')
  @UseGuards(CodeAttemptGuard)
  @ApiResponse({
    status: 429,
    description: 'Attempt limit exceeded.',
    headers: { 'Retry-After': { schema: { type: 'integer' } } },
  })
  @ApiResponse({ status: 503, description: 'Attempt limiter unavailable.' })
  @ApiCreatedResponse({ type: JoinedClassDto })
  join(@Headers('authorization') authorization: string | undefined, @Body() body: JoinClassDto) {
    return this.classes.join(authorization, body.joinCode);
  }

  @Get(':classId/students')
  @ApiParam({ name: 'classId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: ClassStudentsResponseDto })
  students(
    @Headers('authorization') authorization: string | undefined,
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ) {
    return this.classes.students(authorization, classId);
  }
}
