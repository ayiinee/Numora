import { Injectable, NotFoundException } from '@nestjs/common';
import {
  chapters,
  assessmentAttempts,
  getDatabase,
  levelProgress,
  levels,
  subchapters,
} from '@tka/database';
import { and, asc, desc, eq } from 'drizzle-orm';
import { ClassesService } from '../classes/classes.service';

@Injectable()
export class MonitoringService {
  constructor(private readonly classes: ClassesService) {}

  async studentProgress(authorization: string | undefined, classId: string, studentId: string) {
    const owned = await this.classes.students(authorization, classId);
    const student = owned.items.find((item) => item.id === studentId);
    if (!student)
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        detail: 'Student tidak ditemukan pada Class ini.',
      });
    const { db } = getDatabase();
    const published = await db
      .select({
        levelId: levels.id,
        levelLabel: levels.description,
        levelOrder: levels.levelNumber,
        subchapterLabel: subchapters.name,
        subchapterOrder: subchapters.displayOrder,
        chapterLabel: chapters.name,
        chapterOrder: chapters.displayOrder,
      })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(
        and(
          eq(levels.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
        ),
      )
      .orderBy(asc(chapters.displayOrder), asc(subchapters.displayOrder), asc(levels.levelNumber));
    const states = await db
      .select()
      .from(levelProgress)
      .where(eq(levelProgress.studentId, studentId));
    const active = await db
      .select({ levelId: assessmentAttempts.levelIdAtStart })
      .from(assessmentAttempts)
      .where(and(
        eq(assessmentAttempts.studentId, studentId),
        eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.purpose, 'REGULAR'),
        eq(assessmentAttempts.status, 'IN_PROGRESS'),
      ));
    const progressByLevel = new Map(states.map((row) => [row.levelId, row]));
    const activeLevelIds = new Set(active.flatMap((row) => row.levelId ? [row.levelId] : []));
    const [latest] = await db
      .select({ score: assessmentAttempts.score0To100 })
      .from(assessmentAttempts)
      .where(and(
        eq(assessmentAttempts.studentId, studentId),
        eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.purpose, 'REGULAR'),
        eq(assessmentAttempts.status, 'GRADED'),
      ))
      .orderBy(desc(assessmentAttempts.finishedAt), desc(assessmentAttempts.id))
      .limit(1);
    return {
      class: owned.class,
      student,
      latestDrillScore: latest?.score === null || latest?.score === undefined ? null : Number(latest.score),
      levels: published.map((level) => {
        const state = progressByLevel.get(level.levelId);
        return {
          levelId: level.levelId,
          chapterLabel: level.chapterLabel,
          subchapterLabel: level.subchapterLabel,
          levelLabel: level.levelLabel ?? `Level ${level.levelOrder}`,
          accessStatus: state?.unlockedAt || level.levelOrder === 1 ? 'UNLOCKED' : 'LOCKED',
          inProgress: activeLevelIds.has(level.levelId),
          latestDrillScore: state?.latestScore ?? null,
          bestDrillScore: state?.bestScore ?? null,
        };
      }),
    };
  }
}
