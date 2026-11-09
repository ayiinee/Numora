import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateFeedbackDto {
  @ApiProperty({ format: 'uuid', description: 'Stable UUID reused for identical retries.' })
  @IsUUID()
  clientRequestId!: string;
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/)
  body!: string;
}
export class FeedbackDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) classId!: string;
  @ApiProperty({ format: 'uuid' }) studentId!: string;
  @ApiProperty() teacherName!: string;
  @ApiProperty({ required: false, format: 'uuid' }) teacherId?: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) sentAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readAt!: string | null;
}
export class FeedbackListDto {
  @ApiProperty({ type: [FeedbackDto] }) items!: FeedbackDto[];
  @ApiProperty({ type: Number, nullable: true }) nextOffset!: number | null;
}
export class FeedbackSummaryDto {
  @ApiProperty() unreadCount!: number;
  @ApiProperty({ type: [FeedbackDto] }) latest!: FeedbackDto[];
}
