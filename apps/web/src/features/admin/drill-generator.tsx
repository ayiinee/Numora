'use client';

import { Button, Dialog } from '@tka/ui';
import { useEffect, useRef, useState } from 'react';
import { useAdminAccessError } from './admin-workspace';
import { createGeneratorPackage, drillGeneratorCatalog } from './generator-package-api';
import { generatorError } from './generator-package-form';
import type {
  DrillGeneratorCatalogDto,
  DrillGeneratorManifestDto,
  GeneratorPackageDto,
} from './generated-types';

const messages: Record<string, string> = {
  DRILL_VARIANT_GENERATION_DISABLED: 'Pembuatan varian Drill belum diaktifkan di lingkungan ini.',
  DRILL_VARIANT_AI_RUNTIME_UNAVAILABLE:
    'AI Service belum menyediakan profil runtime dan digest image untuk varian Drill.',
  GENERATOR_HTTP_REJECTED: 'AI Service belum siap menerima permintaan.',
  GENERATOR_NOT_CONFIGURED: 'Koneksi ke AI Service belum dikonfigurasi.',
  DRILL_SOURCE_CONTEXT_UNAVAILABLE:
    'Paket belum terhubung ke konteks LEVEL dan arm original yang disetujui.',
  DRILL_SOURCE_CURRICULUM_APPROVAL_REQUIRED:
    'Persetujuan Curriculum paket sumber belum sesuai dengan susunan soal.',
  DRILL_SOURCE_SCORING_POLICY_REQUIRED: 'Kebijakan penilaian yang disetujui belum tersedia.',
  DRILL_SOURCE_COUNT_INVALID: 'Paket sumber harus berisi 10 soal.',
  DRILL_SOURCE_DUPLICATE_FAMILY: 'Setiap soal wajib berasal dari family yang berbeda.',
  DRILL_SOURCE_ANCHORS_UNAPPROVED: 'Curriculum belum menyetujui tiga versi anchor untuk paket ini.',
  DRILL_ITEM_NOT_ORIGINAL: 'Versi soal ini berasal dari varian.',
  DRILL_ITEM_LEVEL_MISMATCH: 'Soal berada di luar level atau konteks Drill.',
  DRILL_ITEM_CONTENT_OR_TAXONOMY_INCOMPLETE:
    'Lengkapi konten, review, dan pemetaan kurikulum soal.',
  DRILL_ITEM_RUBRIC_NOT_SEALED: 'Rubrik soal belum disegel atau pin rubrik berbeda.',
  DRILL_FOCAL_CONFIG_AMBIGUOUS:
    'Beberapa konfigurasi disetujui untuk soal ini. Selesaikan pemetaan konfigurasi.',
  DRILL_FOCAL_CONFIG_MISSING:
    'Registrasi konfigurasi AI untuk versi dan konteks ini belum tersedia.',
  DRILL_FOCAL_CONFIG_NOT_SEALED: 'Registrasi konfigurasi AI belum berstatus SEALED.',
  DRILL_FOCAL_CONFIG_DIGEST_MISMATCH: 'Digest konfigurasi AI berbeda dari snapshot terdaftar.',
  DRILL_FOCAL_MAPPING_PIN_MISMATCH: 'Pin versi original, family, sumber atau rubrik tidak cocok.',
  DRILL_FOCAL_CONFIG_APPROVAL_REVOKED: 'Persetujuan konfigurasi AI telah dicabut.',
  DRILL_FOCAL_SEALED_CONFIG_APPROVAL_REQUIRED:
    'Soal memerlukan satu konfigurasi AI SEALED dengan persetujuan aktif.',
};
export function drillGeneratorBlocker(code: string) {
  return messages[code] ?? code;
}

