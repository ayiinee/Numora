import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  assessmentAttempts,
  assessmentPackages,
  classMemberships,
  classes,
  schools,
  getDatabase,
} from '@tka/database';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { LearningCatalogService } from './learning-catalog.service';
import { AssessmentHistoryService } from './assessment-history.service';
import type { StudentDashboardDto } from './student-dashboard.dto';

@Injectable()
export class StudentDashboardService {
  constructor(
    private readonly identity: IdentityService,
    private readonly catalog: LearningCatalogService,
    private readonly history: AssessmentHistoryService,
  ) {}

  async dashboard(authorization?: string): Promise<StudentDashboardDto> {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException({
        code: 'STUDENT_REQUIRED',
        detail: 'Akses Student diperlukan.',
      });
    const { db } = getDatabase();
    const [progress, history, memberships, best, active] = await Promise.all([
      this.catalog.progressForStudent(user.id),
      this.history.listForStudent(user.id),
      db
        .select({ id: classes.id, name: classes.name, schoolName: schools.name })
        .from(classMemberships)
        .innerJoin(classes, eq(classes.id, classMemberships.classId))
        .innerJoin(schools, eq(schools.id, classes.schoolId))
        .where(and(eq(classMemberships.studentUserId, user.id), isNull(classMemberships.leftAt)))
        .limit(1),
      db
        .select({ score: sql<string | null>`max(${assessmentAttempts.score0To100})` })
        .from(assessmentAttempts)
        .where(
          and(
            eq(assessmentAttempts.studentId, user.id),
            eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.purpose, 'REGULAR'),
            eq(assessmentAttempts.status, 'GRADED'),
          ),
        ),
      db
        .select({
          attemptId: assessmentAttempts.id,
          levelId: assessmentAttempts.levelIdAtStart,
          title: assessmentPackages.name,
        })
        .from(assessmentAttempts)
        .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
        .where(
          and(
            eq(assessmentAttempts.studentId, user.id),
            eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.purpose, 'REGULAR'),
            eq(assessmentAttempts.status, 'IN_PROGRESS'),
          ),
        )
        .orderBy(desc(assessmentAttempts.startedAt), desc(assessmentAttempts.id))
        .limit(1),
    ]);
    const membership = memberships[0] ?? null;
    return {
      displayName: user.displayName,
      affiliation: membership ? 'SCHOOL' : 'MANDIRI',
      class: membership,
      completedLevels: progress.completedLevels,
      availableLevels: progress.totalLevels,
      latestDrillScore: progress.latestScore,
      bestDrillScore: best[0]?.score == null ? null : Number(best[0].score),
      activities: history.records.slice(0, 5),
      activeDrill: active[0] ?? null,
      features: {
        drill: true,
        tryout: true,
        pretest: false,
        pvp: false,
        classLeaderboard: false,
        pendingPolicies: ['OPEN-02', 'OPEN-03', 'OPEN-07', 'OPEN-11'],
      },
    };
  }
}
