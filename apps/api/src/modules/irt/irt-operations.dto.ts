import { ApiProperty } from '@nestjs/swagger';
export class IrtApprovedConfigurationDto {
  @ApiProperty() approvalId!: string;
  @ApiProperty() digest!: string;
  @ApiProperty() code!: string;
  @ApiProperty() version!: number;
  @ApiProperty() kind!: string;
  @ApiProperty({ type: String, nullable: true }) contextId!: string | null;
  @ApiProperty({ format: 'date-time' }) approvedAt!: string;
}
export class IrtBatchHealthDto {
  @ApiProperty() id!: string;
  @ApiProperty() packageId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) contextId!: string | null;
  @ApiProperty({ format: 'date-time' }) closesAt!: string;
  @ApiProperty({ format: 'date-time' }) dueAt!: string;
  @ApiProperty() overdue!: boolean;
  @ApiProperty() activeAttemptCount!: number;
  @ApiProperty() finalizedAttemptCount!: number;
  @ApiProperty({ type: String, nullable: true }) publicationMode!: string | null;
  @ApiProperty({ type: Number, nullable: true }) publicationVersion!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty({ type: [String] }) prepareBlockers!: string[];
  @ApiProperty({ type: [String] }) publicationBlockers!: string[];
}
export class IrtOperationalOptionsDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: [IrtApprovedConfigurationDto] })
  configurations!: IrtApprovedConfigurationDto[];
}
export class IrtBatchHealthListDto {
  @ApiProperty({ type: [IrtBatchHealthDto] }) items!: IrtBatchHealthDto[];
}