export function DrillGeneratorDialog({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const onAccessError = useAdminAccessError();
  const [catalog, setCatalog] = useState<DrillGeneratorCatalogDto | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [roles, setRoles] = useState<Record<string, 'ANCHOR' | 'FOCAL'>>({});
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const request = useRef<{ body: string; key: string } | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    setCatalog(null);
    setError('');
    void drillGeneratorCatalog(token).then(
      (value) => {
        if (active) setCatalog(value);
      },
      (cause) => {
        if (!active) return;
        onAccessError(cause);
        setError(generatorError(cause, 'Preflight Drill belum dapat dimuat.'));
      },
    );
    return () => {
      active = false;
    };
  }, [token, refresh, onAccessError]);
  const source = catalog?.items.find((item) => item.id === sourceId);
  const anchors = source?.items.filter((item) => roles[item.questionVersionId] === 'ANCHOR') ?? [];
  const focal = source?.items.filter((item) => roles[item.questionVersionId] === 'FOCAL') ?? [];
  const rosterValid =
    anchors.length === 3 &&
    focal.length === 7 &&
    anchors.every((item) => source?.anchorIds.includes(item.questionVersionId)) &&
    focal.every((item) => !source?.anchorIds.includes(item.questionVersionId));
  const canGenerate =
    !!source &&
    !!catalog?.runtime &&
    !!title.trim() &&
    rosterValid &&
    !catalog.blockers.length &&
    !source.blockers.length &&
    source.items.every((item) => !item.blockers.length);
  async function generate() {
    if (!source || !canGenerate || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const payload = {
      assessmentType: 'DRILL' as const,
      title: title.trim(),
      sourcePackageId: source.id,
      sourceDigest: source.sourceDigest,
      anchorQuestionVersionIds: anchors.map((item) => item.questionVersionId),
      focalQuestionVersionIds: focal.map((item) => item.questionVersionId),
    };
    const body = JSON.stringify(payload);
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    try {
      const group = await createGeneratorPackage(token, request.current.key, payload);
      onCreated(group.id);
    } catch (cause) {
      onAccessError(cause);
      setError(generatorError(cause, 'Varian Drill belum dapat dibuat.'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title="Generate Varian Drill"
      description="Pilih paket original terbit dan tetapkan peran setiap versi soal."
      onClose={onClose}
      pending={busy}
      className="admin-management-dialog generator-dialog"
      actions={
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Tutup
          </Button>
          <Button
            type="submit"
            form="drill-generator-form"
            disabled={!canGenerate || busy}
            loading={busy}
          >
            Generate Variant
          </Button>
        </>
      }
    >
      <form
        id="drill-generator-form"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
        aria-busy={busy}
      >
        {error && <p role="alert">{error}</p>}
        {(!catalog || error) && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Muat ulang preflight
          </Button>
        )}
        {!catalog && !error && <p role="status">Memuat paket Drill…</p>}
        {catalog && (
          <>
            {catalog.blockers.map((code) => (
              <p role="status" key={code}>
                {drillGeneratorBlocker(code)}
              </p>
            ))}
            {!catalog.items.length ? (
              <p>Belum ada paket Drill original terbit.</p>
            ) : (
              <fieldset disabled={busy} className="generator-fields">
                <label htmlFor="drill-generator-source">Paket Drill original</label>
                <select
                  id="drill-generator-source"
                  value={sourceId}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    const selected = catalog.items.find((item) => item.id === event.target.value);
                    setTitle(selected ? `${selected.name} · Varian`.slice(0, 160) : '');
                    setRoles({});
                  }}
                >
                  <option value="">Pilih paket</option>
                  {catalog.items.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} · {item.levelLabel} · {item.items.length}/10 soal
                    </option>
                  ))}
                </select>
                {source && (
                  <>
                    <label htmlFor="drill-generator-title">Nama varian</label>
                    <input
                      id="drill-generator-title"
                      maxLength={160}
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                    <h3>Preflight dan pemetaan</h3>
                    <p>
                      {source.status} · Versi {source.packageVersion} · {source.levelLabel}
                    </p>
                    {source.contextId && (
                      <p>
                        Context {source.contextId} · Revisi {source.contextRevision}
                      </p>
                    )}
                    {catalog.runtime && (
                      <p>
                        Runtime {catalog.runtime.runtimeProfile}
                        <br />
                        Image <code>{catalog.runtime.imageDigest}</code>
                      </p>
                    )}
                    {source.blockers.length > 0 && (
                      <ul>
                        {source.blockers.map((code) => (
                          <li key={code}>{drillGeneratorBlocker(code)}</li>
                        ))}
                      </ul>
                    )}
                    <p role="status">
                      Anchor {anchors.length}/3 · Focal {focal.length}/7
                    </p>
                    <ol className="generator-drill-roster">
                      {source.items.map((item) => {
                        const anchor = source.anchorIds.includes(item.questionVersionId);
                        return (
                          <li key={item.questionVersionId}>
                            <label htmlFor={`role-${item.questionVersionId}`}>
                              Soal {item.displayOrder} · {anchor ? 'Anchor disetujui' : 'Focal'}
                            </label>
                            <select
                              id={`role-${item.questionVersionId}`}
                              value={roles[item.questionVersionId] ?? ''}
                              onChange={(event) => {
                                const role = event.target.value;
                                setRoles((current) => {
                                  const next = { ...current };
                                  if (role === 'ANCHOR' || role === 'FOCAL')
                                    next[item.questionVersionId] = role;
                                  else delete next[item.questionVersionId];
                                  return next;
                                });
                              }}
                            >
                              <option value="">Pilih peran</option>
                              <option value="ANCHOR" disabled={!anchor}>
                                Anchor
                              </option>
                              <option value="FOCAL" disabled={anchor}>
                                Focal
                              </option>
                            </select>
                            <details>
                              <summary>Versi, family, dan rubrik</summary>
                              <dl>
                                <dt>Versi original</dt>
                                <dd>{item.questionVersionId}</dd>
                                <dt>Family</dt>
                                <dd>{item.familyId}</dd>
                                <dt>Rubrik</dt>
                                <dd>{item.rubricVersionId ?? 'Belum tersedia'}</dd>
                                {item.mapping && (
                                  <>
                                    <dt>Konfigurasi SEALED</dt>
                                    <dd>
                                      Versi {item.mapping.configVersion} ·{' '}
                                      {item.mapping.configDigest}
                                    </dd>
                                    <dt>Approval aktif</dt>
                                    <dd>{item.mapping.approvalId}</dd>
                                    <dt>Seed</dt>
                                    <dd>
                                      {item.mapping.mode === 'NUMERIC'
                                        ? 'Dipin pada generation'
                                        : 'Reservasi stok'}
                                    </dd>
                                  </>
                                )}
                              </dl>
                            </details>
                            {item.blockers.map((code) => (
                              <p role="status" key={code}>
                                {drillGeneratorBlocker(code)}
                              </p>
                            ))}
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </fieldset>
            )}
          </>
        )}
      </form>
    </Dialog>
  );
}

export function DrillGeneratorLineage({
  manifest,
  requests,
}: {
  manifest: DrillGeneratorManifestDto;
  requests?: GeneratorPackageDto['requests'];
}) {
  return (
    <details className="generator-identity generator-drill-lineage">
      <summary>Lineage dan status soal</summary>
      <dl>
        <dt>Versi paket original</dt>
        <dd>{manifest.sourcePackageVersion}</dd>
        <dt>Context LEVEL</dt>
        <dd>
          {manifest.contextId} · Revisi {manifest.contextRevision}
        </dd>
        <dt>Manifest</dt>
        <dd>{manifest.manifestDigest}</dd>
        <dt>Kebijakan penilaian</dt>
        <dd>{manifest.policyVersionId}</dd>
        <dt>Runtime</dt>
        <dd>{manifest.runtime.runtimeProfile}</dd>
        <dt>Image</dt>
        <dd>{manifest.runtime.imageDigest}</dd>
        <dt>Persetujuan Curriculum</dt>
        <dd>{manifest.curriculumApprovalReference ?? 'Belum dicatat'}</dd>
      </dl>
      <ol className="generator-drill-roster">
        {manifest.items.map((item) => {
          const request = requests?.find((entry) => entry.id === item.requestId);
          const state =
            request?.executionStatus ??
            (request?.dispatchGeneration && request.dispatchGeneration > 1
              ? 'Percobaan ulang'
              : request?.status);
          return (
            <li key={item.displayOrder}>
              <details>
                <summary>
                  Soal {item.displayOrder} · {item.role === 'ANCHOR' ? 'Anchor original' : 'Focal'}
                  {state ? ` · ${state}` : ''}
                </summary>
                <dl>
                  <dt>Versi original</dt>
                  <dd>{item.parentQuestionVersionId}</dd>
                  <dt>Family</dt>
                  <dd>{item.familyId}</dd>
                  <dt>Rubrik</dt>
                  <dd>{item.rubricVersionId}</dd>
                  <dt>Hash konten original</dt>
                  <dd>{item.contentHash}</dd>
                  {item.requestId && (
                    <>
                      <dt>Request</dt>
                      <dd>{item.requestId}</dd>
                    </>
                  )}
                  {request?.failureCode && (
                    <>
                      <dt>Kegagalan</dt>
                      <dd>{request.failureCode}</dd>
                    </>
                  )}
                  {item.mapping && (
                    <>
                      <dt>Seed</dt>
                      <dd>{item.seed ?? 'Reservasi stok'}</dd>
                      <dt>Config digest</dt>
                      <dd>{item.mapping.configDigest}</dd>
                      <dt>Approval konfigurasi</dt>
                      <dd>{item.mapping.approvalId}</dd>
                    </>
                  )}
                  {item.artifactDigest && (
                    <>
                      <dt>Artifact</dt>
                      <dd>{item.artifactDigest}</dd>
                    </>
                  )}
                  {item.questionVersionId && (
                    <>
                      <dt>Versi canonical</dt>
                      <dd>{item.questionVersionId}</dd>
                    </>
                  )}
                  {item.mediaReceiptIds?.length ? (
                    <>
                      <dt>Receipt media</dt>
                      <dd>{item.mediaReceiptIds.join(', ')}</dd>
                    </>
                  ) : null}
                  {item.questionVersionId && (
                    <>
                      <dt>Reviewer</dt>
                      <dd>{item.reviewedBy ?? 'Belum ditinjau'}</dd>
                    </>
                  )}
                </dl>
              </details>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
