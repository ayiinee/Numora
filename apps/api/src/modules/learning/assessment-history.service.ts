import { presentFixtureText } from '@tka/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  assessmentAttempts,
  assessmentPackages,
  tryoutBatches,
  chapters,
  getDatabase,
  levels,
  subchapters,
  xpLedger,
} from '@tka/database';
import { and, desc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { TryoutReleaseService, tryoutResultState } from './tryout-release.service';

const problem = (code: string, detail: string) => ({ code, detail });
const PAGE_SIZE = 20;

interface AssessmentHistoryFilters {
  cursor?: string | undefined;
  classId?: string | undefined;
  levelId?: string | undefined;
  activity?: 'tryout' | undefined;
}

@Injectable()
export class AssessmentHistoryService {
  constructor(
    private readonly identity: IdentityService,
    private readonly releases: TryoutReleaseService,
  ) {}

  async list(authorization: string | undefined, cursor?: string, levelId?: string, activity?: 'tryout') {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student diperlukan.'));
    return this.listForStudent(user.id, { cursor, levelId, activity });
  }

  async listForStudent(studentId: string, filters: AssessmentHistoryFilters = {}) {
    const { cursor, classId, levelId, activity } = filters;
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
      activity === 'tryout' ? eq(assessmentAttempts.assessmentType, 'TRYOUT') : undefined,
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
        title: sql<string>`coalesce(${tryoutBatches.adminTitle}, ${assessmentPackages.name})`,
        isDemo: assessmentPackages.isDemo,
        finishedAt: assessmentAttempts.finishedAt,
        score: assessmentAttempts.score0To100,
        stars: assessmentAttempts.stars,
        drillPolicyVersion: assessmentAttempts.drillPolicyVersion,
        xp: xpLedger.xpAmount,
        tryoutXpPolicyVersion: assessmentAttempts.tryoutXpPolicyVersion,
        status: assessmentAttempts.status,
        resultDueAt: sql<Date | null>`coalesce(${tryoutBatches.resultDueAt}, ${assessmentPackages.closeAt} + interval '72 hours')`.mapWith(
          (value) => value == null ? null : new Date(value)),
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
      .leftJoin(tryoutBatches, eq(tryoutBatches.id, assessmentAttempts.tryoutBatchId))
      .leftJoin(xpLedger, eq(xpLedger.attemptId, assessmentAttempts.id))
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
    const [clock] = await db.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    const now = new Date(clock!.now);
    const { ready: publishedIds, canonical: published } = await this.releases.studentPublications(
      page.filter((row) => row.assessmentType === 'TRYOUT'), now);
    return {
      records: page.map((row) => {
        const ready = row.assessmentType !== 'TRYOUT' || publishedIds.has(row.id);
        const publication = published.get(row.id);
        return {
          attemptId: row.id,
          activity: row.assessmentType.toLowerCase() as 'drill' | 'pretest' | 'tryout',
          title: presentFixtureText(row.packageId, 'name', row.title),
          isDemo: row.isDemo,
          chapterId: row.chapterId,
          chapterTitle: row.chapterTitle,
          subchapterId: row.subchapterId,
          subchapterTitle: row.subchapterTitle,
          levelId: row.levelId,
          levelTitle: row.levelTitle,
          xpState:
            row.assessmentType === 'PRETEST'
              ? ('notApplicable' as const)
              : row.xp !== null
                ? ('ready' as const)
                : row.assessmentType === 'TRYOUT' && row.status !== 'GRADED'
                  ? ('pending' as const)
                  : ('legacy' as const),
          starsState:
            row.assessmentType === 'DRILL'
              ? row.stars !== null
                ? ('ready' as const)
                : ('legacy' as const)
              : ('notApplicable' as const),
          xp: row.assessmentType !== 'PRETEST' ? row.xp : null,
          stars: row.assessmentType === 'DRILL' ? row.stars : null,
          drillPolicyVersion: row.drillPolicyVersion,
          tryoutXpPolicyVersion: row.tryoutXpPolicyVersion,
          submittedAt: row.finishedAt!.toISOString(),
          resultState: ready ? ('ready' as const) : ('waitingIrt' as const),
          ...(row.assessmentType === 'TRYOUT' && {
            tryoutResultState: tryoutResultState(row.status, ready, row.resultDueAt, now) ?? 'waiting',
          }),
          score: ready
            ? row.assessmentType === 'TRYOUT'
              ? publication ? publication.score
                : row.isDemo && row.score !== null ? Number(row.score) : null
              : row.score !== null
                ? Number(row.score)
                : null
            : null,
        };
      }),
      nextCursor: rows.length > PAGE_SIZE ? page.at(-1)!.id : null,
    };
  }
}
