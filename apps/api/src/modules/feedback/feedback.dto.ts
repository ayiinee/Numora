import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';

export class CreateFeedbackDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  clientRequestId?: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  @Matches(/\S/)
  body!: string;
}

export class FeedbackItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 1000 }) body!: string;
  @ApiProperty({ format: 'date-time' }) sentAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) readAt!: string | null;
}

export class FeedbackListDto {
  @ApiProperty({ type: [FeedbackItemDto] }) items!: FeedbackItemDto[];
}

export class FeedbackMutationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) sentAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) readAt!: string | null;
}