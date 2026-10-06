import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { DifficultyQueryDto } from '../pvp/pvp.dto';

export class LeaderboardQueryDto {
  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  periodId?: string;
}
export class PvpLeaderboardQueryDto extends DifficultyQueryDto {
  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  periodId?: string;
}
export class ClassLeaderboardQueryDto extends LeaderboardQueryDto {
  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class LeaderboardEntryDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() points!: number;
  @ApiProperty() rank!: number;
}
export class LeaderboardPeriodDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false }) id?:
    string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'], required: false }) status?: 'ACTIVE' | 'ARCHIVED';
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiProperty() timezone!: string;
}
export class LeaderboardDto {
  @ApiProperty({ required: false }) available?: boolean;
  @ApiProperty({ required: false }) stale?: boolean;
  @ApiProperty({ type: String, nullable: true, required: false }) nextUpdateAt?: string | null;
  @ApiProperty({ enum: ['activity', 'demo', 'official', 'legacy'], required: false }) dataMode?:
    'activity' | 'demo' | 'official' | 'legacy';
  @ApiProperty({ required: false }) rankPolicyVersion?: string;
  @ApiProperty() policyPending!: boolean;
  @ApiProperty({ type: String, nullable: true }) reasonCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) className!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false }) classId?:
    string | null;
  @ApiProperty({ enum: ['points', 'xp'] }) unit!: 'points' | 'xp';
  @ApiProperty({ type: LeaderboardPeriodDto }) period!: LeaderboardPeriodDto;
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
  @ApiProperty({ type: [LeaderboardEntryDto] }) entries!: LeaderboardEntryDto[];
  @ApiProperty({ type: LeaderboardEntryDto, nullable: true }) ownEntry!: LeaderboardEntryDto | null;
}
export class LeaderboardPeriodsQueryDto {
  @ApiProperty({ enum: ['class', 'activity', 'pvp'] })
  @IsIn(['class', 'activity', 'pvp'])
  scope!: 'class' | 'activity' | 'pvp';
  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  classId?: string;
  @ApiProperty({ enum: ['easy', 'medium', 'hard'], required: false })
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';
}
export class LeaderboardPeriodsDto {
  @ApiProperty({ type: [LeaderboardPeriodDto] }) periods!: LeaderboardPeriodDto[];
}
