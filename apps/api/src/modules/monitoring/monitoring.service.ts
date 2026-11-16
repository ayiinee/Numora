import { Injectable, NotFoundException } from '@nestjs/common';
import {
  chapters,
  assessmentAttempts,
  getDatabase,
  levelProgress,
  levels,
  subchapters,
} from '@tka/database';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { ClassesService } from '../classes/classes.service';

@Injectable()
export class MonitoringService {
  constructor(private readonly classes: ClassesService) {}

  async studentProgress(authorization: string | undefined, classId: string, studentId: string) {
    const owned = await this.classes.students(authorization, classId, studentId);
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
        unlockedAt: levelProgress.unlockedAt,
        latestScore: levelProgress.latestScore,
        bestScore: levelProgress.bestScore,
        inProgress: sql<boolean>`exists(
          select 1 from public.assessment_attempts a
          where a.student_id = ${studentId} and a.level_id_at_start = ${levels.id}
            and a.assessment_type = 'DRILL' and a.purpose = 'REGULAR' and a.status = 'IN_PROGRESS'
        )`,
      })
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
      )
      .orderBy(asc(chapters.displayOrder), asc(subchapters.displayOrder), asc(levels.levelNumber));
    const [latest] = await db
      .select({ score: assessmentAttempts.score0To100 })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.purpose, 'REGULAR'),
          eq(assessmentAttempts.status, 'GRADED'),
        ),
      )
      .orderBy(desc(assessmentAttempts.finishedAt), desc(assessmentAttempts.id))
      .limit(1);
    return {
      class: owned.class,
      student,
      latestDrillScore:
        latest?.score === null || latest?.score === undefined ? null : Number(latest.score),
      levels: published.map((level) => {
        return {
          levelId: level.levelId,
          chapterLabel: level.chapterLabel,
          subchapterLabel: level.subchapterLabel,
          levelLabel: level.levelLabel ?? `Level ${level.levelOrder}`,
          accessStatus: level.unlockedAt || level.levelOrder === 1 ? 'UNLOCKED' : 'LOCKED',
          inProgress: level.inProgress,
          latestDrillScore: level.latestScore ?? null,
          bestDrillScore: level.bestScore ?? null,
        };
      }),
    };
  }
}
