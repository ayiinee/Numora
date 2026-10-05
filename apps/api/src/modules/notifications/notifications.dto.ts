import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const notificationFilters = [
  'all',
  'unread',
  'class',
  'tryout',
  'learning',
  'archive',
] as const;
export class NotificationQueryDto {
  @ApiPropertyOptional({ enum: notificationFilters, default: 'all' })
  @IsIn(notificationFilters)
  filter: (typeof notificationFilters)[number] = 'all';
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() cursor?: string;
}
export class NotificationActionDto {
  @ApiProperty({ enum: ['feedback', 'pvp', 'tryout', 'result', 'roadmap', 'unavailable'] }) type!:
    'feedback' | 'pvp' | 'tryout' | 'result' | 'roadmap' | 'unavailable';
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: String, nullable: true }) status!: string | null;
  @ApiPropertyOptional({ format: 'uuid' }) feedbackId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) inviteId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) matchId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) packageId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) attemptId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) chapterId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) subchapterId?: string;
}
export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'FEEDBACK_RECEIVED',
      'PVP_INVITED',
      'TRYOUT_OPENED',
      'TRYOUT_RESULT_READY',
      'LEVEL_UNLOCKED',
    ],
  })
  kind!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: string | null;
  @ApiProperty() archived!: boolean;
  @ApiProperty({ type: NotificationActionDto }) action!: NotificationActionDto;
}
export class NotificationsDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!: string | null;
}
export class NotificationSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() unread!: number;
}
export class NotificationReadDto {
  @ApiProperty() updated!: number;
}
