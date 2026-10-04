import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  assessmentAttempts,
  assessmentPackages,
  chapters,
  getDatabase,
  levels,
  subchapters,
} from '@tka/database';
import { and, desc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { TryoutReleaseService } from './tryout-release.service';

const problem = (code: string, detail: string) => ({ code, detail });
const PAGE_SIZE = 20;

interface AssessmentHistoryFilters {
  cursor?: string | undefined;
  classId?: string | undefined;
  levelId?: string | undefined;
}

@Injectable()
export class AssessmentHistoryService {
  constructor(
    private readonly identity: IdentityService,
    private readonly releases: TryoutReleaseService,
  ) {}

  async list(authorization: string | undefined, cursor?: string, levelId?: string) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student diperlukan.'));
    return this.listForStudent(user.id, { cursor, levelId });
  }

  async listForStudent(studentId: string, filters: AssessmentHistoryFilters = {}) {
    const { cursor, classId, levelId } = filters;
    const { db } = getDatabase();
    // A cursor must belong to the same visible result set as the requested page.
    const visible = and(
      eq(assessmentAttempts.studentId, studentId),
      eq(assessmentAttempts.purpose, 'REGULAR'),
      inArray(assessmentAttempts.assessmentType, ['PRETEST', 'DRILL', 'TRYOUT']),
      isNotNull(assessmentAttempts.finishedAt),
      or(
        eq(assessmentAttempts.status, 'GRADED'),
        and(
          eq(assessmentAttempts.assessmentType, 'TRYOUT'),
          eq(assessmentAttempts.status, 'SUBMITTED'),
        ),
      ),
      classId ? eq(assessmentAttempts.classIdAtStart, classId) : undefined,
      levelId ? eq(assessmentAttempts.levelIdAtStart, levelId) : undefined,
    );
    const [position] = cursor
      ? await db
          // Keep PostgreSQL microseconds: converting the boundary to Date loses precision.
          .select({
            id: assessmentAttempts.id,
            finishedAt: sql<string>`${assessmentAttempts.finishedAt}::text`,
          })
          .from(assessmentAttempts)
          .where(and(eq(assessmentAttempts.id, cursor), visible))
          .limit(1)
      : [];
    if (cursor && (!position || !position.finishedAt))
      throw new NotFoundException(problem('CURSOR_NOT_FOUND', 'Posisi riwayat tidak ditemukan.'));
    const cursorTime = position ? sql`${position.finishedAt}::timestamptz` : undefined;

    const rows = await db
      .select({
        id: assessmentAttempts.id,
        assessmentType: assessmentAttempts.assessmentType,
        packageId: assessmentAttempts.packageId,
        title: assessmentPackages.name,
        isDemo: assessmentPackages.isDemo,
        finishedAt: assessmentAttempts.finishedAt,
        score: assessmentAttempts.score0To100,
        status: assessmentAttempts.status,
        chapterId: assessmentAttempts.chapterIdAtStart,
        chapterTitle: chapters.name,
        levelId: assessmentAttempts.levelIdAtStart,
        levelTitle: sql<
          string | null
        >`coalesce(${levels.description}, 'Level ' || ${levels.levelNumber})`,
        subchapterId: subchapters.id,
        subchapterTitle: subchapters.name,
      })
      .from(assessmentAttempts)
      .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
      .leftJoin(chapters, eq(chapters.id, assessmentAttempts.chapterIdAtStart))
      .leftJoin(levels, eq(levels.id, assessmentAttempts.levelIdAtStart))
      .leftJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .where(
        and(
          visible,
          position && cursorTime
            ? or(
                lt(assessmentAttempts.finishedAt, cursorTime),
                and(
                  eq(assessmentAttempts.finishedAt, cursorTime),
                  lt(assessmentAttempts.id, position.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(assessmentAttempts.finishedAt), desc(assessmentAttempts.id))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const tryoutIds = [
      ...new Set(page.filter((row) => row.assessmentType === 'TRYOUT').map((row) => row.packageId)),
    ];
    const releasedPackages = await this.releases.releasedPackageIds(tryoutIds);
    return {
      records: page.map((row) => {
        const ready =
          row.assessmentType !== 'TRYOUT' ||
          (row.status === 'GRADED' && releasedPackages.has(row.packageId));
        return {
          attemptId: row.id,
          activity: row.assessmentType.toLowerCase() as 'drill' | 'pretest' | 'tryout',
          title: row.title,
          isDemo: row.isDemo,
          chapterId: row.chapterId,
          chapterTitle: row.chapterTitle,
          subchapterId: row.subchapterId,
          subchapterTitle: row.subchapterTitle,
          levelId: row.levelId,
          levelTitle: row.levelTitle,
          xpState:
            row.assessmentType === 'PRETEST' ? ('notApplicable' as const) : ('pending' as const),
          starsState:
            row.assessmentType === 'DRILL' ? ('pending' as const) : ('notApplicable' as const),
          submittedAt: row.finishedAt!.toISOString(),
          resultState: ready ? ('ready' as const) : ('waitingIrt' as const),
          score: ready && row.score !== null ? Number(row.score) : null,
        };
      }),
      nextCursor: rows.length > PAGE_SIZE ? page.at(-1)!.id : null,
    };
  }
}
