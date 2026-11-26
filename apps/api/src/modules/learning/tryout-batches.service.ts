import { randomInt } from 'node:crypto';
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
  packageItems,
  questionVersions,
  classes,
  classStudentBans,
  classMemberships,
  getDatabase,
  schools,
  tryoutBatches,
  tryoutWaves,
  tryoutWavePackages,
  tryoutAllocationPools,
  tryoutPoolPackages,
  tryoutTechnicalIssues,
  tryoutWaveClaims,
  tryoutBatchPackages,
  tryoutSchoolDelegations,
  tryoutStudentAssignments,
  tryoutDistributionEligibility,
  users,
  TRYOUT_DURATION_SECONDS,
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
  if (now && Date.parse(body.closesAt) <= now.getTime())
    throw new BadRequestException('Waktu tutup batch harus di masa mendatang.');
  if (
    !body.packageIds.length ||
    body.packageIds.length > 5 ||
    new Set(body.packageIds).size !== body.packageIds.length
  )
    throw new BadRequestException('Pilih 1-5 paket unik.');
  if (new Set(body.schools.map((s) => s.schoolId)).size !== body.schools.length)
    throw new BadRequestException('Sekolah hanya boleh memiliki satu delegasi.');
  const selected = new Set(body.packageIds);
  for (const target of [...body.schools.map((s) => schoolPackages(s)), mandiriPackages(body)]) {
    if (
      target.length > 5 ||
      new Set(target).size !== target.length ||
      target.some((id) => !selected.has(id))
    )
      throw new BadRequestException(
        'Paket target harus subset unik dari paket batch (maksimal 5).',
      );
  }
  if (body.schools.some((s) => schoolPackages(s).length === 0))
    throw new BadRequestException('Sekolah wajib memiliki minimal satu paket.');
}

export function schoolPackages(s: SaveTryoutBatchDto['schools'][number]): string[] {
  if (
    !s.packageIds &&
    ((s.allocationMode === 'BALANCED_50_50' &&
      (!s.variantPackageId || s.variantPackageId === s.packageId)) ||
      (s.allocationMode !== 'BALANCED_50_50' && s.variantPackageId))
  )
    throw new BadRequestException('Konfigurasi paket lama tidak valid.');
  const legacy = s.packageId
    ? [
        s.packageId,
        ...(s.allocationMode === 'BALANCED_50_50' && s.variantPackageId
          ? [s.variantPackageId]
          : []),
      ]
    : [];
  if (
    s.packageIds &&
    legacy.length &&
    (legacy.length !== s.packageIds.length || legacy.some((id) => !s.packageIds!.includes(id)))
  )
    throw new BadRequestException('Konfigurasi paket sekolah lama dan baru bertentangan.');
  return s.packageIds ?? legacy;
}
export function mandiriPackages(body: {
  mandiriPackageId?: string | null;
  mandiriPackageIds?: string[];
}): string[] {
  if (
    body.mandiriPackageIds &&
    body.mandiriPackageId &&
    !body.mandiriPackageIds.includes(body.mandiriPackageId)
  )
    throw new BadRequestException('Konfigurasi Mandiri lama dan baru bertentangan.');
  return body.mandiriPackageIds ?? (body.mandiriPackageId ? [body.mandiriPackageId] : []);
}
export function balancedPoolPackage(counts: { packageId: string; n: number }[]): string {
  if (!counts.length || counts.some((c) => !Number.isSafeInteger(c.n) || c.n < 0))
    throw new BadRequestException('Pool alokasi tidak valid.');
  const smallest = Math.min(...counts.map((c) => c.n));
  const tied = counts.filter((c) => c.n === smallest);
  return tied[randomInt(tied.length)]!.packageId;
}

export function waveClaimBlocksSchool(claimSchoolId: string | null, schoolId: string | null) {
  return schoolId === null || claimSchoolId === null || claimSchoolId === schoolId;
}

export function balancedPackageForCounts(
  original: number,
  variant: number,
  originalId: string,
  variantId: string,
) {
  if (
    ![original, variant].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    !originalId ||
    !variantId ||
    originalId === variantId
  )
    throw new BadRequestException('Jumlah assignment atau paket balanced tidak valid.');
  return original < variant || (original === variant && randomInt(2) === 0)
    ? originalId
    : variantId;
}

