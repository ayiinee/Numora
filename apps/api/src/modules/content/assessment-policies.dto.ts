import { ApiProperty } from '@nestjs/swagger';
export class AdminAssessmentPolicyDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['DRILL', 'TRYOUT'] }) assessmentType!: 'DRILL' | 'TRYOUT';
  @ApiProperty({ type: String, nullable: true }) approvedByUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) approvedAt!: string | null;
  @ApiProperty() approvalReference!: string;
}
export class AdminAssessmentPoliciesDto {
  @ApiProperty({ type: [AdminAssessmentPolicyDto] }) items!: AdminAssessmentPolicyDto[];
}
