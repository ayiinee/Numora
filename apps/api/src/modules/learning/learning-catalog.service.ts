import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CurriculumCache, sharedCurriculumCache } from './curriculum-cache';
import {
  assessmentAttempts,
  getDatabase,
  levelProgress,
  levels,
  chapters,
  subchapters,
} from '@tka/database';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';

const problem = (code: string, detail: string) => ({ code, detail });

@Injectable()
export class LearningCatalogService {
  constructor(
    private readonly identity: IdentityService,
    @Optional() private readonly curriculum: CurriculumCache = sharedCurriculumCache,
  ) {}

  private async student(authorization?: string) {
    const user = await this.identity.me(authorization, 'access');
    if (user.role !== 'STUDENT')
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student diperlukan.'));
    return user.id;
  }

  async catalog(authorization?: string) {
    await this.student(authorization);
    const { chapterRows: rows } = await this.curriculum.get();
    return {
      chapters: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.name,
        order: row.displayOrder,
      })),
    };
  }

  async chapter(authorization: string | undefined, chapterId: string) {
    await this.student(authorization);
    const { chapterRows, subRows } = await this.curriculum.get();
    const chapter = chapterRows.find((row) => row.id === chapterId);
    if (!chapter) throw new NotFoundException(problem('CHAPTER_NOT_FOUND', 'Bab tidak ditemukan.'));
    const children = subRows.filter((row) => row.chapterId === chapterId);
    return {
      chapter: {
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.name,
        order: chapter.displayOrder,
      },
      subchapters: children.map((row) => ({
        id: row.id,
        slug: row.slug,
        chapterId: row.chapterId,
        title: row.name,
        order: row.displayOrder,
      })),
    };
  }

  async subchapter(authorization: string | undefined, subchapterId: string) {
    const studentId = await this.student(authorization);
    const { db } = getDatabase();
    const { subRows, levelRows } = await this.curriculum.get();
    const subchapter = subRows.find((row) => row.id === subchapterId);
    if (!subchapter)
      throw new NotFoundException(problem('SUBCHAPTER_NOT_FOUND', 'Subbab tidak ditemukan.'));
    const rows = levelRows.filter((row) => row.subchapterId === subchapterId);
    const levelIds = rows.map((row) => row.id);
    const states = levelIds.length
      ? await db
          .select({
            levelId: levels.id,
            unlockedAt: levelProgress.unlockedAt,
            completedAt: levelProgress.completedAt,
            latestScore: levelProgress.latestScore,
            bestScore: levelProgress.bestScore,
            latestStars: levelProgress.latestStars,
            bestStars: levelProgress.bestStars,
            active: sql<boolean>`exists (
              select 1 from ${assessmentAttempts}
              where ${assessmentAttempts.studentId} = ${studentId}
                and ${assessmentAttempts.assessmentType} = 'DRILL'
                and ${assessmentAttempts.status} = 'IN_PROGRESS'
                and ${assessmentAttempts.levelIdAtStart} = ${levels.id}
            )`,
          })
          .from(levels)
          .leftJoin(
            levelProgress,
            and(eq(levelProgress.levelId, levels.id), eq(levelProgress.studentId, studentId)),
          )
          .where(inArray(levels.id, levelIds))
      : [];
    const byLevel = new Map(states.map((row) => [row.levelId, row]));
    return {
      subchapter: {
        id: subchapter.id,
        slug: subchapter.slug,
        chapterId: subchapter.chapterId,
        title: subchapter.name,
        order: subchapter.displayOrder,
      },
      levels: rows.map((row) => {
        const state = byLevel.get(row.id);
        const unlocked = state?.unlockedAt || row.levelNumber === 1;
        const status = !unlocked
          ? 'locked'
          : state?.completedAt
            ? 'completed'
            : state?.active
              ? 'inProgress'
              : 'open';
        return {
          id: row.id,
          title: row.description ?? `Level ${row.levelNumber}`,
          order: row.levelNumber,
          status,
          latestScore: state?.latestScore ?? null,
          bestScore: state?.bestScore ?? null,
          latestStars: state?.latestStars ?? null,
          bestStars: state?.bestStars ?? null,
        };
      }),
    };
  }

  async progress(authorization?: string) {
    const studentId = await this.student(authorization);
    return this.progressForStudent(studentId);
  }

  async progressForStudent(studentId: string) {
    const { db } = getDatabase();
    const [totals] = await db
      .select({ totalLevels: count(), completedLevels: count(levelProgress.completedAt) })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .leftJoin(
        levelProgress,
        and(eq(levelProgress.levelId, levels.id), eq(levelProgress.studentId, studentId)),
      )
      .where(
        and(
          eq(levels.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
        ),
      );
    const [latest] = await db
      .select({ score: assessmentAttempts.score0To100 })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.status, 'GRADED'),
        ),
      )
      .orderBy(desc(assessmentAttempts.finishedAt), desc(assessmentAttempts.id))
      .limit(1);
    return {
      completedLevels: totals?.completedLevels ?? 0,
      totalLevels: totals?.totalLevels ?? 0,
      latestScore:
        latest?.score === null || latest?.score === undefined ? null : Number(latest.score),
    };
  }
}
