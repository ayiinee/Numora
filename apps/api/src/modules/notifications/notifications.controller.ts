import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  NotificationQueryDto,
  NotificationsDto,
  NotificationSummaryDto,
  NotificationReadDto,
} from './notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('students/me/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  @ApiOkResponse({ type: NotificationsDto })
  list(@Headers('authorization') auth: string | undefined, @Query() query: NotificationQueryDto) {
    return this.service.list(auth, query);
  }
  @Get('summary')
  @ApiOkResponse({ type: NotificationSummaryDto })
  summary(@Headers('authorization') auth?: string) {
    return this.service.summary(auth);
  }
  @Post('read-all')
  @HttpCode(200)
  @ApiOkResponse({ type: NotificationReadDto })
  readAll(@Headers('authorization') auth?: string) {
    return this.service.readAll(auth);
  }
  @Post(':id/read')
  @HttpCode(200)
  @ApiOkResponse({ type: NotificationReadDto })
  read(@Headers('authorization') auth: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.read(auth, id);
  }
}
