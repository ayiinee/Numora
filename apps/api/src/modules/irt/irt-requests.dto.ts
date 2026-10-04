import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ConfigurationPin } from '@tka/database';

export class IrtConfigurationPinDto implements ConfigurationPin {
  @ApiProperty({ format: 'uuid' }) @IsUUID() approvalId!: string;
  @ApiProperty() @IsString() @Length(1, 160) digest!: string;
}
export class PrepareIrtRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() contextId!: string;
  @ApiProperty({ type: [IrtConfigurationPinDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => IrtConfigurationPinDto)
  configurationPins!: IrtConfigurationPinDto[];
}
export class IrtRequestExecutionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED'] }) status!: string;
  @ApiProperty() attemptNumber!: number;
  @ApiProperty() leaseExpired!: boolean;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
}
export class IrtRequestArtifactDto {
  @ApiProperty() id!: string;
  @ApiProperty() digest!: string;
  @ApiProperty() scientificDecision!: string;
}
export class IrtRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: [3], type: Number }) contractVersion!: number;
  @ApiProperty() contextId!: string;
  @ApiProperty() packageId!: string;
  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] })
  status!: string;
  @ApiProperty() inputDigest!: string;
  @ApiProperty() snapshotId!: string;
  @ApiProperty() snapshotDigest!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty() dispatchGeneration!: number;
  @ApiProperty({ format: 'date-time' }) dueAt!: string;
  @ApiProperty() overdue!: boolean;
  @ApiProperty({ type: String, nullable: true }) acceptedExecutionId!: string | null;
  @ApiProperty({ type: IrtRequestExecutionDto, nullable: true })
  execution!: IrtRequestExecutionDto | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ type: [IrtRequestArtifactDto] }) artifacts!: IrtRequestArtifactDto[];
}
export class IrtRequestsDto {
  @ApiProperty({ type: [IrtRequestDto] }) items!: IrtRequestDto[];
}
