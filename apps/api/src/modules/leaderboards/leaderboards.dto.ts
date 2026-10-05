import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ClassLeaderboardQueryDto {
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
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiProperty() timezone!: string;
}
export class LeaderboardDto {
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
