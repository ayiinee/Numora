import { ApiProperty } from '@nestjs/swagger';

export class MaterialSubchapterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
  @ApiProperty() totalLevels!: number;
  @ApiProperty() completedLevels!: number;
  @ApiProperty() availableLevels!: number;
  @ApiProperty({ type: Number, nullable: true }) latestScore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) bestScore!: number | null;
}
export class MaterialChapterDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['algebra', 'geometry', 'numbers', 'statistics'],
  })
  category!: string | null;
  @ApiProperty() totalLevels!: number;
  @ApiProperty() completedLevels!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) continueSubchapterId!:
    string | null;
  @ApiProperty({ type: [MaterialSubchapterDto] }) subchapters!: MaterialSubchapterDto[];
}
export class StudentMaterialsDto {
  @ApiProperty({ type: [MaterialChapterDto] }) chapters!: MaterialChapterDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) recentChapterId!: string | null;
}
