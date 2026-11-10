import { and, asc, eq } from 'drizzle-orm';
import { getDatabase, learningVideos, videoSubchapterMappings } from '@tka/database';
import { isYouTubeVideoUrl } from './youtube-url';

export const videoAdditionOrder = [asc(learningVideos.createdAt), asc(videoSubchapterMappings.id)];

type Reader = Pick<ReturnType<typeof getDatabase>['db'], 'select'>;
export async function curatedVideoRecommendations(db: Reader, subchapterId: string) {
  const items: { id: string; mappingId: string; title: string; url: string; source: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await db
      .select({
        id: learningVideos.id,
        mappingId: videoSubchapterMappings.id,
        title: learningVideos.title,
        url: learningVideos.url,
        source: learningVideos.source,
      })
      .from(videoSubchapterMappings)
      .innerJoin(learningVideos, eq(learningVideos.id, videoSubchapterMappings.videoId))
      .where(
        and(
          eq(videoSubchapterMappings.subchapterId, subchapterId),
          eq(videoSubchapterMappings.status, 'READY'),
          eq(learningVideos.curationStatus, 'READY'),
        ),
      )
      .orderBy(...videoAdditionOrder)
      .limit(100)
      .offset(offset);
    for (const item of page) {
      if (isYouTubeVideoUrl(item.url)) items.push(item);
      if (items.length === 3) return items;
    }
    if (page.length < 100) return items;
  }
}
