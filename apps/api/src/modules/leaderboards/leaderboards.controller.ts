import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  ClassLeaderboardQueryDto,
  LeaderboardDto,
  LeaderboardQueryDto,
  LeaderboardPeriodsDto,
  LeaderboardPeriodsQueryDto,
  PvpLeaderboardQueryDto,
} from './leaderboards.dto';
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
    @Query() query: PvpLeaderboardQueryDto,
  ) {
    return this.service.pvp(authorization, query.difficulty, query.periodId);
  }
  @Get('class')
  @ApiOkResponse({ type: LeaderboardDto })
  class(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ClassLeaderboardQueryDto,
  ) {
    return this.service.class(authorization, query.classId, query.periodId);
  }
  @Get('activity')
  @ApiOkResponse({ type: LeaderboardDto })
  activity(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.service.activity(authorization, query.periodId);
  }
  @Get('periods')
  @ApiOkResponse({ type: LeaderboardPeriodsDto })
  periods(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: LeaderboardPeriodsQueryDto,
  ) {
    return this.service.periods(authorization, query);
  }
}