export function batchEditable(
  b: { adminPublishedAt: Date | null; cancelledAt: Date | null; startsAt: Date },
  now: Date,
) {
  return !b.cancelledAt && (!b.adminPublishedAt || now < b.startsAt);
}

export function batchStoppable(
  b: Parameters<typeof batchState>[0] & { status: string },
  now: Date,
) {
  return batchState(b, now) === 'OPEN' && ['PLANNED', 'OPEN'].includes(b.status);
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
          valid: sql<boolean>`${tryoutDistributionEligibility()}`.mapWith(Boolean),
        })
        .from(assessmentPackages)
        .where(packageWhere)
        .orderBy(asc(assessmentPackages.name), asc(assessmentPackages.id))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ schoolId: schools.id, schoolName: schools.name, schoolCode: schools.code })
        .from(schools)
        .where(schoolWhere)
        .orderBy(asc(schools.name), asc(schools.id))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: count() }).from(assessmentPackages).where(packageWhere),
      db.select({ total: count() }).from(schools).where(schoolWhere),
    ]);
    const packageOptions = await Promise.all(
      packages.map(async (p) => {
        const blockers = (await tryoutTechnicalIssues(db, p.id)).map(
          (i) => `${i.questionNumber ? `Soal ${i.questionNumber}: ` : ''}${i.message}`,
        );
        if (!p.valid) blockers.push('Paket harus terbit, non-demo dan lengkap.');
        if (p.valid) {
          try {
            await this.ready(db, [p.id]);
          } catch (error) {
            blockers.push(error instanceof Error ? error.message : 'Scoring belum siap.');
          }
        }
        return { ...p, valid: !blockers.length, blockers };
      }),
    );
    const waves = await db
      .select()
      .from(tryoutWaves)
      .orderBy(desc(tryoutWaves.createdAt))
      .limit(1000);
    const waveLinks = await db.select().from(tryoutWavePackages);
    const wavePackageIds = [...new Set(waveLinks.map((w) => w.packageId))];
    const wavePackages = wavePackageIds.length
      ? await db
          .select({
            p: assessmentPackages,
            valid: tryoutDistributionEligibility().mapWith(Boolean),
            usedBatchCount:
              sql<number>`(select count(*) from tryout_batch_packages tbp where tbp.package_id = ${assessmentPackages.id})`.mapWith(
                Number,
              ),
          })
          .from(assessmentPackages)
          .where(inArray(assessmentPackages.id, wavePackageIds))
      : [];
    return {
      packages: packageOptions,
      waves: waves.map((w) => ({
        ...w,
        packages: wavePackages
          .filter(({ p }) => waveLinks.some((l) => l.waveId === w.id && l.packageId === p.id))
          .map(({ p, usedBatchCount, valid }) => ({
            id: p.id,
            name: p.name,
            packageVersion: p.packageVersion,
            familyCode: p.familyCode,
            status: p.status,
            usedBatchCount,
            valid,
          })),
      })),
      schools: delegated,
      packageTotal: packageCount[0]!.total,
      schoolTotal: schoolCount[0]!.total,
    };
  }
  private pools(tx: Pick<AdminTransaction, 'select'>, batchId: string) {
    return tx
      .select({
        poolId: tryoutAllocationPools.id,
        schoolId: tryoutAllocationPools.schoolId,
        packageId: tryoutPoolPackages.packageId,
      })
      .from(tryoutAllocationPools)
      .innerJoin(tryoutPoolPackages, eq(tryoutPoolPackages.poolId, tryoutAllocationPools.id))
      .where(eq(tryoutAllocationPools.batchId, batchId));
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
          valid: sql<boolean>`${tryoutDistributionEligibility()}`.mapWith(Boolean),
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
          schoolCode: schools.code,
          packageId: tryoutSchoolDelegations.packageId,
          allocationMode: tryoutSchoolDelegations.allocationMode,
          variantPackageId: tryoutSchoolDelegations.variantPackageId,
        })
        .from(tryoutSchoolDelegations)
        .innerJoin(schools, eq(schools.id, tryoutSchoolDelegations.schoolId))
        .where(eq(tryoutSchoolDelegations.batchId, id))
        .orderBy(asc(schools.name));
      const poolLinks = await this.pools(tx, id);
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
        editable: !b.adminPublishedAt && batchEditable(b, now),
        delegationsEditable: !b.adminPublishedAt && !b.cancelledAt,
        extendable: batchState(b, now) === 'OPEN' && ['PLANNED', 'OPEN'].includes(b.status),
        waveId: b.waveId,
        waveTitle: b.waveId
          ? ((await tx.select().from(tryoutWaves).where(eq(tryoutWaves.id, b.waveId)))[0]?.title ??
            null)
          : null,
        mandiriPackageId: b.mandiriPackageId,
        packages,
        schools: delegated.map((s) => ({
          ...s,
          packageIds: poolLinks.filter((p) => p.schoolId === s.schoolId).map((p) => p.packageId),
        })),
        mandiriPackageIds: poolLinks.filter((p) => p.schoolId === null).map((p) => p.packageId),
        participants,
        resultsState: readiness.resultState,
        resultBlockers: [
          ...readiness.blockers,
          ...(now > b.resultDueAt ? ['RESULT_DEADLINE_EXCEEDED'] : []),
        ],
      };
    });
  }
  async batch(tx: AdminTransaction, id: string, lock?: 'share' | 'update') {
    const query = tx
      .select()
      .from(tryoutBatches)
      .where(and(eq(tryoutBatches.id, id), isNotNull(tryoutBatches.adminTitle)));
    const [b] = lock ? await query.for(lock) : await query;
    if (!b) throw new NotFoundException('Batch Tryout tidak ditemukan.');
    return b;
  }
  private async ready(tx: Pick<AdminTransaction, 'select' | 'execute'>, ids: string[]) {
    for (const id of ids) {
      const issues = await tryoutTechnicalIssues(tx, id);
      if (issues.length)
        throw new BadRequestException({ code: 'TRYOUT_PACKAGE_INCOMPLETE', packageId: id, issues });
    }
    const rows = await tx
      .select({ p: assessmentPackages, eligible: tryoutDistributionEligibility().mapWith(Boolean) })
      .from(assessmentPackages)
      .where(inArray(assessmentPackages.id, ids))
      .for('share');
    if (
      rows.length !== ids.length ||
      rows.some(
        ({ p, eligible }) =>
          p.assessmentType !== 'TRYOUT' || p.status !== 'PUBLISHED' || p.isDemo || !eligible,
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
        const supported = readApprovedPolicy(policy, 'TRYOUT');
        const types = await tx
          .select({ type: questionVersions.questionType })
          .from(packageItems)
          .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
          .where(eq(packageItems.packageId, p.id));
        if (types.some(({ type }) => supported.itemWeights[type] === undefined))
          throw Error('Policy tidak mendukung jenis soal paket.');
      } catch {
        throw new BadRequestException(`Policy penilaian paket ${p.name} belum sah.`);
      }
    }
  }
  private async validatePublished(tx: AdminTransaction, id: string, body: SaveTryoutBatchDto) {
    await this.validateSchools(tx, body.schools);
    const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
    if (new Date(body.closesAt) <= new Date(clock!.now))
      throw new BadRequestException('Waktu tutup batch harus di masa mendatang.');
    await this.ready(tx, body.packageIds);
    if (body.waveId) await this.validateWave(tx, body.waveId, body);
  }
  extend(actor: string, id: string, body: ExtendTryoutBatchDto) {
    const audit = { ...body, previousClosesAt: '' };
    return adminMutation(
      actor,
      'tryout_batch_extended',
      'tryout_batch',
      async (tx) => {
        await lockTryoutBatchSchedule(tx);
        const b = await this.batch(tx, id, 'update');
        const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
        if (body.expectedRevision !== b.configRevision)
          throw new ConflictException('Batch berubah. Muat ulang sebelum menyimpan.');
        validateBatchExtension(b, body.closesAt, new Date(clock!.now));
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
        const old = id ? await this.batch(tx, id, 'update') : null;
        if (old?.adminPublishedAt)
          throw new ConflictException('Konfigurasi gelombang sudah dikunci saat publikasi.');
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
        let waveId = body.waveId ?? null;
        if (old && waveId !== old.waveId)
          throw new ConflictException('Gelombang batch tidak dapat diganti.');
        if (!old || old.waveId) {
          if (waveId && body.newWaveTitle)
            throw new BadRequestException('Pilih atau buat satu gelombang.');
          if (!waveId) {
            if (!body.newWaveTitle?.trim())
              throw new BadRequestException('Batch baru wajib memilih atau membuat gelombang.');
            const [wave] = await tx
              .insert(tryoutWaves)
              .values({
                title: body.newWaveTitle.trim(),
                originalPackageId: body.packageIds[0]!,
                variantPackageId: body.packageIds[1] ?? null,
              })
              .returning();
            waveId = wave!.id;
            await tx
              .insert(tryoutWavePackages)
              .values(body.packageIds.map((packageId) => ({ waveId: wave!.id, packageId })));
          }
          await this.validateWave(tx, waveId, body);
        }
        const values = {
          waveId,
          adminTitle: body.title.trim(),
          packageId: body.packageIds[0]!,
          startsAt: new Date(body.startsAt),
          closesAt: new Date(body.closesAt),
          cutoffAt: new Date(body.closesAt),
          resultDueAt: new Date(Date.parse(body.closesAt) + 72 * 3600000),
          mandiriPackageId: mandiriPackages(body)[0] ?? null,
        };
        const [row] = old
          ? await tx
              .update(tryoutBatches)
              .set({ ...values, configRevision: old.configRevision + 1 })
              .where(eq(tryoutBatches.id, old.id))
              .returning()
          : await tx.insert(tryoutBatches).values(values).returning();
        const batchId = row!.id;
        await tx.delete(tryoutPoolPackages).where(eq(tryoutPoolPackages.batchId, batchId));
        await tx.delete(tryoutAllocationPools).where(eq(tryoutAllocationPools.batchId, batchId));
        await tx
          .delete(tryoutSchoolDelegations)
          .where(eq(tryoutSchoolDelegations.batchId, batchId));
        await tx.delete(tryoutBatchPackages).where(eq(tryoutBatchPackages.batchId, batchId));
        await tx
          .insert(tryoutBatchPackages)
          .values(body.packageIds.map((packageId) => ({ batchId, packageId })));
        if (!body.mandiriPackageIds && body.mandiriPackageId && waveId)
          body = { ...body, mandiriPackageIds: body.packageIds };
        if (body.schools.length)
          await tx.insert(tryoutSchoolDelegations).values(
            body.schools.map((s) => {
              const ids = schoolPackages(s);
              return {
                batchId,
                schoolId: s.schoolId,
                packageId: ids[0]!,
                allocationMode: ids.length === 2 ? 'BALANCED_50_50' : 'SINGLE_PACKAGE',
                variantPackageId: ids.length === 2 ? ids[1]! : null,
              };
            }),
          );
        for (const target of [
          ...body.schools.map((s) => ({ schoolId: s.schoolId, ids: schoolPackages(s) })),
          ...(mandiriPackages(body).length ? [{ schoolId: null, ids: mandiriPackages(body) }] : []),
        ]) {
          const [pool] = await tx
            .insert(tryoutAllocationPools)
            .values({ batchId, schoolId: target.schoolId })
            .returning();
          await tx
            .insert(tryoutPoolPackages)
            .values(target.ids.map((packageId) => ({ poolId: pool!.id, batchId, packageId })));
        }
        return { id: batchId };
      },
      { configuration: body, allocationMethod: 'ADMIN_DELEGATION' },
    );
  }
  async updateDelegations(actor: string, id: string, body: UpdateTryoutDelegationsDto) {
    const b = await this.detail(id);
    if (b.state !== 'DRAFT')
      throw new ConflictException('Penerima dan paket dikunci setelah publikasi.');
    return this.save(
      actor,
      {
        ...body,
        waveId: b.waveId ?? null,
        title: b.title,
        startsAt: b.startsAt,
        closesAt: b.closesAt,
        packageIds: b.packages.map((p) => p.id),
      },
      id,
    );
  }
  private async validateWave(
    tx: AdminTransaction,
    waveId: string,
    body: Pick<
      SaveTryoutBatchDto,
      'packageIds' | 'schools' | 'mandiriPackageId' | 'mandiriPackageIds'
    >,
  ) {
    const [wave] = await tx
      .select()
      .from(tryoutWaves)
      .where(eq(tryoutWaves.id, waveId))
      .for('share');
    const links = await tx
      .select()
      .from(tryoutWavePackages)
      .where(eq(tryoutWavePackages.waveId, waveId));
    if (
      !wave ||
      links.length !== body.packageIds.length ||
      links.some((l) => !body.packageIds.includes(l.packageId))
    )
      throw new BadRequestException('Paket batch harus sama dengan daftar paket gelombang.');
    if (!mandiriPackages(body).length && !body.schools.length)
      throw new BadRequestException('Pilih minimal satu target sekolah atau Mandiri.');
  }

  async waveBlock(
    tx: AdminTransaction,
    studentId: string,
    waveId: string,
    schoolId: string | null,
  ) {
    const claims = await tx
      .select()
      .from(tryoutWaveClaims)
      .where(and(eq(tryoutWaveClaims.waveId, waveId), eq(tryoutWaveClaims.studentId, studentId)));
    return claims.some((c) => waveClaimBlocksSchool(c.schoolId, schoolId));
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
      const b = await this.batch(tx, id, 'update');
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
      const pools = await this.pools(tx, id);
      const delegationInput = delegated.map((s) => ({
        schoolId: s.schoolId,
        packageIds: pools.filter((p) => p.schoolId === s.schoolId).map((p) => p.packageId),
      }));
      await this.validatePublished(tx, id, {
        waveId: b.waveId,
        title: b.adminTitle!,
        startsAt: b.startsAt.toISOString(),
        closesAt: b.closesAt.toISOString(),
        packageIds: packages.map((p) => p.packageId),
        mandiriPackageIds: pools.filter((p) => p.schoolId === null).map((p) => p.packageId),
        schools: delegationInput,
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
        const b = await this.batch(tx, id, 'update');
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
  stop(actor: string, id: string, revision: number, reason: string) {
    if (!reason.trim()) throw new BadRequestException('Alasan penghentian wajib diisi.');
    return adminMutation(
      actor,
      'tryout_batch_stopped',
      'tryout_batch',
      async (tx) => {
        await lockTryoutBatchSchedule(tx);
        const b = await this.batch(tx, id, 'update');
        const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
        const now = new Date(clock!.now);
        if (revision !== b.configRevision)
          throw new ConflictException('Batch berubah. Muat ulang sebelum menyimpan.');
        if (!batchStoppable(b, now))
          throw new ConflictException('Hanya batch yang sedang berlangsung yang dapat dihentikan.');
        await tx
          .update(tryoutBatches)
          .set({
            cancelledAt: sql`clock_timestamp()`,
            cancellationReason: reason.trim(),
            configRevision: b.configRevision + 1,
          })
          .where(eq(tryoutBatches.id, id));
        await tx
          .update(assessmentAttempts)
          .set({ status: 'CANCELLED', finishedAt: sql`clock_timestamp()` })
          .where(
            and(
              eq(assessmentAttempts.tryoutBatchId, id),
              eq(assessmentAttempts.status, 'IN_PROGRESS'),
            ),
          );
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
      .leftJoin(
        classStudentBans,
        and(
          eq(classStudentBans.classId, classMemberships.classId),
          eq(classStudentBans.studentUserId, classMemberships.studentUserId),
          isNull(classStudentBans.unbannedAt),
        ),
      )
      .where(
        and(
          eq(classMemberships.studentUserId, studentId),
          isNull(classMemberships.leftAt),
          isNull(classes.archivedAt),
          isNull(classStudentBans.id),
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
        .where(
          and(
            eq(assessmentAttempts.studentId, studentId),
            isNotNull(assessmentAttempts.tryoutBatchId),
          ),
        );
      const byBatch = new Map(attempts.map((attempt) => [attempt.batchId, attempt]));
      const { ready } = await releases.studentPublications(attempts, now, tx);
      const waveBatchIds = batches.filter((b) => b.waveId).map((b) => b.id);
      const [recipients, claims] = await Promise.all([
        batches.length
          ? tx
              .select()
              .from(tryoutSchoolDelegations)
              .where(
                inArray(
                  tryoutSchoolDelegations.batchId,
                  batches.map((b) => b.id),
                ),
              )
          : [],
        waveBatchIds.length
          ? tx.select().from(tryoutWaveClaims).where(eq(tryoutWaveClaims.studentId, studentId))
          : [],
      ]);
      const used = (waveId: string, schoolId: string | null) =>
        claims.some((c) => c.waveId === waveId && waveClaimBlocksSchool(c.schoolId, schoolId));
      const items = [];
      for (const b of batches) {
        const attempt = byBatch.get(b.id);
        let delegated = [
          ...new Map(
            memberships
              .filter((m) => m.schoolActive)
              .map((m) => [m.schoolId, { schoolId: m.schoolId, schoolName: m.schoolName }]),
          ).values(),
        ];
        let startBlockedReason: string | null = null;
        {
          delegated = delegated.filter((m) =>
            recipients.some((r) => r.batchId === b.id && r.schoolId === m.schoolId),
          );
          const allowed = [];
          for (const m of delegated) {
            if (!b.waveId || !used(b.waveId, m.schoolId)) allowed.push(m);
          }
          if (delegated.length && !allowed.length)
            startBlockedReason = 'Kesempatan gelombang sudah digunakan.';
          if (allowed.length) delegated = allowed;
        }
        const mandiri = !memberships.length && !!b.mandiriPackageId;
        if (b.waveId && mandiri && used(b.waveId, null))
          startBlockedReason = 'Kesempatan gelombang sudah digunakan.';
        if (!attempt && !mandiri && !delegated.length) continue;
        items.push({
          startBlockedReason,
          id: b.id,
          title: b.adminTitle!,
          startsAt: b.startsAt.toISOString(),
          closesAt: b.closesAt.toISOString(),
          resultDueAt: b.resultDueAt.toISOString(),
          durationSeconds: TRYOUT_DURATION_SECONDS,
          state: batchState(b, now),
          schools: delegated,
          mandiri,
          attemptId: attempt?.id ?? null,
          attemptStatus: attempt?.status ?? null,
          resultState: tryoutResultState(
            attempt?.status,
            !!attempt && ready.has(attempt.id),
            b.resultDueAt,
            now,
          ),
          canResume:
            attempt?.status === 'IN_PROGRESS' &&
            now < b.closesAt &&
            !!attempt.deadlineAt &&
            now < attempt.deadlineAt,
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
    // Starts only read the batch. Share the lock across students while excluding Admin edits.
    const b = await this.batch(tx, batchId, 'share');
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
    let contextSchool: string | null = null;
    if (!memberships.length) {
      if (schoolId) throw new BadRequestException('Sekolah tidak sesuai keanggotaan siswa.');
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
      contextSchool = selected.schoolId;
    }
    const [pool] = await tx
      .select()
      .from(tryoutAllocationPools)
      .where(
        and(
          eq(tryoutAllocationPools.batchId, batchId),
          contextSchool
            ? eq(tryoutAllocationPools.schoolId, contextSchool)
            : isNull(tryoutAllocationPools.schoolId),
        ),
      )
      .for('update');
    const links = pool
      ? await tx.select().from(tryoutPoolPackages).where(eq(tryoutPoolPackages.poolId, pool.id))
      : [];
    const counts = await tx
      .select({ packageId: tryoutStudentAssignments.packageId, n: count() })
      .from(tryoutStudentAssignments)
      .where(
        and(
          eq(tryoutStudentAssignments.batchId, batchId),
          contextSchool
            ? eq(tryoutStudentAssignments.schoolId, contextSchool)
            : isNull(tryoutStudentAssignments.schoolId),
        ),
      )
      .groupBy(tryoutStudentAssignments.packageId);
    const packageId = links.length
      ? balancedPoolPackage(
          links.map((l) => ({
            packageId: l.packageId,
            n: Number(counts.find((c) => c.packageId === l.packageId)?.n ?? 0),
          })),
        )
      : null;
    if (!packageId) throw new BadRequestException('Batch tidak tersedia untuk kelompok siswa ini.');
    if (b.waveId) {
      if (await this.waveBlock(tx, studentId, b.waveId, contextSchool))
        throw new ConflictException('Kesempatan gelombang ini sudah digunakan.');
    }
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
