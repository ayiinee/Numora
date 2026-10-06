import { ApiProperty } from '@nestjs/swagger';
import { AssessmentRecordDto } from './learning.dto';

export class DashboardClassDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() schoolName!: string;
}
export class DashboardDrillDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty({ nullable: true, type: String }) levelId!: string | null;
  @ApiProperty() title!: string;
}
export class StudentFeaturesDto {
  @ApiProperty() drill!: boolean;
  @ApiProperty({
    description:
      'Tryout feature access for every active Student, including Mandiri. Independent of current package availability or an existing attempt.',
  })
  tryout!: boolean;
  @ApiProperty() pretest!: boolean;
  @ApiProperty() pvp!: boolean;
  @ApiProperty() classLeaderboard!: boolean;
  @ApiProperty({ type: [String] }) pendingPolicies!: string[];
}
export class StudentDashboardDto {
  @ApiProperty() displayName!: string;
  @ApiProperty({ description: 'Account XP total from the immutable XP ledger.' }) totalXp!: number;
  @ApiProperty({ enum: ['MANDIRI', 'SCHOOL'] }) affiliation!: 'MANDIRI' | 'SCHOOL';
  @ApiProperty({ type: DashboardClassDto, nullable: true }) class!: DashboardClassDto | null;
  @ApiProperty({
    type: [DashboardClassDto],
    required: false,
    description: 'All active classes, up to five. Legacy class is the latest joined class.',
  })
  classes?: DashboardClassDto[];
  @ApiProperty() completedLevels!: number;
  @ApiProperty() availableLevels!: number;
  @ApiProperty({ type: Number, nullable: true }) latestDrillScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) bestDrillScore!: number | null;
  @ApiProperty({ type: [AssessmentRecordDto] }) activities!: AssessmentRecordDto[];
  @ApiProperty({ type: DashboardDrillDto, nullable: true }) activeDrill!: DashboardDrillDto | null;
  @ApiProperty({ type: StudentFeaturesDto }) features!: StudentFeaturesDto;
}
