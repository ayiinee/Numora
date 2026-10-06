import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DifficultyQueryDto } from '../pvp/pvp.dto';
import { ClassLeaderboardQueryDto, LeaderboardDto } from './leaderboards.dto';
import { LeaderboardsService } from './leaderboards.service';

@ApiTags('leaderboards')
@ApiBearerAuth()
@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly service: LeaderboardsService) {}
  @Get('pvp')
  @ApiOkResponse({ type: LeaderboardDto })
  pvp(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: DifficultyQueryDto,
  ) {
    return this.service.pvp(authorization, query.difficulty);
  }
  @Get('class')
  @ApiOkResponse({ type: LeaderboardDto })
  class(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ClassLeaderboardQueryDto,
  ) {
    return this.service.class(authorization, query.classId);
  }
  @Get('activity')
  @ApiOkResponse({ type: LeaderboardDto })
  activity(@Headers('authorization') authorization?: string) {
    return this.service.activity(authorization);
  }
}
