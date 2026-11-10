import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class TryoutDelegationInputDto {
  @ApiProperty() @IsUUID() schoolId!: string;
  @ApiProperty() @IsUUID() packageId!: string;
}
export class SaveTryoutBatchDto {
  @ApiProperty() @IsString() @Length(1, 160) title!: string;
  @ApiProperty() @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) startsAt!: string;
  @ApiProperty() @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) closesAt!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  packageIds!: string[];
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsUUID() mandiriPackageId?:
    string | null;
  @ApiProperty({ type: [TryoutDelegationInputDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TryoutDelegationInputDto)
  schools!: TryoutDelegationInputDto[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) expectedRevision?: number;
}
export class TryoutBatchRevisionDto {
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
}
export class CancelTryoutBatchDto extends TryoutBatchRevisionDto {
  @ApiProperty() @IsString() @Length(1, 1000) reason!: string;
}
export class TryoutBatchQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) familyCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 160) search?: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset =
    0;
  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 5;
}
export class TryoutBatchSchoolDto {
  @ApiProperty() schoolId!: string;
  @ApiProperty() schoolName!: string;
  @ApiProperty() packageId!: string;
}
export class TryoutBatchPackageDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() packageVersion!: number;
  @ApiProperty() familyCode!: string;
  @ApiProperty() status!: string;
  @ApiProperty() usedBatchCount!: number;
  @ApiProperty() valid!: boolean;
}
export class TryoutBatchParticipantDto {
  @ApiProperty() packageId!: string;
  @ApiProperty({ nullable: true, type: String }) schoolId!: string | null;
  @ApiProperty() assigned!: number;
  @ApiProperty() completed!: number;
}
export class TryoutBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() startsAt!: string;
  @ApiProperty() closesAt!: string;
  @ApiProperty() resultDueAt!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() state!: string;
  @ApiProperty() editable!: boolean;
  @ApiProperty({ nullable: true, type: String }) mandiriPackageId!: string | null;
  @ApiProperty({ type: [TryoutBatchPackageDto] }) packages!: TryoutBatchPackageDto[];
  @ApiProperty({ type: [TryoutBatchSchoolDto] }) schools!: TryoutBatchSchoolDto[];
  @ApiProperty({ type: [TryoutBatchParticipantDto] }) participants!: TryoutBatchParticipantDto[];
  @ApiProperty() resultsState!: string;
  @ApiProperty({ type: [String] }) resultBlockers!: string[];
}
export class TryoutBatchesDto {
  @ApiProperty({ type: [TryoutBatchDto] }) items!: TryoutBatchDto[];
  @ApiProperty() total!: number;
}
export class StartTryoutBatchDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() schoolId?: string;
}
export class StudentTryoutSchoolDto {
  @ApiProperty() schoolId!: string;
  @ApiProperty() schoolName!: string;
}
export class StudentTryoutBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() startsAt!: string;
  @ApiProperty() closesAt!: string;
  @ApiProperty() resultDueAt!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ type: [StudentTryoutSchoolDto] }) schools!: StudentTryoutSchoolDto[];
  @ApiProperty() mandiri!: boolean;
  @ApiProperty({ nullable: true, type: String }) attemptId!: string | null;
  @ApiProperty({ nullable: true, type: String }) attemptStatus!: string | null;
}
export class StudentTryoutBatchesDto {
  @ApiProperty() routingActive!: boolean;
  @ApiProperty({ type: [StudentTryoutBatchDto] }) items!: StudentTryoutBatchDto[];
}
export class TryoutBatchOptionsDto {
  @ApiProperty({ type: [TryoutBatchPackageDto] }) packages!: TryoutBatchPackageDto[];
  @ApiProperty({ type: [StudentTryoutSchoolDto] }) schools!: StudentTryoutSchoolDto[];
  @ApiProperty() packageTotal!: number;
  @ApiProperty() schoolTotal!: number;
}
