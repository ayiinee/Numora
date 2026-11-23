'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminMessage } from './admin-presentation';
import { withAdminWorkspace, useAdminAccessError } from './admin-workspace';
import { assessmentPath } from './assessment-routes';
import {
  createTryoutVariant,
  getTryoutVariantOptions,
  getTryoutVariantProcess,
  materializeTryoutVariant,
} from './tryout-variant-api';
import type { TryoutVariantOptionsDto, TryoutVariantProcessDto } from './generated-types';

export const AdminTryoutVariantWizard = withAdminWorkspace(TryoutVariantWizard, 'content');

function TryoutVariantWizard({ packageId }: { packageId: string }) {
  const { state } = useAuth();
  const accessError = useAdminAccessError();
  const [options, setOptions] = useState<TryoutVariantOptionsDto | null>(null);
  const [anchors, setAnchors] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [process, setProcess] = useState<TryoutVariantProcessDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [poll, setPoll] = useState(0);

  useEffect(() => {
    if (state.status !== 'ready') return;
    let active = true;
    setLoading(true);
    getTryoutVariantOptions(state.session.access_token, packageId, anchors)
      .then((value) => {
        if (active) {
          setOptions(value);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) {
          accessError(cause);
          setError(cause instanceof Error ? cause.message : 'Kelayakan varian gagal dimuat.');
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [state, packageId, anchors, accessError]);

  useEffect(() => {
    if (!process || process.status === 'IMPORTED' || process.status === 'FAILED') return;
    const timer = window.setTimeout(() => setPoll((value) => value + 1), 3000);
    return () => window.clearTimeout(timer);
  }, [process]);

  useEffect(() => {
    if (!process || !poll || state.status !== 'ready') return;
    let active = true;
    getTryoutVariantProcess(state.session.access_token, process.id)
      .then((value) => active && setProcess(value))
      .catch(
        (cause) =>
          active &&
          setError(cause instanceof Error ? cause.message : 'Status proses gagal dimuat.'),
      );
    return () => {
      active = false;
    };
  }, [poll, process, state]);

  const selected = useMemo(() => new Set(anchors), [anchors]);
  if (state.status !== 'ready') return null;
  const token = state.session.access_token;

  async function start() {
    if (!options?.canGenerate || anchors.length !== 5 || busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await createTryoutVariant(token, packageId, {
        anchorQuestionVersionIds: anchors,
        operationKey: crypto.randomUUID(),
        expectedRevision: options.contentRevision,
      });
      setProcess(value);
      setStep(4);
    } catch (cause) {
      accessError(cause);
      setError(cause instanceof Error ? cause.message : 'Proses varian gagal dimulai.');
    } finally {
      setBusy(false);
    }
  }

  async function materialize() {
    if (!process || busy) return;
    setBusy(true);
    try {
      const value = await materializeTryoutVariant(token, process.id);
      setProcess(await getTryoutVariantProcess(token, process.id));
      window.location.href = assessmentPath('TRYOUT', value.id);
    } catch (cause) {
      accessError(cause);
      setError(cause instanceof Error ? cause.message : 'Paket varian gagal disiapkan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminFrame
      title="Generate varian paket Tryout"
      description="Pilih lima anchor. Sistem membuat 25 soal focal melalui mapping generator yang telah disetujui."
      icon="target"
      management
      minimalHeader
      fullWidth
    >
      <Link className="assessment-back-link" href={assessmentPath('TRYOUT', packageId)}>
        ← Kembali ke paket original
      </Link>
      <Card className="tryout-variant-wizard">
        <nav aria-label="Tahap generate varian" className="tryout-variant-steps">
          {[
            ['1', 'Paket original'],
            ['2', 'Pilih 5 anchor'],
            ['3', 'Konfigurasi generator'],
            ['4', 'Konfirmasi'],
          ].map(([number, label]) => (
            <span key={number} aria-current={step === Number(number) ? 'step' : undefined}>
              {number}. {label}
            </span>
          ))}
        </nav>
        {error && <AdminMessage error message={error} />}
        {loading && <p role="status">Memeriksa paket dan mapping generator…</p>}
        {!loading && options && (
          <>
            {step === 1 && (
              <section>
                <h2>{options.packageName}</h2>
                <p>
                  Versi {options.packageVersion} · Revisi {options.contentRevision} ·{' '}
                  {options.questions.length}/30 soal
                </p>
                <p>
                  Mapping generator tersedia:{' '}
                  {options.focalQuestions.filter((question) => question.mapping).length}/
                  {options.questions.length}
                </p>
                <p>
                  Status:{' '}
                  <Badge variant={options.status === 'PUBLISHED' ? 'success' : 'default'}>
                    {options.status}
                  </Badge>
                </p>
                {options.blockers.length > 0 && (
                  <p role="alert">Belum siap: {options.blockers.join(', ')}</p>
                )}
                <Button disabled={options.status !== 'PUBLISHED'} onClick={() => setStep(2)}>
                  Pilih anchor
                </Button>
              </section>
            )}
            {step === 2 && (
              <section>
                <h2>Pilih 5 anchor</h2>
                <p>{anchors.length} dari 5 dipilih. Anchor tidak dikirim ke AI service.</p>
                <div className="tryout-variant-question-list">
                  {options.questions.map((question) => (
                    <label key={question.id}>
                      <input
                        type="checkbox"
                        checked={selected.has(question.id)}
                        disabled={!selected.has(question.id) && anchors.length >= 5}
                        onChange={(event) =>
                          setAnchors((current) =>
                            event.target.checked
                              ? [...current, question.id]
                              : current.filter((id) => id !== question.id),
                          )
                        }
                      />
                      Soal {question.displayOrder}: {question.label}
                    </label>
                  ))}
                </div>
                <div className="admin-content-actions">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Sebelumnya
                  </Button>
                  <Button disabled={anchors.length !== 5} onClick={() => setStep(3)}>
                    Lanjutkan
                  </Button>
                </div>
              </section>
            )}
            {step === 3 && (
              <section>
                <h2>Konfigurasi generator</h2>
                <p>
                  Mapping generator dibaca dari approval per soal. Tidak ada upload atau fungsi
                  global.
                </p>
                {(() => {
                  const profiles = new Map(
                    options.focalQuestions
                      .filter((question) => question.mapping)
                      .map((question) => {
                        const mapping = question.mapping!;
                        return [
                          `${mapping.label}:${mapping.serviceContract}:${mapping.mode}:${mapping.configVersion}`,
                          `${mapping.label} · ${mapping.serviceContract} · ${mapping.mode} · v${mapping.configVersion}`,
                        ] as const;
                      }),
                  );
                  return profiles.size === 1 ? (
                    <p>
                      Semua {options.focalQuestions.length} focal memakai{' '}
                      {Array.from(profiles.values())[0]}.
                    </p>
                  ) : (
                    <ul>
                      {options.focalQuestions.map((question) => (
                        <li key={question.id}>
                          Soal {question.displayOrder}:{' '}
                          {question.mapping
                            ? `${question.mapping.label} · ${question.mapping.serviceContract} · ${question.mapping.mode} · v${question.mapping.configVersion}`
                            : question.blockers.join(', ')}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                <div className="admin-content-actions">
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    Sebelumnya
                  </Button>
                  <Button disabled={!options.canGenerate} onClick={() => setStep(4)}>
                    Lanjutkan
                  </Button>
                </div>
              </section>
            )}
            {step === 4 && (
              <section>
                <h2>Konfirmasi proses</h2>
                <p>
                  5 anchor + {options.focalQuestions.length} focal. Anchor tidak dikirim ke AI
                  service. Hasil disimpan sebagai paket DRAFT dan wajib melalui review.
                </p>
                <p>
                  Anchor:{' '}
                  {anchors
                    .map(
                      (id) => options.questions.find((question) => question.id === id)?.label ?? id,
                    )
                    .join(' · ')}
                </p>
                <p>
                  Mapping:{' '}
                  {[
                    ...new Set(
                      options.focalQuestions.map(
                        (question) =>
                          question.mapping &&
                          `${question.mapping.serviceContract} · ${question.mapping.mode} · v${question.mapping.configVersion}`,
                      ),
                    ),
                  ]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
                {!process && (
                  <Button
                    disabled={!options.canGenerate || busy}
                    loading={busy}
                    onClick={() => void start()}
                  >
                    Mulai generate varian
                  </Button>
                )}
                {process && (
                  <>
                    <p role="status">
                      Status: <Badge>{process.status}</Badge>
                    </p>
                    <p>
                      {
                        process.requests.filter(
                          (request) => request.executionStatus === 'SUCCEEDED',
                        ).length
                      }
                      /25 request selesai.
                    </p>
                    {process.status === 'READY' && (
                      <Button disabled={busy} loading={busy} onClick={() => void materialize()}>
                        Siapkan paket DRAFT
                      </Button>
                    )}
                    {process.generatedPackageId && (
                      <Link
                        className="button-link"
                        href={assessmentPath('TRYOUT', process.generatedPackageId)}
                      >
                        Buka paket varian
                      </Link>
                    )}
                  </>
                )}
                <Button variant="secondary" onClick={() => setStep(3)}>
                  Kembali
                </Button>
              </section>
            )}
          </>
        )}
      </Card>
    </AdminFrame>
  );
}
