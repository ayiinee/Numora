import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  chapters,
  subchapters,
  levels,
  levelProgress,
  getDatabase,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { CurriculumCache, sharedCurriculumCache } from './curriculum-cache';
import type { StudentMaterialsDto } from './materials.dto';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly identity: IdentityService,
    @Optional() private readonly curriculum: CurriculumCache = sharedCurriculumCache,
  ) {}
  async list(auth?: string): Promise<StudentMaterialsDto> {
    const student = await this.identity.me(auth);
    if (student.role !== 'STUDENT' || student.status !== 'ACTIVE')
      throw new ForbiddenException('Akses Student aktif diperlukan.');
    const { db } = getDatabase();
    const { chapterRows, subRows: subs, levelRows: metadata } = await this.curriculum.get();
    const subRows = subs.map((sub) => ({ sub }));
    const [personal, recent, graded] = await Promise.all([
      db
        .select({
          levelId: levelProgress.levelId,
          bestScore: levelProgress.bestScore,
          completedAt: levelProgress.completedAt,
          unlockedAt: levelProgress.unlockedAt,
        })
        .from(levelProgress)
        .innerJoin(levels, eq(levels.id, levelProgress.levelId))
        .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
        .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
        .where(
          and(
            eq(levelProgress.studentId, student.id),
            eq(levels.status, 'READY'),
            eq(subchapters.status, 'READY'),
            eq(chapters.status, 'READY'),
          ),
        ),
      db
        .selectDistinctOn([subchapters.chapterId], {
          chapterId: subchapters.chapterId,
          subchapterId: subchapters.id,
          startedAt: assessmentAttempts.startedAt,
        })
        .from(assessmentAttempts)
        .innerJoin(levels, eq(levels.id, assessmentAttempts.levelIdAtStart))
        .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
        .where(
          and(
            eq(assessmentAttempts.studentId, student.id),
            eq(assessmentAttempts.assessmentType, 'DRILL'),
          ),
        )
        .orderBy(
          asc(subchapters.chapterId),
          desc(assessmentAttempts.startedAt),
          desc(assessmentAttempts.id),
        ),
      db
        .selectDistinctOn([subchapters.id], {
          subchapterId: subchapters.id,
          score: assessmentAttempts.score0To100,
        })
        .from(assessmentAttempts)
        .innerJoin(levels, eq(levels.id, assessmentAttempts.levelIdAtStart))
        .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
        .where(
          and(
            eq(assessmentAttempts.studentId, student.id),
            eq(assessmentAttempts.assessmentType, 'DRILL'),
            eq(assessmentAttempts.status, 'GRADED'),
          ),
        )
        .orderBy(
          asc(subchapters.id),
          desc(assessmentAttempts.finishedAt),
          desc(assessmentAttempts.id),
        ),
    ]);
    const byLevel = new Map(personal.map((row) => [row.levelId, row]));
    const levelRows = metadata.map((level) => ({ level, progress: byLevel.get(level.id) }));
    const result = chapterRows.map((chapter) => {
      const children = subRows
        .filter(({ sub }) => sub.chapterId === chapter.id)
        .map(({ sub }) => {
          const rows = levelRows.filter(({ level }) => level.subchapterId === sub.id);
          const scores = rows
            .map(({ progress }) => progress?.bestScore)
            .filter((v): v is number => v !== null && v !== undefined);
          const latest = graded.find((r) => r.subchapterId === sub.id)?.score ?? null;
          return {
            id: sub.id,
            title: sub.name,
            order: sub.displayOrder,
            totalLevels: rows.length,
            completedLevels: rows.filter(({ progress }) => progress?.completedAt).length,
            availableLevels: rows.filter(
              ({ level, progress }) => level.levelNumber === 1 || progress?.unlockedAt,
            ).length,
            latestScore: latest === null ? null : Number(latest),
            bestScore: scores.length ? Math.max(...scores) : null,
          };
        });
      const last = recent.find((r) => r.chapterId === chapter.id);
      const destination =
        children.find((s) => s.id === last?.subchapterId && s.availableLevels > 0) ??
        children.find((s) => s.availableLevels > 0);
      return {
        id: chapter.id,
        title: chapter.name,
        order: chapter.displayOrder,
        category: chapter.materialCategory,
        totalLevels: children.reduce((n, s) => n + s.totalLevels, 0),
        completedLevels: children.reduce((n, s) => n + s.completedLevels, 0),
        continueSubchapterId: destination?.id ?? null,
        subchapters: children,
      };
    });
    const recentChapter = [...recent]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .find((r) => result.some((c) => c.id === r.chapterId));
    return { chapters: result, recentChapterId: recentChapter?.chapterId ?? null };
  }
}
