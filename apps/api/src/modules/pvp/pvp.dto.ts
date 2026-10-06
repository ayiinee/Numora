import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { OptionDto } from '../learning/learning.dto';
import type { Difficulty } from './pvp.policy';

export class DifficultyQueryDto {
  @ApiProperty({ enum: ['easy', 'medium', 'hard'] })
  @IsIn(['easy', 'medium', 'hard'])
  difficulty!: Difficulty;
}
export class PvpAvailabilityDto {
  @ApiProperty() available!: boolean;
  @ApiProperty({ type: String, nullable: true }) reasonCode!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ['demo', 'official'], required: false }) dataMode?: 'demo' | 'official';
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false }) activeMatchId?:
    string | null;
  @ApiProperty({ type: () => [PvpDifficultyAvailabilityDto], required: false })
  difficulties?: PvpDifficultyAvailabilityDto[];
}
export class PvpDifficultyAvailabilityDto {
  @ApiProperty({ enum: ['easy', 'medium', 'hard'] }) difficulty!: Difficulty;
  @ApiProperty() available!: boolean;
  @ApiProperty({ type: String, nullable: true }) reasonCode!: string | null;
}
export class StudentPeerDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() displayName!: string;
}
export class StudentPeersDto {
  @ApiProperty({ type: [StudentPeerDto] }) classmates!: StudentPeerDto[];
}
export class PvpPlayerDto extends StudentPeerDto {
  @ApiProperty() slot!: number;
  @ApiProperty() ready!: boolean;
  @ApiProperty() connectionStatus!: string;
  @ApiProperty({ type: String, nullable: true }) reconnectDeadlineAt!: string | null;
  @ApiProperty() points!: number;
  @ApiProperty({ type: String, nullable: true }) result!: string | null;
}
export class PvpQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() order!: number;
  @ApiProperty() stem!: string;
  @ApiProperty({ type: [OptionDto] }) options!: OptionDto[];
  @ApiProperty() deadlineAt!: string;
  @ApiProperty() durationSeconds!: number;
  @ApiProperty() answered!: boolean;
  @ApiProperty({ type: String, nullable: true }) selectedOptionId!: string | null;
}
export class PvpSnapshotDto {
  @ApiProperty() matchId!: string;
  @ApiProperty() roomCode!: string;
  @ApiProperty() creatorStudentId!: string;
  @ApiProperty({ enum: ['easy', 'medium', 'hard'] }) difficulty!: Difficulty;
  @ApiProperty({ enum: ['WAITING', 'READY', 'RUNNING', 'FINISHED', 'CANCELLED'] }) status!: string;
  @ApiProperty() serverTime!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ required: false }) participantActive?: boolean;
  @ApiProperty({ type: String, nullable: true, required: false }) expiresAt?: string | null;
  @ApiProperty() recordEligible!: boolean;
  @ApiProperty({ type: String, nullable: true }) endReason!: string | null;
  @ApiProperty({ type: [PvpPlayerDto] }) players!: PvpPlayerDto[];
  @ApiProperty({ type: PvpQuestionDto, nullable: true }) question!: PvpQuestionDto | null;
}
export class PvpInviteDto {
  @ApiProperty() id!: string;
  @ApiProperty() matchId!: string;
  @ApiProperty() roomCode!: string;
  @ApiProperty() senderName!: string;
  @ApiProperty({ type: String, nullable: true }) expiresAt!: string | null;
}
export class PvpInvitesDto {
  @ApiProperty({ type: [PvpInviteDto] }) invites!: PvpInviteDto[];
}
