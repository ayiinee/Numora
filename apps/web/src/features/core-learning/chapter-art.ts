import type { MaterialChapterDto } from './generated-types';

export const chapterImages: Record<NonNullable<MaterialChapterDto['category']>, string> = {
  algebra: '/illustrations/chapters/algebra.webp',
  geometry: '/illustrations/chapters/geometry.webp',
  numbers: '/illustrations/chapters/numbers.webp',
  statistics: '/illustrations/chapters/statistics.webp',
};

export function activityChapterImage(
  chapters: MaterialChapterDto[] | undefined,
  chapterId: string | null | undefined,
) {
  const category = chapterId
    ? chapters?.find((chapter) => chapter.id === chapterId)?.category
    : null;
  return category ? chapterImages[category] : undefined;
}
