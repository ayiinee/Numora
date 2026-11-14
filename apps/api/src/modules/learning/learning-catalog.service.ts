import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  assessmentAttempts,
  chapters,
  getDatabase,
  levelProgress,
  levels,
  subchapters,
} from '@tka/database';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';

const problem = (code: string, detail: string) => ({ code, detail });

@Injectable()
export class LearningCatalogService {
  constructor(private readonly identity: IdentityService) {}

  private async student(authorization?: string) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student diperlukan.'));
    return user.id;
  }

  async catalog(authorization?: string) {
    await this.student(authorization);
    const { db } = getDatabase();
    const rows = await db
      .select({
        id: chapters.id,
        slug: chapters.slug,
        name: chapters.name,
        displayOrder: chapters.displayOrder,
      })
      .from(chapters)
      .where(eq(chapters.status, 'READY'))
      .orderBy(asc(chapters.displayOrder));
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
    const { db } = getDatabase();
    const [chapter] = await db
      .select({
        id: chapters.id,
        slug: chapters.slug,
        name: chapters.name,
        displayOrder: chapters.displayOrder,
      })
      .from(chapters)
      .where(and(eq(chapters.id, chapterId), eq(chapters.status, 'READY')))
      .limit(1);
    if (!chapter) throw new NotFoundException(problem('CHAPTER_NOT_FOUND', 'Bab tidak ditemukan.'));
    const children = await db
      .select({
        id: subchapters.id,
        slug: subchapters.slug,
        chapterId: subchapters.chapterId,
        name: subchapters.name,
        displayOrder: subchapters.displayOrder,
      })
      .from(subchapters)
      .where(and(eq(subchapters.chapterId, chapterId), eq(subchapters.status, 'READY')))
      .orderBy(asc(subchapters.displayOrder));
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
    const [subchapter] = await db
      .select({
        id: subchapters.id,
        slug: subchapters.slug,
        chapterId: subchapters.chapterId,
        title: subchapters.name,
        sortOrder: subchapters.displayOrder,
      })
      .from(subchapters)
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(
        and(
          eq(subchapters.id, subchapterId),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
        ),
      )
      .limit(1);
    if (!subchapter)
      throw new NotFoundException(problem('SUBCHAPTER_NOT_FOUND', 'Subbab tidak ditemukan.'));
    const rows = await db
      .select({ id: levels.id, levelNumber: levels.levelNumber, description: levels.description })
      .from(levels)
      .where(and(eq(levels.subchapterId, subchapterId), eq(levels.status, 'READY')))
      .orderBy(asc(levels.levelNumber));
    const levelIds = rows.map((row) => row.id);
    const progress = levelIds.length
      ? await db
          .select({
            levelId: levelProgress.levelId,
            unlockedAt: levelProgress.unlockedAt,
            completedAt: levelProgress.completedAt,
            latestScore: levelProgress.latestScore,
            bestScore: levelProgress.bestScore,
            latestStars: levelProgress.latestStars,
            bestStars: levelProgress.bestStars,
          })
          .from(levelProgress)
          .where(
            and(eq(levelProgress.studentId, studentId), inArray(levelProgress.levelId, levelIds)),
          )
      : [];
    const attempts = levelIds.length
      ? await db
          .select({ levelId: assessmentAttempts.levelIdAtStart })
          .from(assessmentAttempts)
          .where(
            and(
              eq(assessmentAttempts.studentId, studentId),
              eq(assessmentAttempts.assessmentType, 'DRILL'),
              eq(assessmentAttempts.status, 'IN_PROGRESS'),
              inArray(assessmentAttempts.levelIdAtStart, levelIds),
            ),
          )
      : [];
    const byLevel = new Map(progress.map((row) => [row.levelId, row]));
    const active = new Set(attempts.flatMap((row) => (row.levelId ? [row.levelId] : [])));
    return {
      subchapter: {
        id: subchapter.id,
        slug: subchapter.slug,
        chapterId: subchapter.chapterId,
        title: subchapter.title,
        order: subchapter.sortOrder,
      },
      levels: rows.map((row) => {
        const state = byLevel.get(row.id);
        const unlocked = state?.unlockedAt || row.levelNumber === 1;
        const status = !unlocked
          ? 'locked'
          : state?.completedAt
            ? 'completed'
            : active.has(row.id)
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
