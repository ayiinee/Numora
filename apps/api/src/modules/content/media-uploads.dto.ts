import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, Matches, Max, Min } from 'class-validator';

export class CreateMediaUploadDto {
  @ApiProperty({ example: 'CURR-IND16-L01-Q03' })
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
  externalId!: string;
  @ApiProperty({ example: 'bahas-1' })
  @Matches(/^[a-z0-9][a-z0-9-]{0,63}$/)
  assetId!: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  contentVersion = 1;
  @ApiProperty({ enum: ['image/png', 'image/jpeg', 'image/webp'] })
  @IsIn(['image/png', 'image/jpeg', 'image/webp'])
  contentType!: string;
  @ApiProperty({ minimum: 1, maximum: 5_242_880 })
  @IsInt()
  @Min(1)
  @Max(5_242_880)
  byteLength!: number;
  @ApiProperty({ description: 'SHA-256 hex of the exact file bytes.' })
  @Matches(/^[a-f0-9]{64}$/)
  sha256!: string;
}

export class MediaUploadReceiptDto {
  @ApiProperty({ format: 'uuid' }) uploadId!: string;
  @ApiProperty({ enum: ['PENDING', 'VERIFIED'] }) status!: 'PENDING' | 'VERIFIED';
  @ApiProperty() externalId!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty() bucket!: string;
  @ApiProperty({ description: 'Durable final key; usable only after VERIFIED.' })
  objectKey!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty() byteLength!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) verifiedAt!: string | null;
}

export class MediaUploadReservationDto extends MediaUploadReceiptDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Short-lived signed URL; never persist or log it.',
  })
  uploadUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['PUT'] }) method!: 'PUT' | null;
  @ApiProperty({ type: Object, nullable: true }) headers!: Record<string, string> | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
