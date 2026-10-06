import { ApiProperty } from '@nestjs/swagger';
export class AdminAnalyticsMetricDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ['STRUCTURE', 'OPERATIONS', 'CONTENT', 'RELEASE'] }) domain!: string;
  @ApiProperty({ type: Number, nullable: true }) value!: number | null;
  @ApiProperty({ type: String, nullable: true }) unavailableReason!: string | null;
}
export class AdminAnalyticsDto {
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ enum: ['POSTGRESQL'] }) source!: string;
  @ApiProperty({ type: [AdminAnalyticsMetricDto] }) metrics!: AdminAnalyticsMetricDto[];
}
