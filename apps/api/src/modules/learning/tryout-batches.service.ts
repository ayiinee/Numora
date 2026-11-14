import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  classes,
  classMemberships,
  getDatabase,
  schools,
  tryoutBatches,
  tryoutBatchPackages,
  tryoutSchoolDelegations,
  tryoutStudentAssignments,
  tryoutDistributionEligibility,
  users,
} from '@tka/database';
import { readApprovedPolicy } from '@tka/assessment-engine';
import { scoringPolicyVersions } from '@tka/database';
import { getIrtResearchDatabaseV1, tryoutDeliveryReadinessV1 } from '@tka/irt-orchestration';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import { TryoutReleaseService, tryoutResultState } from './tryout-release.service';
import type {
  UpdateTryoutDelegationsDto,
  ExtendTryoutBatchDto,
  SaveTryoutBatchDto,
  TryoutBatchDto,
  TryoutBatchQueryDto,
} from './tryout-batches.dto';

export function lockTryoutBatchSchedule(tx: AdminTransaction) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext('tryout-admin-batches'))`);
}

export function batchState(
  b: { adminPublishedAt: Date | null; cancelledAt: Date | null; startsAt: Date; closesAt: Date },
  now: Date,
) {
  return b.cancelledAt
    ? 'CANCELLED'
    : !b.adminPublishedAt
      ? 'DRAFT'
      : now < b.startsAt
        ? 'SCHEDULED'
        : now < b.closesAt
          ? 'OPEN'
          : 'CLOSED';
}
export function validateBatchInput(body: SaveTryoutBatchDto, now?: Date) {
  if (
    !body.title.trim() ||
    !Number.isFinite(Date.parse(body.startsAt)) ||
    !Number.isFinite(Date.parse(body.closesAt)) ||
    Date.parse(body.closesAt) <= Date.parse(body.startsAt)
  )
    throw new BadRequestException('Judul dan rentang waktu batch wajib valid.');
  if (now && Date.parse(body.startsAt) <= now.getTime())
    throw new BadRequestException('Waktu mulai batch harus di masa mendatang.');
  if (new Set(body.schools.map((s) => s.schoolId)).size !== body.schools.length)
    throw new BadRequestException('Sekolah hanya boleh memiliki satu delegasi.');
  const selected = new Set(body.packageIds);
  const delegated = [
    ...body.schools.map((s) => s.packageId),
    ...(body.mandiriPackageId ? [body.mandiriPackageId] : []),
  ];
  if (delegated.some((id) => !selected.has(id)))
    throw new BadRequestException('Paket delegasi harus termasuk paket batch.');
}

export function batchEditable(
  b: { adminPublishedAt: Date | null; cancelledAt: Date | null; startsAt: Date },
  now: Date,
) {
  return !b.cancelledAt && (!b.adminPublishedAt || now < b.startsAt);
}

export function validateBatchExtension(
  b: Parameters<typeof batchState>[0] & { status: string },
  closesAt: string,
  now: Date,
) {
  if (batchState(b, now) !== 'OPEN' || !['PLANNED', 'OPEN'].includes(b.status))
    throw new ConflictException(
      'Hanya batch yang sedang berjalan dan belum berakhir yang dapat diperpanjang.',
    );
  if (!Number.isFinite(Date.parse(closesAt)) || Date.parse(closesAt) <= b.closesAt.getTime())
    throw new BadRequestException('Waktu tutup baru harus lebih akhir dari waktu tutup saat ini.');
}

@Injectable()
export class TryoutBatchesService {
  async options(query: TryoutBatchQueryDto) {
    const db = getDatabase().db;
    const packageWhere = and(
      eq(assessmentPackages.assessmentType, 'TRYOUT'),
      query.familyCode ? eq(assessmentPackages.familyCode, query.familyCode) : undefined,
      query.search ? ilike(assessmentPackages.name, `%${query.search}%`) : undefined,
    );
    const schoolWhere = and(
      eq(schools.status, 'ACTIVE'),
      query.search ? ilike(schools.name, `%${query.search}%`) : undefined,
    );
    const [packages, delegated, packageCount, schoolCount] = await Promise.all([
      db
        .select({
          id: assessmentPackages.id,
          name: assessmentPackages.name,
          packageVersion: assessmentPackages.packageVersion,
          familyCode: assessmentPackages.familyCode,
          status: assessmentPackages.status,
          usedBatchCount:
            sql<number>`(select count(*) from tryout_batch_packages tbp where tbp.package_id = ${assessmentPackages.id})`.mapWith(
              Number,
            ),
          valid:
            sql<boolean>`${assessmentPackages.status} = 'PUBLISHED' and not ${assessmentPackages.isDemo}`.mapWith(
              Boolean,
            ),
        })
        .from(assessmentPackages)
        .where(packageWhere)
        .orderBy(asc(assessmentPackages.name), asc(assessmentPackages.id))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ schoolId: schools.id, schoolName: schools.name })
        .from(schools)
        .where(schoolWhere)
        .orderBy(asc(schools.name), asc(schools.id))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: count() }).from(assessmentPackages).where(packageWhere),
      db.select({ total: count() }).from(schools).where(schoolWhere),
    ]);
    return {
      packages,
      schools: delegated,
      packageTotal: packageCount[0]!.total,
      schoolTotal: schoolCount[0]!.total,
    };
  }
  async routingActive(tx: Pick<AdminTransaction, 'select'> = getDatabase().db) {
    const [row] = await tx
      .select({ id: tryoutBatches.id })
      .from(tryoutBatches)
      .where(and(isNotNull(tryoutBatches.adminTitle), isNotNull(tryoutBatches.adminPublishedAt)))
      .limit(1);
    return !!row;
  }
  async list(query: TryoutBatchQueryDto) {
    const db = getDatabase().db;
    const where = and(
      isNotNull(tryoutBatches.adminTitle),
      query.search ? ilike(tryoutBatches.adminTitle, `%${query.search}%`) : undefined,
    );
    const [rows, totals] = await Promise.all([
      db
        .select({ id: tryoutBatches.id })
        .from(tryoutBatches)
        .where(where)
        .orderBy(desc(tryoutBatches.startsAt), desc(tryoutBatches.id))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: count() }).from(tryoutBatches).where(where),
    ]);
    return {
      items: await Promise.all(rows.map((row) => this.detail(row.id))),
      total: totals[0]!.total,
    };
  }
  async detail(id: string): Promise<TryoutBatchDto> {
    let readiness = { resultState: 'BLOCKED', blockers: ['IRT_DELIVERY_DISABLED'] };
    if (
      process.env.NUMORA_IRT_DELIVERY_ENABLED === 'true' &&
      process.env.NUMORA_IRT_RESEARCH_ENABLED === 'true'
    )
      readiness = await tryoutDeliveryReadinessV1(getIrtResearchDatabaseV1(), id);
    return getDatabase().db.transaction(async (tx) => {
      const b = await this.batch(tx, id);
      const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
      const now = new Date(clock!.now);
      const packages = await tx
        .select({
          id: assessmentPackages.id,
          name: assessmentPackages.name,
          packageVersion: assessmentPackages.packageVersion,
          familyCode: assessmentPackages.familyCode,
          status: assessmentPackages.status,
          usedBatchCount:
            sql<number>`(select count(*) from tryout_batch_packages tbp where tbp.package_id = ${assessmentPackages.id})`.mapWith(
              Number,
            ),
          valid:
            sql<boolean>`${assessmentPackages.status} = 'PUBLISHED' and not ${assessmentPackages.isDemo}`.mapWith(
              Boolean,
            ),
        })
        .from(tryoutBatchPackages)
        .innerJoin(assessmentPackages, eq(assessmentPackages.id, tryoutBatchPackages.packageId))
        .where(eq(tryoutBatchPackages.batchId, id))
        .orderBy(
          sql`case when ${assessmentPackages.id} = ${b.packageId} then 0 else 1 end`,
          asc(assessmentPackages.name),
        );
      const delegated = await tx
        .select({
          schoolId: schools.id,
          schoolName: schools.name,
          packageId: tryoutSchoolDelegations.packageId,
        })
        .from(tryoutSchoolDelegations)
        .innerJoin(schools, eq(schools.id, tryoutSchoolDelegations.schoolId))
        .where(eq(tryoutSchoolDelegations.batchId, id))
        .orderBy(asc(schools.name));
      const participants = await tx
        .select({
          packageId: tryoutStudentAssignments.packageId,
          schoolId: tryoutStudentAssignments.schoolId,
          assigned: count(),
          completed: sql<number>`count(*) filter(where ${assessmentAttempts.status} in ('SUBMITTED','GRADED'))::int`,
        })
        .from(tryoutStudentAssignments)
        .innerJoin(
          assessmentAttempts,
          eq(assessmentAttempts.id, tryoutStudentAssignments.attemptId),
        )
        .where(eq(tryoutStudentAssignments.batchId, id))
        .groupBy(tryoutStudentAssignments.packageId, tryoutStudentAssignments.schoolId);
      return {
        id,
        title: b.adminTitle!,
        startsAt: b.startsAt.toISOString(),
        closesAt: b.closesAt.toISOString(),
        resultDueAt: b.resultDueAt.toISOString(),
        revision: b.configRevision,
        state: batchState(b, now),
        editable: batchEditable(b, now),
        delegationsEditable: ['DRAFT', 'SCHEDULED', 'OPEN'].includes(batchState(b, now)),
        extendable: batchState(b, now) === 'OPEN' && ['PLANNED', 'OPEN'].includes(b.status),
        mandiriPackageId: b.mandiriPackageId,
        packages,
        schools: delegated,
        participants,
        resultsState: readiness.resultState,
        resultBlockers: [
          ...readiness.blockers,
          ...(now > b.resultDueAt ? ['RESULT_DEADLINE_EXCEEDED'] : []),
        ],
      };
    });
  }
  async batch(tx: AdminTransaction, id: string, lock = false) {
    const query = tx
      .select()
      .from(tryoutBatches)
      .where(and(eq(tryoutBatches.id, id), isNotNull(tryoutBatches.adminTitle)));
    const [b] = lock ? await query.for('update') : await query;
    if (!b) throw new NotFoundException('Batch Tryout tidak ditemukan.');
    return b;
  }
  private async ready(tx: AdminTransaction, ids: string[]) {
    const rows = await tx
      .select({ p: assessmentPackages, eligible: tryoutDistributionEligibility().mapWith(Boolean) })
      .from(assessmentPackages)
      .where(inArray(assessmentPackages.id, ids))
      .for('share');
    if (
      rows.length !== ids.length ||
      rows.some(
        ({ p, eligible }) =>
          p.assessmentType !== 'TRYOUT' ||
          p.status !== 'PUBLISHED' ||
          p.isDemo ||
          !eligible ||
          p.durationSeconds !== 600,
      )
    )
      throw new BadRequestException(
        'Pilih paket Tryout non-demo yang sudah diterbitkan dan memenuhi syarat distribusi.',
      );
    for (const { p } of rows) {
      const [policy] = p.scoringPolicyVersionId
        ? await tx
            .select()
            .from(scoringPolicyVersions)
            .where(eq(scoringPolicyVersions.id, p.scoringPolicyVersionId))
        : [];
      try {
        if (!policy) throw Error();
        readApprovedPolicy(policy, 'TRYOUT');
      } catch {
        throw new BadRequestException(`Policy penilaian paket ${p.name} belum sah.`);
      }
    }
  }
  private async validatePublished(tx: AdminTransaction, id: string, body: SaveTryoutBatchDto) {
    await this.validateSchools(tx, body.schools);
    const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    if (new Date(body.startsAt) <= new Date(clock!.now))
      throw new BadRequestException('Waktu mulai batch harus di masa mendatang.');
    await this.validateSchedule(tx, id, body.startsAt, body.closesAt);
    await this.ready(tx, body.packageIds);
    const selected = await tx
      .select({ familyCode: assessmentPackages.familyCode })
      .from(assessmentPackages)
      .where(inArray(assessmentPackages.id, body.packageIds));
    if (new Set(selected.map((p) => p.familyCode)).size > 1)
      throw new BadRequestException(
        'Semua paket dalam batch harus memiliki parent code yang sama agar anchor IRT seimbang.',
      );
  }
  private async validateSchedule(
    tx: AdminTransaction,
    id: string,
    startsAt: string,
    closesAt: string,
  ) {
    const overlap = await tx
      .select({ id: tryoutBatches.id })
      .from(tryoutBatches)
      .where(
        and(
          isNotNull(tryoutBatches.adminPublishedAt),
          isNull(tryoutBatches.cancelledAt),
          sql`${tryoutBatches.id} <> ${id}`,
          sql`${tryoutBatches.startsAt} < ${closesAt}::timestamptz and ${tryoutBatches.closesAt} > ${startsAt}::timestamptz`,
        ),
      )
      .limit(1);
    if (overlap.length)
      throw new ConflictException('Jadwal bertabrakan dengan batch yang sudah diterbitkan.');
  }
  extend(actor: string, id: string, body: ExtendTryoutBatchDto) {
    const audit = { ...body, previousClosesAt: '' };
    return adminMutation(
      actor,
      'tryout_batch_extended',
      'tryout_batch',
      async (tx) => {
        await lockTryoutBatchSchedule(tx);
        const b = await this.batch(tx, id, true);
        const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
        if (body.expectedRevision !== b.configRevision)
          throw new ConflictException('Batch berubah. Muat ulang sebelum menyimpan.');
        validateBatchExtension(b, body.closesAt, new Date(clock!.now));
        await this.validateSchedule(tx, id, b.startsAt.toISOString(), body.closesAt);
        audit.previousClosesAt = b.closesAt.toISOString();
        await tx
          .update(tryoutBatches)
          .set({
            closesAt: new Date(body.closesAt),
            cutoffAt: new Date(body.closesAt),
            resultDueAt: new Date(Date.parse(body.closesAt) + 72 * 3600000),
            configRevision: b.configRevision + 1,
          })
          .where(eq(tryoutBatches.id, id));
        return { id };
      },
      audit,
    );
  }
  async save(actor: string, body: SaveTryoutBatchDto, id?: string) {
    validateBatchInput(body);
    return adminMutation(
      actor,
      id ? 'tryout_batch_updated' : 'tryout_batch_created',
      'tryout_batch',
      async (tx) => {
        await lockTryoutBatchSchedule(tx);
        const old = id ? await this.batch(tx, id, true) : null;
        if (old) await this.mutable(tx, old, body.expectedRevision);
        const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
        validateBatchInput(body, new Date(clock!.now));
        if (old?.adminPublishedAt) await this.validatePublished(tx, old.id, body);
        const packs = await tx
          .select({ id: assessmentPackages.id })
          .from(assessmentPackages)
          .where(
            and(
              inArray(assessmentPackages.id, body.packageIds),
              eq(assessmentPackages.assessmentType, 'TRYOUT'),
            ),
          );
        if (packs.length !== body.packageIds.length)
          throw new BadRequestException('Paket Tryout tidak ditemukan.');
        if (!old?.adminPublishedAt) await this.validateSchools(tx, body.schools);
        const values = {
          adminTitle: body.title.trim(),
          packageId: body.packageIds[0]!,
          startsAt: new Date(body.startsAt),
          closesAt: new Date(body.closesAt),
          cutoffAt: new Date(body.closesAt),
          resultDueAt: new Date(Date.parse(body.closesAt) + 72 * 3600000),
          mandiriPackageId: body.mandiriPackageId ?? null,
        };
        const [row] = old
          ? await tx
              .update(tryoutBatches)
              .set({ ...values, configRevision: old.configRevision + 1 })
              .where(eq(tryoutBatches.id, old.id))
              .returning()
          : await tx.insert(tryoutBatches).values(values).returning();
        const batchId = row!.id;
        await tx
          .delete(tryoutSchoolDelegations)
          .where(eq(tryoutSchoolDelegations.batchId, batchId));
        await tx.delete(tryoutBatchPackages).where(eq(tryoutBatchPackages.batchId, batchId));
        await tx
          .insert(tryoutBatchPackages)
          .values(body.packageIds.map((packageId) => ({ batchId, packageId })));
        if (body.schools.length)
          await tx
            .insert(tryoutSchoolDelegations)
            .values(body.schools.map((s) => ({ ...s, batchId })));
        return { id: batchId };
      },
      { configuration: body, allocationMethod: 'ADMIN_DELEGATION' },
    );
  }
  updateDelegations(actor: string, id: string, body: UpdateTryoutDelegationsDto) {
    return adminMutation(
      actor,
      'tryout_batch_delegations_updated',
      'tryout_batch',
      async (tx) => {
        const b = await this.batch(tx, id, true);
        const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
        if (!['DRAFT', 'SCHEDULED', 'OPEN'].includes(batchState(b, new Date(clock!.now))))
          throw new ConflictException('Penerima hanya dapat diubah sebelum batch berakhir.');
        if (body.expectedRevision !== b.configRevision)
          throw new ConflictException('Batch berubah. Muat ulang sebelum menyimpan.');
        const packages = await tx
          .select()
          .from(tryoutBatchPackages)
          .where(eq(tryoutBatchPackages.batchId, id));
        validateBatchInput({
          title: b.adminTitle!,
          startsAt: b.startsAt.toISOString(),
          closesAt: b.closesAt.toISOString(),
          packageIds: packages.map((p) => p.packageId),
          ...body,
        });
        await this.validateSchools(tx, body.schools);
        await tx.delete(tryoutSchoolDelegations).where(eq(tryoutSchoolDelegations.batchId, id));
        if (body.schools.length)
          await tx
            .insert(tryoutSchoolDelegations)
            .values(body.schools.map((s) => ({ ...s, batchId: id })));
        await tx
          .update(tryoutBatches)
          .set({
            mandiriPackageId: body.mandiriPackageId ?? null,
            configRevision: b.configRevision + 1,
          })
          .where(eq(tryoutBatches.id, id));
        return { id };
      },
      { configuration: body, appliesTo: 'NEW_STARTS_ONLY' },
    );
  }
  private async validateSchools(tx: AdminTransaction, delegated: SaveTryoutBatchDto['schools']) {
    if (!delegated.length) return;
    const valid = await tx
      .select({ id: schools.id })
      .from(schools)
      .where(
        and(
          inArray(
            schools.id,
            delegated.map((s) => s.schoolId),
          ),
          eq(schools.status, 'ACTIVE'),
        ),
      )
      .for('share');
    if (valid.length !== delegated.length)
      throw new BadRequestException('Sekolah delegasi tidak aktif atau tidak ditemukan.');
  }
  private async mutable(
    tx: AdminTransaction,
    b: typeof tryoutBatches.$inferSelect,
    revision?: number,
  ) {
    const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    if (!batchEditable(b, new Date(clock!.now)))
      throw new ConflictException('Konfigurasi batch sudah dikunci.');
    if (revision !== b.configRevision)
      throw new ConflictException('Batch berubah. Muat ulang sebelum menyimpan.');
  }
  publish(actor: string, id: string, revision: number) {
    return adminMutation(actor, 'tryout_batch_published', 'tryout_batch', async (tx) => {
      await lockTryoutBatchSchedule(tx);
      const b = await this.batch(tx, id, true);
      await this.mutable(tx, b, revision);
      if (b.adminPublishedAt) return { id };
      const packages = await tx
        .select()
        .from(tryoutBatchPackages)
        .where(eq(tryoutBatchPackages.batchId, id));
      const delegated = await tx
        .select()
        .from(tryoutSchoolDelegations)
        .where(eq(tryoutSchoolDelegations.batchId, id));
      await this.validatePublished(tx, id, {
        title: b.adminTitle!,
        startsAt: b.startsAt.toISOString(),
        closesAt: b.closesAt.toISOString(),
        packageIds: packages.map((p) => p.packageId),
        mandiriPackageId: b.mandiriPackageId,
        schools: delegated,
      });
      await tx
        .update(tryoutBatches)
        .set({ adminPublishedAt: sql`clock_timestamp()`, configRevision: b.configRevision + 1 })
        .where(eq(tryoutBatches.id, id));
      return { id };
    });
  }
  cancel(actor: string, id: string, revision: number, reason: string) {
    if (!reason.trim()) throw new BadRequestException('Alasan pembatalan wajib diisi.');
    return adminMutation(
      actor,
      'tryout_batch_cancelled',
      'tryout_batch',
      async (tx) => {
        const b = await this.batch(tx, id, true);
        await this.mutable(tx, b, revision);
        await tx
          .update(tryoutBatches)
          .set({
            cancelledAt: sql`clock_timestamp()`,
            cancellationReason: reason.trim(),
            configRevision: b.configRevision + 1,
          })
          .where(eq(tryoutBatches.id, id));
        return { id };
      },
      { reason: reason.trim() },
    );
  }
  async studentSchools(tx: AdminTransaction, studentId: string) {
    return tx
      .selectDistinct({
        schoolId: classes.schoolId,
        schoolName: schools.name,
        classId: classes.id,
        schoolActive: sql<boolean>`${schools.status} = 'ACTIVE'`.mapWith(Boolean),
      })
      .from(classMemberships)
      .innerJoin(classes, eq(classes.id, classMemberships.classId))
      .innerJoin(schools, eq(schools.id, classes.schoolId))
      .where(
        and(
          eq(classMemberships.studentUserId, studentId),
          isNull(classMemberships.leftAt),
          isNull(classes.archivedAt),
        ),
      )
      .orderBy(asc(classes.id));
  }
  async studentList(studentId: string, releases = new TryoutReleaseService()) {
    return getDatabase().db.transaction(async (tx) => {
      const memberships = await this.studentSchools(tx, studentId);
      const batches = await tx
        .select()
        .from(tryoutBatches)
        .where(
          and(
            isNotNull(tryoutBatches.adminTitle),
            isNotNull(tryoutBatches.adminPublishedAt),
            isNull(tryoutBatches.cancelledAt),
          ),
        )
        .orderBy(desc(tryoutBatches.startsAt));
      const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
      const now = new Date(clock!.now);
      const attempts = await tx
        .select({
          id: assessmentAttempts.id,
          packageId: assessmentAttempts.packageId,
          batchId: assessmentAttempts.tryoutBatchId,
          status: assessmentAttempts.status,
          deadlineAt: assessmentAttempts.deadlineAt,
          isDemo: assessmentPackages.isDemo,
        })
        .from(assessmentAttempts)
        .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
        .where(and(eq(assessmentAttempts.studentId, studentId), isNotNull(assessmentAttempts.tryoutBatchId)));
      const byBatch = new Map(attempts.map((attempt) => [attempt.batchId, attempt]));
      const { ready } = await releases.studentPublications(attempts, now, tx);
      const items = [];
      for (const b of batches) {
        const attempt = byBatch.get(b.id);
        const delegated = [
          ...new Map(
            memberships
              .filter((m) => m.schoolActive)
              .map((m) => [m.schoolId, { schoolId: m.schoolId, schoolName: m.schoolName }]),
          ).values(),
        ];
        const mandiri = !memberships.length && !!b.mandiriPackageId;
        if (!attempt && !mandiri && !delegated.length) continue;
        items.push({
          id: b.id,
          title: b.adminTitle!,
          startsAt: b.startsAt.toISOString(),
          closesAt: b.closesAt.toISOString(),
          resultDueAt: b.resultDueAt.toISOString(),
          state: batchState(b, now),
          schools: delegated,
          mandiri,
          attemptId: attempt?.id ?? null,
          attemptStatus: attempt?.status ?? null,
          resultState: tryoutResultState(attempt?.status, !!attempt && ready.has(attempt.id), b.resultDueAt, now),
          canResume: attempt?.status === 'IN_PROGRESS' && now < b.closesAt &&
            !!attempt.deadlineAt && now < attempt.deadlineAt,
        });
      }
      return { routingActive: await this.routingActive(tx), items };
    });
  }
  async selectForStart(
    tx: AdminTransaction,
    studentId: string,
    batchId: string,
    schoolId?: string,
  ) {
    // Same account lock as join/leave: membership cannot change during assignment.
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, studentId))
      .for('no key update');
    const b = await this.batch(tx, batchId, true);
    const [existing] = await tx
      .select({ id: assessmentAttempts.id })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.tryoutBatchId, batchId),
          eq(assessmentAttempts.studentId, studentId),
        ),
      );
    if (existing)
      return {
        existingId: existing.id,
        batch: b,
        packageId: b.packageId,
        classId: null,
        schoolId: null,
      };
    const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    if (batchState(b, new Date(clock!.now)) !== 'OPEN')
      throw new ConflictException('Batch belum dimulai atau sudah ditutup.');
    const memberships = await this.studentSchools(tx, studentId);
    let packageId: string | null = null;
    let contextSchool: string | null = null;
    if (!memberships.length) {
      if (schoolId) throw new BadRequestException('Sekolah tidak sesuai keanggotaan siswa.');
      packageId = b.mandiriPackageId;
    } else {
      const eligible = [
        ...new Map(memberships.filter((m) => m.schoolActive).map((m) => [m.schoolId, m])).values(),
      ];
      const selected = schoolId
        ? eligible.find((m) => m.schoolId === schoolId)
        : eligible.length === 1
          ? eligible[0]
          : undefined;
      if (!selected) throw new BadRequestException('Pilih sekolah sesuai keanggotaan aktif.');
      const [delegation] = await tx
        .select()
        .from(tryoutSchoolDelegations)
        .where(
          and(
            eq(tryoutSchoolDelegations.batchId, batchId),
            eq(tryoutSchoolDelegations.schoolId, selected.schoolId),
          ),
        );
      packageId = delegation?.packageId ?? b.packageId;
      contextSchool = selected.schoolId;
    }
    if (!packageId) throw new BadRequestException('Batch tidak tersedia untuk kelompok siswa ini.');
    await this.ready(tx, [packageId]);
    return {
      existingId: null,
      batch: b,
      packageId,
      schoolId: contextSchool,
      classId: memberships.find((m) => m.schoolId === contextSchool)?.classId ?? null,
    };
  }
}
